"""Pre-generate the static demo: one briefing per (day, window) from the recorded NSE snapshot.

Runs the same digest code as the API, offline: no network, no LLM. The PWA reads these files when
no API is configured (the public Vercel demo) and falls back to them when the API is unreachable.

Usage (from backend/): python -m scripts.build_static
"""
import json
import shutil
from datetime import date, datetime, time, timedelta

from finn import digest
from finn.config import REPO_ROOT, settings
from finn.sources import nse

WINDOWS = (24, 72, 168)
OUT = REPO_ROOT / "web" / "public" / "demo"


def build(out=OUT) -> dict:
    snap = nse.load_snapshot()
    if not snap:
        raise SystemExit("No snapshot in data/snapshots/nse. Run scripts.record_snapshots first.")
    meta = {p["symbol"]: p for p in json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]}
    items = [a for a in (nse.Announcement(**r) for r in snap["items"]) if a.symbol in meta]
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
            dg = digest.build(items, end, hours, meta)
            start = end - timedelta(hours=hours)
            msg = f"Recording starts {first:%-d %b}, so this window is partly empty." if start.date() < first else ""
            dg["source"] = {"source": "bundled", "as_of": snap["fetched_at"], "message": msg,
                            "covered": [snap["from"], snap["to"]]}
            dg["is_live_now"] = False
            (out / f"digest-{d.isoformat()}-{hours}.json").write_text(json.dumps(dg, ensure_ascii=False))
        days.append(d.isoformat())
        d += timedelta(days=1)

    manifest = {"fetched_at": snap["fetched_at"], "from": snap["from"], "to": snap["to"],
                "days": days, "windows": list(WINDOWS), "holdings": len(meta)}
    (out / "manifest.json").write_text(json.dumps(manifest))
    return manifest


if __name__ == "__main__":
    m = build()
    print(f"{len(m['days'])} days x {len(m['windows'])} windows, {m['from']} to {m['to']}, data as of {m['fetched_at']}")
