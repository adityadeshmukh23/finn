"""Read each top-management change filing in the snapshot once: who, role, effective date, reason, profile.

Usage (from backend/): python -m scripts.extract_mgmt [--limit N] [--recheck]
--recheck re-runs verification on recorded extractions (no model calls).
"""
import argparse
import json

from finn import filings, mgmt
from finn.classify import HIGH, classify
from finn.config import settings
from finn.sources import nse


def targets() -> list[nse.Announcement]:
    held = {p["symbol"] for p in json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]}
    reads = filings.load_reads()
    out = []
    for a in (nse.Announcement(**r) for r in nse.load_snapshot()["items"]):
        c, _ = filings.apply(classify(a.desc, a.text), reads.get(a.id))
        if a.symbol in held and c.category == "management_change" and c.tier == HIGH:
            out.append(a)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--recheck", action="store_true")
    args = ap.parse_args()
    done = mgmt.load_all()
    for a in targets()[: args.limit]:
        if args.recheck and done.get(a.id, {}).get("status") == "read":
            text = mgmt.filing_text(a.url)
            r = mgmt._save(done[a.id] | {"changes": [mgmt.check(c, text) for c in done[a.id]["changes"]]})
        else:
            r = done.get(a.id) or mgmt.extract(a)
        print(f"  {a.symbol:11} {a.id} {r['status']}")
        for c in r.get("changes", []):
            print(f"      {'ok ' if c['verified'] else 'NO '} {c['person']} | {c['role']} | {c['change']} | eff {c['effective'] or '-'}"
                  f" | {c['checks']}\n         reason: {c['reason'][:90]}\n         profile: {c['profile'][:90]}")


if __name__ == "__main__":
    main()
