"""Quarterly-results card: Revenue, EBITDA, PBT, PAT for this quarter vs last quarter and vs a year ago.

The cheap model only copies figures off the results table, with the page they're on. Code does the
rest: finds the candidate pages, checks every figure is printed on the cited page, converts units,
computes EBITDA (where it means something), QoQ and YoY, and decides how much to trust the result.
Recorded by NSE announcement ID under data/recordings/results/, so the demo replays it offline.
"""
import io
import json
import re
from typing import Literal

from pydantic import BaseModel, Field

from . import http, llm
from .config import settings
from .sources.nse import Announcement
from .verify import number_in, rejoin_numbers

MAX_PAGES = 45
CANDIDATES = 3

# Matched against page text with all whitespace removed: PDF extraction splits words ("Pro fit").
_PBT = re.compile(r"beforetax")
_REV = re.compile(r"revenuefromoperations|totalincome|interestearned|incomefromoperations")
_QTR = re.compile(r"quarterended|threemonthsended|3monthsended|q[1-4]fy")


def page_scores(pages: list[str]) -> list[tuple[int, int, str]]:
    """(score, page number, basis) for pages that look like a results table. Consolidated first."""
    out = []
    for i, t in enumerate(pages, 1):
        z = re.sub(r"\s+", "", t.lower())
        if not (_PBT.search(z) and _REV.search(z)):
            continue
        s = 2 * bool(_QTR.search(z)) + len(re.findall(r"\d[\d,]*\.\d{2}", t)) // 20
        s -= 3 * ("segment" in z[:300])
        basis = "consolidated" if "consolidated" in z[:1200] else "standalone" if "standalone" in z[:1200] else "unknown"
        s += {"consolidated": 3, "unknown": 1, "standalone": 0}[basis]
        out.append((s, i, basis))
    return sorted(out, key=lambda x: (-x[0], x[1]))


# A printed figure: 1,234.56, (1,234.56), 12.5 or 1,23,456. Bare integers are left out: they're note numbers and years.
_FIG = re.compile(r"\(?\d[\d,]*\.\d+\)?|\(?\d{1,3}(?:,\d{2,3})+\)?")
NO_ROWS = "This PDF's table has no readable rows, so its columns can't be told apart."


def has_rows(page: str) -> bool:
    """False when the figures come out one to a line, as from a scrambled OCR layer. Then nothing ties a number to its
    label or column, and finding it on the page proves nothing: Equitas's June-quarter profit passed as September's.
    Across the recorded tables the share of figures alone on a line is 0 to 33%, and Equitas is 100%."""
    lines = [ln.strip() for ln in page.splitlines() if ln.strip()]
    figures = sum(len(_FIG.findall(ln)) for ln in lines)
    lone = sum(1 for ln in lines if _FIG.fullmatch(ln))
    return figures < 12 or lone / figures < 0.8


class Figures(BaseModel):
    current: float | None = Field(description="this quarter, as printed")
    previous: float | None = Field(description="the immediately preceding quarter, as printed")
    year_ago: float | None = Field(description="the same quarter last year, as printed")


class ResultsTable(BaseModel):
    found: bool = Field(description="false if none of the pages has a quarterly results table")
    page: int = Field(description="page number of the table used")
    basis: Literal["consolidated", "standalone", "unknown"]
    unit: Literal["crore", "lakh", "million", "thousand", "rupees", "unknown"]
    quarter_label: str = Field(description="column heading of this quarter, e.g. '30.09.2026'")
    revenue_label: str = Field(description="exact row label used for revenue")
    revenue: Figures
    other_income: Figures
    finance_costs: Figures
    depreciation: Figures
    pbt: Figures = Field(description="profit before tax (after exceptional items)")
    pat: Figures = Field(description="net profit for the period (total, before minority interest)")


SYSTEM = """You copy figures from the quarterly financial results table of an Indian listed company.
Use only the page text given. Never compute, round, or estimate: copy each figure exactly as printed,
as a plain number (no commas; negative for figures in brackets). Use null if a figure isn't printed.

Pick the consolidated results table if one is given; otherwise the standalone one. Say which.
Columns: "current" is the latest quarter (three months ended), "previous" is the preceding quarter,
"year_ago" is the same quarter of the previous year. Ignore half-year and full-year columns.
revenue: "Revenue from operations" (for banks, "Total income" or "Interest earned"; give the label).
other_income: "Other income". finance_costs: "Finance costs". depreciation: "Depreciation and amortisation expense".
pbt: "Profit before tax" after exceptional items. pat: "Net profit / Profit for the period" (total, not the share of owners).
unit: as stated in the table heading (e.g. "Rs. in crore", "₹ lakh", "million").
If no page contains a quarterly results table, set found=false."""


def _path(ann_id: str):
    return settings.data_dir / "recordings" / "results" / f"{ann_id}.json"


def load_all() -> dict[str, dict]:
    d = settings.data_dir / "recordings" / "results"
    return {p.stem: json.loads(p.read_text()) for p in sorted(d.glob("*.json"))} if d.exists() else {}


def _pages(url: str) -> list[str]:
    from pypdf import PdfReader
    body = http.get(url, ttl=None, headers={"Referer": "https://www.nseindia.com/"}).body
    if not body.startswith(b"%PDF"):
        raise http.FetchError("not a PDF")
    return [(p.extract_text() or "") for p in PdfReader(io.BytesIO(body)).pages[:MAX_PAGES]]


TO_CRORE = {"crore": 1, "lakh": 0.01, "million": 0.1, "thousand": 0.0001, "rupees": 1e-7}
METRICS = ("revenue", "ebitda", "pbt", "pat")


def pct(a: float | None, b: float | None) -> float | None:
    """Change from b to a in %. None ("not meaningful") if either is missing or the base is zero or a
    loss: a growth rate off a loss reads backwards, so the card shows both values instead."""
    if a is None or b is None or b <= 0:
        return None
    return round((a - b) / b * 100, 1)


COLS = ("current", "previous", "year_ago")
_CELL = re.compile(r"\(?\d[\d,]*(?:\.\d+)?\)?|(?<!\S)[-–](?!\S)")
_REV_HEADING = re.compile(r"revenuefromoperations|incomefromoperations|totalrevenue")
PARTS_DONT_ADD = "Revenue is printed only as parts, and they don't add up to the total on the page."


def _cells(line: str) -> list[float]:
    """A table line's figures in order. Brackets are negative, a lone dash is nil."""
    def num(c: str) -> float:
        return 0.0 if c in "-–" else -float(c.strip("()").replace(",", "")) if c.startswith("(") else float(c.strip("()").replace(",", ""))
    return [num(c) for c in _CELL.findall(rejoin_numbers(line))]


def _label(line: str) -> str:
    return re.sub(r"[^a-z]", "", line.lower())


def revenue_parts(t: dict, page: str) -> dict | None:
    """When "Revenue from operations" is a heading with no figures and the figures read are one line under it, revenue is
    that line and the ones after it, up to other income. HUL prints Sale of products, Sale of services and Other operating
    revenue that way. Code adds them, and proves the sum: parts + other income must equal the total income line.

    None when the line read is the total. {"proved": False} when it's a part and the sum can't be proved."""
    want = [t["revenue"][c] for c in COLS]
    if any(v is None for v in want):
        return None
    lines = [ln for ln in page.splitlines() if ln.strip()]
    for i, line in enumerate(lines):
        cells = _cells(line)
        if not all(v in cells for v in want):
            continue
        if _REV_HEADING.search(_label(line)) or not any(
                _REV_HEADING.search(_label(h)) and not _cells(h) for h in lines[max(0, i - 2):i]):
            return None
        at = [cells.index(v) for v in want]
        parts = []
        for j in range(i, min(i + 8, len(lines) - 1)):
            row = _cells(lines[j])
            if "otherincome" in _label(lines[j]):
                total = _cells(lines[j + 1])
                whole = all(float(v).is_integer() for v in want)
                ok = (parts and "totalincome" in _label(lines[j + 1]) and len(row) > max(at) and len(total) > max(at)
                      and all(abs(sum(p[k] for p in parts) + row[k] - total[k]) < (1.5 if whole else 0.05) for k in at))
                if not ok:
                    break
                return {"proved": True, "how": f"sum of {len(parts)} printed lines",
                        **{c: round(sum(p[k] for p in parts), 2) for c, k in zip(COLS, at)}}
            if len(row) <= max(at):
                break
            parts.append(row)
        return {"proved": False}
    return None


TAX_BAND = (10, 35)    # implied tax, %. Recorded cards the audit passed run 22.6 to 28.8; India's corporate rate is about 25


def inconsistencies(checked: dict) -> list[str]:
    """Checks that don't need the page, for what the page check can't see: a figure that's printed but from the wrong column.
    Failing one doesn't prove an error (a tax credit can do it), so the card is withheld rather than corrected."""
    names = {"current": "this quarter", "previous": "the prior quarter", "year_ago": "the year-ago quarter"}
    out = []
    for c in COLS:
        pbt, pat = checked["pbt"][c], checked["pat"][c]
        if pbt is None or pat is None or pbt <= 0:      # no tax rate to read off a loss
            continue
        tax = round((1 - pat / pbt) * 100, 1)
        if pat > pbt:
            out.append(f"PAT is above PBT in {names[c]}")
        elif not TAX_BAND[0] <= tax <= TAX_BAND[1]:
            out.append(f"implied tax of {tax:g}% in {names[c]} is outside {TAX_BAND[0]}% to {TAX_BAND[1]}%")
    label = {"revenue": "Revenue", "other_income": "Other income", "finance_costs": "Finance costs",
             "depreciation": "Depreciation", "pbt": "PBT", "pat": "PAT"}
    for name, row in checked.items():
        v = row["current"]
        # Small round figures can repeat by chance (a ₹74 cr finance cost two quarters running).
        if v is not None and abs(v) >= 100 and v in (row["previous"], row["year_ago"]):
            out.append(f"{label[name]} repeats a figure from another column")
    return out


def compute(t: dict, page_text: str, lender: bool) -> dict:
    """Verify each figure on the cited page, convert to ₹ crore, derive EBITDA, QoQ and YoY.

    Unverified figures are dropped, never shown. EBITDA = PBT + finance costs + depreciation − other
    income, and only if all four parts are verified; for lenders, finance cost is the cost of the
    product, so EBITDA isn't meaningful and isn't shown."""
    k = TO_CRORE.get(t["unit"])
    checked, failed = {}, []
    for name in ("revenue", "other_income", "finance_costs", "depreciation", "pbt", "pat"):
        checked[name] = {}
        for col in ("current", "previous", "year_ago"):
            v = t[name][col]
            if v is None:
                checked[name][col] = None
            elif number_in(v, page_text):
                checked[name][col] = v
            else:
                checked[name][col] = None
                failed.append(f"{name}.{col}")
    summed = revenue_parts(t, page_text)
    if summed:
        checked["revenue"] = {c: summed.get(c) for c in COLS}

    def crore(v):
        return None if v is None or k is None else round(v * k, 2)

    rows = {}
    for m in ("revenue", "pbt", "pat"):
        rows[m] = {c: crore(checked[m][c]) for c in ("current", "previous", "year_ago")}
    if lender:
        rows["ebitda"] = None
    else:
        e = {}
        for c in ("current", "previous", "year_ago"):
            parts = [checked[x][c] for x in ("pbt", "finance_costs", "depreciation", "other_income")]
            e[c] = crore(parts[0] + parts[1] + parts[2] - parts[3]) if all(p is not None for p in parts) else None
        rows["ebitda"] = e
    for m in METRICS:
        r = rows[m]
        if r is not None:
            r["qoq_pct"] = pct(r["current"], r["previous"])
            r["yoy_pct"] = pct(r["current"], r["year_ago"])
    margins = {}
    rev = rows["revenue"]["current"]
    for m in ("ebitda", "pat"):
        v = rows[m]["current"] if rows[m] else None
        margins[m] = round(v / rev * 100, 1) if v is not None and rev else None

    core = [checked[m]["current"] for m in ("revenue", "pbt", "pat")]
    odd = inconsistencies(checked)
    if summed and not summed["proved"]:
        confidence, why = "low", PARTS_DONT_ADD
    elif k is None or t["basis"] == "unknown" or any(v is None for v in core):
        confidence, why = "low", "Some headline figures couldn't be matched to the page or the unit is unclear."
    elif odd:
        confidence, why = "low", f"The figures don't fit together: {odd[0]}."
    elif failed or t["basis"] == "standalone":
        confidence = "medium"
        why = ("Standalone figures; no consolidated table in the pages read." if t["basis"] == "standalone" and not failed
               else f"{len(failed)} figure(s) not found on the page were dropped.")
    else:
        confidence, why = "high", "Every figure shown was found on the cited page."
    return {"rows": rows, "margins": margins, "confidence": confidence, "confidence_note": why,
            "dropped": failed, "unit_note": "₹ crore" + ("" if t["unit"] == "crore" else f" (converted from {t['unit']})"),
            "revenue_how": summed.get("how") if summed else None, "inconsistent": odd}


def extract(a: Announcement, lender: bool) -> dict:
    rec: dict = {"id": a.id, "symbol": a.symbol, "url": a.url}
    try:
        pages = _pages(a.url)
    except http.FetchError as e:
        return _save(rec | {"status": "unavailable", "note": f"Results PDF could not be fetched ({e})"})
    cands = page_scores(pages)[:CANDIDATES]
    if not cands:
        empty = sum(1 for p in pages if len(p.strip()) < 50)
        note = ("Results PDF is a scanned image; figures not extracted" if empty > len(pages) / 2
                else "No results table found in this filing")
        return _save(rec | {"status": "no_table", "note": note})
    readable = [c for c in cands if has_rows(pages[c[1] - 1])]
    if not readable:
        return _save(rec | withheld(cands, lender))
    user = "\n\n".join(f"[page {n}]\n{pages[n - 1][:5000]}" for _, n, _ in sorted(readable, key=lambda c: c[1]))
    res = llm.call("extract_results", SYSTEM, user, ResultsTable, mock=lambda: None, max_tokens=1200)
    if res.output is None:
        return {**rec, "status": "skipped", "note": res.note or res.source}
    t = res.output.model_dump()
    if not t["found"] or not 1 <= t["page"] <= len(pages):
        return _save(rec | {"status": "no_table", "note": "Model found no quarterly table in the candidate pages",
                            "candidates": [n for _, n, _ in cands]})
    rec |= {"status": "extracted", "extracted": t, "candidates": [n for _, n, _ in readable], "lender": lender}
    rec |= compute(t, pages[t["page"] - 1], lender)
    return _save(rec)


def withheld(cands: list[tuple[int, int, str]], lender: bool) -> dict:
    """The record for a table found but not readable: no model call, no figures, and the page to go and read."""
    _, page, basis = cands[0]
    return {"status": "withheld", "page": page, "basis": basis, "lender": lender, "candidates": [n for _, n, _ in cands],
            "confidence": "low", "confidence_note": NO_ROWS, "note": NO_ROWS}


def recompute(rec: dict, pages: list[str], lender: bool) -> dict:
    """Re-run the rules on a recorded extraction, with no model call."""
    page = pages[rec["extracted"]["page"] - 1]
    keep = {k: rec[k] for k in ("id", "symbol", "url")}
    if not has_rows(page):
        cands = [(0, n, rec["extracted"]["basis"]) for n in rec["candidates"]]
        return _save(keep | withheld(cands, lender))
    return _save(keep | {k: rec[k] for k in ("status", "extracted", "candidates")} | {"lender": lender}
                 | compute(rec["extracted"], page, lender))


def _save(rec: dict) -> dict:
    p = _path(rec["id"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(rec, indent=1, ensure_ascii=False))
    return rec


_MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")


def period(label: str) -> str | None:
    """'30th Sep'26', '30.09.2026', 'September 30, 2026' -> 'Sep 2026'. None when the label isn't a date we can read."""
    t = (label or "").strip().lower()
    if m := re.fullmatch(r"\d{1,2}[./-](\d{1,2})[./-](\d{2}|\d{4})", t):
        month, year = int(m.group(1)), m.group(2)
        if not 1 <= month <= 12:
            return None
        name = _MONTHS[month - 1]
    elif m := re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b.*?(?:'|\b)(\d{4}|\d{2})\s*$", t):
        name, year = m.group(1), m.group(2)
        if len(year) == 2 and not t[0].isdigit():    # 'September 30' is a day with no year
            return None
    else:
        return None
    return f"{name.title()} {'20' + year if len(year) == 2 else year}"


def card_view(rec: dict | None) -> dict | None:
    """What the briefing card needs, or None when there's nothing honest to show."""
    if not rec:
        return None
    if rec.get("status") not in ("extracted", "withheld"):
        return {"status": rec.get("status"), "note": rec.get("note", "")}
    t = rec.get("extracted") or {}
    page = t.get("page", rec.get("page"))
    view = {
        "status": "extracted", "basis": t.get("basis", rec.get("basis")), "quarter": t.get("quarter_label", ""),
        "period": period(t.get("quarter_label", "")), "page": page, "unit": rec.get("unit_note", ""),
        "revenue_label": t.get("revenue_label", ""), "lender": rec["lender"],
        "confidence": rec["confidence"], "confidence_note": rec["confidence_note"],
        "url": f"{rec['url']}#page={page}",
    }
    if rec["confidence"] == "low":
        # Withheld means withheld: the figures don't reach the data file either, so nothing downstream can show them.
        blank = dict.fromkeys(("current", "previous", "year_ago", "qoq_pct", "yoy_pct"))
        rows = {m: None if m == "ebitda" and rec["lender"] else blank for m in METRICS}
        return view | {"rows": rows, "margins": {"ebitda": None, "pat": None}}
    return view | {"rows": rec["rows"], "margins": rec["margins"], "revenue_how": rec.get("revenue_how")}


def group_indian(whole: int) -> str:
    """332861 -> '3,32,861'."""
    head, tail = divmod(whole, 1000)
    return f"{re.sub(r'(\d)(?=(\d{2})+$)', r'\1,', str(head))},{tail:03d}" if head else str(tail)


def _crore(v: float) -> str:
    """Indian grouping, whole crore from 100 up: 332861.0 -> '3,32,861', 99.44 -> '99.4'. A loss takes U+2212, not a hyphen."""
    if abs(v) < 100:
        return f"{'−' if v < 0 else ''}{abs(v):.1f}"
    return ("−" if v < 0 else "") + group_indian(round(abs(v)))


def headline(view: dict | None) -> str | None:
    """'PAT ₹1,085 cr, +6.6% YoY; revenue +16.9% YoY (Sep 2026 qtr, consolidated)' when confident, else None (keep the period headline)."""
    if not view or view.get("status") != "extracted" or view["confidence"] == "low":
        return None
    pat, rev = view["rows"]["pat"], view["rows"]["revenue"]
    if pat["current"] is None:
        return None
    sign = lambda p: f"{'+' if p >= 0 else '−'}{abs(p):.1f}%"  # noqa: E731
    out = f"PAT ₹{_crore(pat['current'])} cr"
    if pat["yoy_pct"] is not None:
        out += f", {sign(pat['yoy_pct'])} YoY"
    if rev["yoy_pct"] is not None:
        out += f"; revenue {sign(rev['yoy_pct'])} YoY"
    labels = [f"{view['period']} qtr" if view.get("period") else "", view["basis"] if view["basis"] != "unknown" else ""]
    return out + (f" ({', '.join(x for x in labels if x)})" if any(labels) else "")
