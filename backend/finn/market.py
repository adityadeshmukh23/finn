"""Price and volume signals from end-of-day bars. All the arithmetic lives here, in code, tested.

The browser only compares these numbers with the investor's thresholds (volume multiple, day move),
so changing a threshold never needs a server, and the numbers on screen are the ones tested here.
"""
from statistics import fmean

LOOKBACK = 20        # sessions in the "recent average" for volume
MIN_HISTORY = 10     # fewer prior sessions than this and we don't claim a multiple


def signals(bars: list[list], lookback: int = LOOKBACK) -> list[dict]:
    """bars: [[date, close, volume], ...] in date order -> one row per session.

    chg_pct: close vs the previous session's close. vol_x: volume / mean volume of the previous
    `lookback` sessions (today excluded, so a spike doesn't dilute its own baseline). None where
    there isn't enough history or the baseline is zero."""
    out = []
    for i, (d, close, vol) in enumerate(bars):
        prev = bars[max(0, i - lookback):i]
        base = fmean(b[2] for b in prev) if len(prev) >= MIN_HISTORY else 0
        prev_close = bars[i - 1][1] if i else None
        out.append({
            "date": d,
            "close": close,
            "chg_pct": round((close / prev_close - 1) * 100, 2) if prev_close else None,
            "volume": vol,
            "avg_volume": round(base) if base else None,
            "vol_x": round(vol / base, 2) if base else None,
        })
    return out


def compact(bars_by_symbol: dict[str, list[list]], since: str) -> dict[str, list[list]]:
    """Signals for sessions on or after `since`, as [date, close, chg_pct, vol_x] rows (small enough to bundle)."""
    out = {}
    for sym, bars in bars_by_symbol.items():
        rows = [[s["date"], s["close"], s["chg_pct"], s["vol_x"]] for s in signals(bars) if s["date"] >= since]
        if rows:
            out[sym] = rows
    return out
