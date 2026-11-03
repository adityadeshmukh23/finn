"""Generate and record promised-vs-delivered research for one or more NSE tickers, ahead of time.

Usage (from backend/): python -m scripts.research BEL [KAYNES ...] [--reverify]
Model calls replay from data/recordings/llm/ when recorded, so a re-run after a rules change is free.
Writes data/recordings/research/SYM.json only after every claim in it re-verifies against its page.
--reverify re-checks existing recordings against their stored page text (no network, no model).
"""
import argparse
import gzip
import json
import sys

from finn.config import settings
from finn.research import docs, pvd


def name_of(symbol: str) -> str:
    pf = json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]
    return next((p["name"] for p in pf if p["symbol"] == symbol), "")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("symbols", nargs="+")
    ap.add_argument("--reverify", action="store_true")
    ap.add_argument("--relabel", action="store_true", help="re-apply the revision wording rules to a recording (no model calls)")
    args = ap.parse_args()
    failed = 0
    for sym in (s.upper() for s in args.symbols):
        if args.relabel:
            rec = pvd.load(sym)
            for r in rec["scorecard"]["rows"]:
                pvd.settle_changes(r)
            pvd.recording_path(sym).write_text(json.dumps(rec, indent=1, ensure_ascii=False))
            print(f"{sym}: relabelled")
            continue
        if args.reverify:
            rec = pvd.load(sym)
            bad = pvd.reverify(rec, json.loads(gzip.decompress(pvd.pages_path(sym).read_bytes())))
            print(f"{sym}: {'all claims re-verified' if not bad else bad}")
            failed += bool(bad)
            continue
        try:
            ds, texts = docs.choose(sym)
        except docs.Unavailable as e:
            print(f"{sym}: {e}")
            failed += 1
            continue
        print(f"{sym}: {', '.join(d.period for d in ds.calls)}; {ds.annual_report.title if ds.annual_report else 'no annual report'}")
        for s in ds.skipped:
            print(f"   skipped {s['listed_as']}: {s['why']}")
        rec = pvd.run(ds, texts, docs.index(sym).get("name") or name_of(sym))
        for stage, calls in rec["models"].items():
            for c in calls:
                fb = f" (after {', '.join(f['model'] + ': ' + f['why'][:60] for f in c['fallbacks'])})" if c["fallbacks"] else ""
                print(f"   {stage:16} {c.get('doc', ''):9} {c['source']:9} {c['model'] or c['note'][:80]}{fb}")
        unread = [c for calls in rec["models"].values() for c in calls if c["source"] not in ("live", "recorded")]
        if unread:
            print(f"   NOT RECORDED: {len(unread)} model step(s) didn't run this time ({unread[0]['note'][:120]}). "
                  "Re-run later; steps already done replay from their recordings.")
            failed += 1
            continue
        if not rec["judged"]:
            print(f"   NOT RECORDED: the judge step didn't run ({rec['models']['verdict'][0]['note'] if rec['models']['verdict'] else 'no promises'})")
            failed += 1
            continue
        cited = {}
        for d, pg in texts.items():
            cited[d] = {str(i): t for i, t in enumerate(pg, 1)}
        bad = pvd.reverify(rec, cited)
        if bad:
            print(f"   NOT RECORDED: {len(bad)} claims failed re-verification: {bad[:3]}")
            failed += 1
            continue
        pvd.save(rec, texts)
        sc = rec["scorecard"]
        print(f"   {sc['credibility']['headline']} · {sc['counts']} · {len(rec['dropped'])} dropped")
        for r in sc["rows"]:
            d = r["delivered"]
            print(f"     {r['verdict']:11} {r['label'][:38]:38} {r['promised']['target']:>14} due {r['due']:<11} "
                  f"→ {d['text'] + ' ' + d['period'] if d else '-'} [{r['verdict_by']}]")
        for x in rec["dropped"]:
            print(f"     dropped {x['stage']:9} {x['what'][:40]:40} {x['doc']} p.{x['page']}: {x['why']}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
