"""Extract the quarterly-results table for each holding's results filing in the snapshot, once.

Usage (from backend/): python -m scripts.extract_results [--limit N] [--symbol SYM] [--recompute]
--recompute re-runs verification and the arithmetic on recorded extractions (no model calls).
"""
import argparse
import json

from finn import filings, results
from finn.classify import classify
from finn.config import settings
from finn.sources import nse

LENDER_WORDS = ("bank", "nbfc", "finance")


def results_filings() -> list[tuple[nse.Announcement, bool]]:
    """One filing per holding: the exchange results submission if there is one, else the results outcome."""
    pf = {p["symbol"]: p for p in json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]}
    reads = filings.load_reads()
    best: dict[str, tuple[int, nse.Announcement]] = {}
    for a in (nse.Announcement(**r) for r in nse.load_snapshot()["items"]):
        if a.symbol not in pf:
            continue
        c, _ = filings.apply(classify(a.desc, a.text), reads.get(a.id))
        if c.reason != "Quarterly results":
            continue
        rank = 2 if "financial results for the period" in a.text.lower() else 1 if a.desc == "Outcome of Board Meeting" else 0
        if a.symbol not in best or rank > best[a.symbol][0]:
            best[a.symbol] = (rank, a)
    return [(a, any(w in pf[s]["sector"].lower() for w in LENDER_WORDS)) for s, (_, a) in sorted(best.items())]


def show(r: dict) -> str:
    if r["status"] != "extracted":
        return f"{r['status']}: {r.get('note', '')}"
    rows = r["rows"]
    f = lambda m: "n/a" if rows[m] is None else f"{rows[m]['current']} ({rows[m]['qoq_pct']}% qoq, {rows[m]['yoy_pct']}% yoy)"  # noqa: E731
    return (f"p.{r['extracted']['page']} {r['extracted']['basis']} {r['extracted']['unit']} conf={r['confidence']} "
            f"dropped={r['dropped']}\n      rev {f('revenue')} | ebitda {f('ebitda')} | pbt {f('pbt')} | pat {f('pat')}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--symbol")
    ap.add_argument("--recompute", action="store_true")
    args = ap.parse_args()
    done = results.load_all()
    todo = [(a, lender) for a, lender in results_filings() if not args.symbol or a.symbol == args.symbol]
    for a, lender in todo[: args.limit]:
        if args.recompute:
            rec = done.get(a.id)
            if not rec or rec["status"] != "extracted":
                continue
            page = results._pages(a.url)[rec["extracted"]["page"] - 1]
            r = results._save({k: rec[k] for k in ("id", "symbol", "url", "status", "extracted", "candidates")}
                              | {"lender": lender} | results.compute(rec["extracted"], page, lender))
        elif a.id in done:
            r = done[a.id]
        else:
            r = results.extract(a, lender)
        print(f"  {a.symbol:11} {a.id} {show(r)}")


if __name__ == "__main__":
    main()
