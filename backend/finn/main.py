import hashlib
import json
from datetime import date, datetime, time as dtime, timedelta

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from . import digest, filings, llm, market
from .config import settings
from .sources import nse, prices

app = FastAPI(title="FINN API")
app.add_middleware(
    CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"], allow_headers=["*"]
)


def _portfolio() -> dict:
    pf = json.loads((settings.data_dir / "portfolio.json").read_text())
    have = {p["symbol"] for p in pf["portfolio"]}
    pf["portfolio"] += [{"symbol": s, "name": s, "sector": "", "size": ""} for s in settings.extra_symbols if s not in have]
    return pf


def client_id(request: Request) -> str:
    """Hashed caller IP, for per-visitor rate limits. The raw IP is never stored."""
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (
        request.client.host if request.client else "unknown"
    )
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


@app.get("/api/health")
def health():
    return {"ok": True, "llm_mode": "live" if settings.any_live else "mock", "public_demo": settings.public_demo}


@app.get("/api/portfolio")
def portfolio():
    return _portfolio()


@app.get("/api/digest")
def get_digest(
    hours: int = Query(24, ge=1, le=720),
    as_of: date | None = Query(None, description="Show the briefing as it looked at the end of this day"),
    refresh: bool = False,
):
    now = nse.now_ist()
    if as_of and as_of > now.date():
        raise HTTPException(400, "as_of can't be in the future")
    end = now if not as_of or as_of == now.date() else datetime.combine(as_of, dtime(23, 59, 59), nse.IST)
    start = end - timedelta(hours=hours)

    pf = _portfolio()["portfolio"]
    meta = {p["symbol"]: p for p in pf}
    items, status = nse.announcements(start.date(), end.date(), set(meta), force=refresh)
    out = digest.build(items, end, hours, meta, filings.load_reads())   # recorded reads only; reading is offline
    out["source"] = status.__dict__
    out["is_live_now"] = end is now
    return out


@app.get("/api/market")
def get_market(as_of: date | None = None):
    """End-of-day signals (close, day move, volume multiple) for the last ~2 weeks of sessions.
    Thresholds are applied in the browser, so the investor's settings never need a round trip."""
    end = as_of or nse.now_ist().date()
    syms = [p["symbol"] for p in _portfolio()["portfolio"]]
    bars, status = prices.eod(syms, end - timedelta(days=60), end)
    last = max((b[-1][0] for b in bars.values()), default=None)
    return {"source": status.source, "as_of": status.as_of, "through": last, "message": status.message,
            "provider": "Yahoo Finance (yfinance), NSE tickers, unadjusted close",
            "sessions": market.compact(bars, (end - timedelta(days=14)).isoformat())}


@app.get("/api/ledger")
def ledger():
    return llm.ledger_summary()
