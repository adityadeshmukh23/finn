"""NSE corporate announcements, with a recorded snapshot as a silent fallback."""
import json
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from .. import http
from ..config import settings

IST = timezone(timedelta(hours=5, minutes=30))
BASE = "https://www.nseindia.com/api/corporate-announcements?index=equities"
SNAPSHOT = "nse/announcements.json"


@dataclass
class Announcement:
    id: str
    symbol: str
    company: str
    desc: str
    text: str
    url: str
    ts: str          # ISO 8601, IST

    @property
    def dt(self) -> datetime:
        return datetime.fromisoformat(self.ts)


@dataclass
class SourceStatus:
    source: str                  # live | cache | snapshot | unavailable
    as_of: str | None            # when the data was fetched (ISO, IST)
    message: str = ""
    covered: list[str] = field(default_factory=list)   # [from, to] for snapshots


def _parse(raw: dict) -> Announcement | None:
    try:
        ts = datetime.strptime(raw["an_dt"], "%d-%b-%Y %H:%M:%S").replace(tzinfo=IST)
    except (KeyError, ValueError):
        return None
    return Announcement(
        id=str(raw.get("seq_id") or raw.get("an_dt")),
        symbol=raw.get("symbol", ""),
        company=raw.get("sm_name") or raw.get("symbol", ""),
        desc=raw.get("desc") or "",
        text=(raw.get("attchmntText") or "").strip(),
        url=raw.get("attchmntFile") or "",
        ts=ts.isoformat(),
    )


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, IST).isoformat(timespec="seconds")


def fetch_range(start: date, end: date, symbol: str | None = None) -> tuple[list[Announcement], float, bool]:
    url = f"{BASE}&from_date={start:%d-%m-%Y}&to_date={end:%d-%m-%Y}"
    if symbol:
        url += f"&symbol={symbol}"
    # Past windows never change; windows that include today expire after the TTL.
    ttl = None if end < datetime.now(IST).date() else settings.announcements_ttl
    f = http.get(url, ttl=ttl, headers={"Accept": "application/json", "Referer": "https://www.nseindia.com/"})
    try:
        rows = json.loads(f.body)
    except json.JSONDecodeError as e:
        raise http.FetchError("NSE returned a non-JSON page") from e
    if not isinstance(rows, list):
        raise http.FetchError("NSE returned an unexpected payload")
    items = [a for a in map(_parse, rows) if a]
    return items, f.fetched_at, f.from_cache


def load_snapshot() -> dict | None:
    p = settings.snapshot_dir / SNAPSHOT
    return json.loads(p.read_text()) if p.exists() else None


def announcements(start: date, end: date, symbols: set[str], force: bool = False) -> tuple[list[Announcement], SourceStatus]:
    """Announcements for `symbols` filed between start and end (inclusive dates)."""
    try:
        if force:
            # Drop only the live entry for this exact window; past windows stay cached.
            from .. import db
            with db.tx() as c:
                c.execute("DELETE FROM http_cache WHERE url LIKE ?", (f"{BASE}&from_date={start:%d-%m-%Y}%",))
        items, fetched_at, cached = fetch_range(start, end)
        items = [a for a in items if a.symbol in symbols]
        return items, SourceStatus("cache" if cached else "live", _iso(fetched_at))
    except http.FetchError as e:
        snap = load_snapshot()
        if not snap:
            return [], SourceStatus("unavailable", None, f"NSE unreachable ({e}) and no snapshot recorded")
        items = [Announcement(**a) for a in snap["items"]]
        items = [a for a in items if a.symbol in symbols and start <= a.dt.date() <= end]
        msg = f"NSE unreachable ({e}). Showing recorded snapshot."
        if not (snap["from"] <= start.isoformat() and end.isoformat() <= snap["to"]):
            msg += f" Snapshot only covers {snap['from']} to {snap['to']}."
        return items, SourceStatus("snapshot", snap["fetched_at"], msg, [snap["from"], snap["to"]])


def record_snapshot(start: date, end: date, symbols: set[str]) -> int:
    items, fetched_at, _ = fetch_range(start, end)
    items = [a.__dict__ for a in items if a.symbol in symbols]
    out = {"fetched_at": _iso(fetched_at), "from": start.isoformat(), "to": end.isoformat(), "items": items}
    p = settings.snapshot_dir / SNAPSHOT
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return len(items)


def now_ist() -> datetime:
    return datetime.fromtimestamp(time.time(), IST)
