"""Pre-generate the static demo: one briefing per (day, window) from the recorded NSE snapshot.

Runs the same digest code as the API, offline: no network, no LLM. The PWA reads these files when
no API is configured (the public Vercel demo) and falls back to them when the API is unreachable.

Usage (from backend/): python -m scripts.build_static
"""
import json
import shutil
from datetime import date, datetime, time, timedelta

from finn import digest, filings, market, mgmt, results
from finn.config import REPO_ROOT, settings
from finn.research import pvd, walk
from finn.sources import nse, prices

WINDOWS = (24, 72, 168)
OUT = REPO_ROOT / "web" / "public" / "demo"


def build(out=OUT) -> dict:
    snap = nse.load_snapshot()
    if not snap:
        raise SystemExit("No snapshot in data/snapshots/nse. Run scripts.record_snapshots first.")
    meta = {p["symbol"]: p for p in json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]}
    items = [a for a in (nse.Announcement(**r) for r in snap["items"]) if a.symbol in meta]
    reads, extracted, changes = filings.load_reads(), results.load_all(), mgmt.load_all()
    first, last = date.fromisoformat(snap["from"]), date.fromisoformat(snap["to"])
    fetched = datetime.fromisoformat(snap["fetched_at"])

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    days = []
    d = first
    while d <= last:
        # The last day ends when the snapshot was taken; earlier days end at midnight IST.
        end = fetched if d == last else datetime.combine(d, time(23, 59, 59), nse.IST)
        for hours in WINDOWS:
            dg = digest.build(items, end, hours, meta, reads, extracted, changes)
            start = end - timedelta(hours=hours)
            msg = f"Recording starts {first:%-d %b}, so this window is partly empty." if start.date() < first else ""
            dg["source"] = {"source": "bundled", "as_of": snap["fetched_at"], "message": msg,
                            "covered": [snap["from"], snap["to"]]}
            dg["is_live_now"] = False
            (out / f"digest-{d.isoformat()}-{hours}.json").write_text(json.dumps(dg, ensure_ascii=False))
        days.append(d.isoformat())
        d += timedelta(days=1)

    # End-of-day signals for the same days (plus a week before, for 7-day windows on the first day).
    psnap = prices.load_snapshot()
    if psnap:
        since = (first - timedelta(days=8)).isoformat()
        (out / "market.json").write_text(json.dumps({
            "source": "bundled", "as_of": psnap["fetched_at"], "through": psnap["to"], "provider": psnap["source"],
            "sessions": market.compact({s: b for s, b in psnap["bars"].items() if s in meta}, since),
        }, separators=(",", ":")))

    # Every filing per company, for the company file. One small file so a missing one degrades as one thing.
    (out / "timeline.json").write_text(json.dumps(digest.timeline(items, reads, extracted, changes), ensure_ascii=False, separators=(",", ":")))

    # Recorded research: one file per company plus the index. Pages text stays out of the web build.
    (out / "research").mkdir()
    research = pvd.catalog()
    for c in research:
        shutil.copy(pvd.recording_path(c["symbol"]), out / "research" / f"{c['symbol']}.json")
    (out / "research" / "index.json").write_text(json.dumps({"companies": research}, ensure_ascii=False))

    # Guidance walks: rules over the same recordings, no model. Outside research/, where each file is one company's.
    (out / "walks.json").write_text(json.dumps(walk.build([c["symbol"] for c in research]), ensure_ascii=False, separators=(",", ":")))

    manifest = {"fetched_at": snap["fetched_at"], "from": snap["from"], "to": snap["to"],
                "days": days, "windows": list(WINDOWS), "holdings": len(meta),
                "research": [c["symbol"] for c in research]}
    (out / "manifest.json").write_text(json.dumps(manifest))
    return manifest


if __name__ == "__main__":
    m = build()
    print(f"{len(m['days'])} days x {len(m['windows'])} windows, {m['from']} to {m['to']}, data as of {m['fetched_at']}")
