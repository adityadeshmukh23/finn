"""End-of-day close and volume from Yahoo Finance (yfinance, `SYMBOL.NS`), with a recorded snapshot.

Only raw daily bars live here. Alert maths (volume multiple, day move) is in market.py so the API,
the static build and the tests share one implementation, and the browser mirrors it with the
investor's own thresholds.
"""
import json
import time
import warnings
from datetime import date, datetime, timedelta

from ..config import settings
from .nse import IST, SourceStatus

SNAPSHOT = "prices/eod.json"
_mem: dict[tuple, tuple[float, dict]] = {}    # (symbols, start, end) -> (fetched_at, bars)


class PriceError(Exception):
    pass


def fetch(symbols: list[str], start: date, end: date) -> dict[str, list[list]]:
    """{SYMBOL: [[YYYY-MM-DD, close, volume], ...]} for sessions in [start, end]. Missing tickers are left out."""
    try:
        import yfinance as yf
    except ImportError as e:
        raise PriceError("yfinance not installed") from e
    tickers = [f"{s}.NS" for s in symbols]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")   # pandas deprecation noise from inside yfinance
            df = yf.download(tickers, start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(),
                             progress=False, auto_adjust=False, group_by="ticker", threads=False)
    except Exception as e:   # yfinance raises a zoo of network/parse errors
        raise PriceError(f"Yahoo Finance: {type(e).__name__}") from e
    if df is None or df.empty:
        raise PriceError("Yahoo Finance returned no data")
    out: dict[str, list[list]] = {}
    for s, t in zip(symbols, tickers):
        try:
            d = df[t].dropna(subset=["Close", "Volume"])
        except KeyError:
            continue
        rows = [[i.date().isoformat(), round(float(r.Close), 2), int(r.Volume)] for i, r in d.iterrows()]
        if rows:
            out[s] = rows
    if not out:
        raise PriceError("Yahoo Finance had no bars for these tickers")
    return out


def load_snapshot() -> dict | None:
    p = settings.snapshot_dir / SNAPSHOT
    return json.loads(p.read_text()) if p.exists() else None


def record_snapshot(symbols: list[str], start: date, end: date) -> dict:
    bars = fetch(symbols, start, end)
    out = {"fetched_at": datetime.now(IST).isoformat(timespec="seconds"), "from": start.isoformat(),
           "to": end.isoformat(), "source": "Yahoo Finance (yfinance), NSE tickers, unadjusted close", "bars": bars}
    p = settings.snapshot_dir / SNAPSHOT
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, separators=(",", ":")))
    return out


def eod(symbols: list[str], start: date, end: date) -> tuple[dict[str, list[list]], SourceStatus]:
    """Live bars (cached for PRICES_TTL), else the snapshot, with a status the UI shows as a badge."""
    key = (tuple(sorted(symbols)), start, end)
    hit = _mem.get(key)
    if hit and time.time() - hit[0] < settings.prices_ttl:
        return hit[1], SourceStatus("cache", datetime.fromtimestamp(hit[0], IST).isoformat(timespec="seconds"))
    try:
        bars = fetch(symbols, start, end)
        _mem[key] = (time.time(), bars)
        missing = sorted(set(symbols) - set(bars))
        msg = f"No price data for {', '.join(missing)}" if missing else ""
        return bars, SourceStatus("live", datetime.now(IST).isoformat(timespec="seconds"), msg)
    except PriceError as e:
        snap = load_snapshot()
        if not snap:
            return {}, SourceStatus("unavailable", None, f"Prices unavailable ({e}) and no snapshot recorded")
        bars = {s: [b for b in snap["bars"].get(s, []) if b[0] <= end.isoformat()] for s in symbols}
        bars = {s: b for s, b in bars.items() if b}
        return bars, SourceStatus("snapshot", snap["fetched_at"], f"Prices unavailable ({e}). Showing recorded data.",
                                  [snap["from"], snap["to"]])
