"""Check every results figure the app shows against the row and column it should come from in the filing.

The verifier proves a number is printed on the page. This proves it's the right row and column, which is what it can't see:
each card's row labels and column order are set by hand here, after reading its table. Needs the filing PDFs in the local
HTTP cache, which are never committed, so it isn't part of CI. Reads the text layer, not the page image.

Usage (from backend/): python -m scripts.audit_results
"""
import re

from finn import results

COLS = results.COLS
# Position of (this quarter, prior quarter, year ago) among a row's figures, where it isn't the usual first three.
ORDER = {"HINDUNILVR": (0, 2, 1)}
ROWS = {
    "revenue": r"revenuefromoperations",
    "other_income": r"otherincome",
    "finance_costs": r"^[a-z]?financecosts?$",
    "depreciation": r"depreciation",
    "pbt": r"^(profit|profil)(loss)?beforetax$",
    "pat": r"^(profitfortheperiod|profitaftertax$|netprofitaftertax$|netprofillossfortheoeriod)",
}
OVERRIDE = {("HINDUNILVR", "pat"): r"^profitfortheperiodyear$"}    # the total, not the continuing-operations line above it
HAND_READ = {("INFY", "depreciation"): [662, 613, 595]}            # the text layer splits 613 as "61 3"
SPLIT_ACROSS_BLOCKS = {"RELIANCE"}                                 # year-ago column in a second block, row for row

_REFS = re.compile(r"\(\s*\d[\d.]*\s*[-+.–]\s*\d[\d.]*\s*\)|\(refer[^)]*\)|\(c\s*=[^)]*\)", re.I)   # (3+4), (Refer note 5), (C = A+B)
_SERIAL = re.compile(r"^\d{1,2}\)?\s+(?=[A-Za-z(\[])")


def clean(line: str) -> str:
    """A row without what's not a figure: its serial number and its references to other rows."""
    return _SERIAL.sub("", _REFS.sub("", line.strip()))


def row(lines: list[str], symbol: str, name: str) -> list[float] | None:
    if (symbol, name) in HAND_READ:
        return HAND_READ[(symbol, name)]
    want = re.compile(OVERRIDE.get((symbol, name), ROWS[name]))
    for ln in lines:
        if want.search(results._label(clean(ln))) and len(results._cells(clean(ln))) >= (2 if symbol in SPLIT_ACROSS_BLOCKS else 3):
            return results._cells(clean(ln))
    return None


def reliance_year_ago(lines: list[str], name: str) -> float | None:
    """The second block has no labels. Its rows line up with the first block's, starting from the first row of each."""
    top = next(i for i, ln in enumerate(lines) if ln.startswith("Value of Sales"))
    end = next(i for i, ln in enumerate(lines) if "Half Year Ended" in ln)
    first = [ln for ln in lines[top:end] if len(results._cells(clean(ln))) >= 2]
    second = [ln for ln in lines[end:] if len(results._cells(ln)) >= 2 and not re.search(r"[A-Za-z]", ln)]
    want = re.compile(ROWS[name])
    i = next(i for i, ln in enumerate(first) if want.search(results._label(clean(ln))))
    return results._cells(second[i])[0]


def audit(r: dict) -> tuple[int, list[str]]:
    t = r["extracted"]
    lines = [ln for ln in results._pages(r["url"])[t["page"] - 1].splitlines() if ln.strip()]
    k = results.TO_CRORE[t["unit"]]
    sym, order = r["symbol"], ORDER.get(r["symbol"], (0, 1, 2))
    n, bad = 0, []

    def printed(name: str) -> list[float | None]:
        cells = row(lines, sym, name)
        if cells is None:
            return [None] * 3
        if sym in SPLIT_ACROSS_BLOCKS:
            return [cells[0], cells[1], reliance_year_ago(lines, name)]
        return [cells[i] if i < len(cells) else None for i in order]

    for m, shown in (("revenue", r["rows"]["revenue"]), ("pbt", r["rows"]["pbt"]), ("pat", r["rows"]["pat"])):
        if r.get("revenue_how") and m == "revenue":
            # Printed only as parts: the independent figure is total income less other income.
            ti = next(results._cells(clean(ln)) for ln in lines if "totalincome" in results._label(ln))
            oi = printed("other_income")
            page = [ti[order[i]] - oi[i] for i in range(3)]
        else:
            page = printed(m)
        for c, p in zip(COLS, page):
            n += 1
            if p is None or shown[c] is None or abs(p * k - shown[c]) > 0.01:
                bad.append(f"{sym} {m} {c}: shows {shown[c]}, page {p if p is None else round(p * k, 2)}")
    if not r["lender"]:
        # EBITDA is derived, so check what it's built from: every input for every column it's shown in.
        inp = {x: printed(x) for x in ("other_income", "finance_costs", "depreciation")}
        pbt = printed("pbt")
        for i, c in enumerate(COLS):
            shown = r["rows"]["ebitda"][c]
            if shown is None:
                continue
            n += 1
            parts = [pbt[i], inp["finance_costs"][i], inp["depreciation"][i], inp["other_income"][i]]
            if any(p is None for p in parts) or abs((parts[0] + parts[1] + parts[2] - parts[3]) * k - shown) > 0.01:
                bad.append(f"{sym} ebitda {c}: shows {shown}, from page inputs {parts}")
    return n, bad


def main() -> None:
    total, wrong, skipped = 0, [], []
    for r in results.load_all().values():
        if r.get("confidence") in ("high", "medium"):
            n, bad = audit(r)
            total += n
            wrong += bad
            print(f"  {r['symbol']:11} {n - len(bad)}/{n}")
        else:
            skipped.append(r["symbol"])
    print(f"{total - len(wrong)} of {total} match. {len(skipped)} cards show no figures: {', '.join(skipped)}")
    for b in wrong:
        print("  MISMATCH", b)


if __name__ == "__main__":
    main()
