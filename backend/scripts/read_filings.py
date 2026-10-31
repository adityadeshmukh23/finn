"""Read the filings the rules can't place or that the briefing summarises, and record each read.

Runs locally with a key, ahead of time; the demo and CI only replay data/recordings/filings/.
Already-recorded filings are skipped, so re-running costs nothing.

Usage (from backend/): python -m scripts.read_filings [--limit N]
"""
import argparse
import json
from collections import Counter

from finn import filings
from finn.classify import classify
from finn.config import settings
from finn.sources import nse


def reverify() -> None:
    """Re-run the verifier on recorded reads (after a verifier change); no model calls."""
    for rec in filings.load_reads().values():
        if rec.get("status") == "read":
            before = rec["verified"]
            rec = filings._save(filings.check(rec, filings.page_text(rec["url"])))
            print(f"  {rec['symbol']:11} {before} -> {rec['verified']} {rec['checks']}")


def main(limit: int | None) -> None:
    snap = nse.load_snapshot()
    held = {p["symbol"] for p in json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]}
    done = filings.load_reads()
    todo = []
    for a in (nse.Announcement(**r) for r in snap["items"]):
        c = classify(a.desc, a.text)
        if a.symbol in held and filings.needs_read(c) and a.id not in done:
            todo.append((a, c))
    print(f"{len(todo)} filings to read ({len(done)} already recorded)")
    stats = Counter()
    for a, c in todo[:limit]:
        r = filings.read(a, c)
        stats[(r["status"], r.get("verified"))] += 1
        print(f"  {a.symbol:11} {c.reason[:34]:34} -> {r['status']:11} {r.get('category', ''):18} "
              f"{r.get('importance', ''):8} ok={r.get('verified')} {r.get('summary', r.get('note', ''))[:70]}")
        if r["status"] == "skipped" and "quota" in r.get("note", ""):
            print("  stopping: model quota used up")
            break
    print(dict(stats))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--reverify", action="store_true")
    args = ap.parse_args()
    reverify() if args.reverify else main(args.limit)
