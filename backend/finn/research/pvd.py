"""Promised vs delivered: what management guided on its earnings calls, against what it then reported.

Division of labour, as everywhere in FINN:
- The cheap model reads each earnings call once and copies out (a) management's forward-looking
  statements on headline numbers and (b) the figures it reported, each with a verbatim quote and page.
- The cheap model copies the consolidated P&L figures off the annual report, with the page.
- Code verifies every quote is on its cited page and every number is in its quote (or on the page,
  for annual-report figures), and drops anything that fails. Code computes growth, EBITDA and margins.
- The strong model groups restatements of the same promise, matches each to the reported figures,
  and judges only what code can't: milestones and promises whose figures aren't comparable.
- Code sets the verdict for every numeric promise with a comparable figure; the model never does.

Only verified claims reach the recording (data/recordings/research/SYM.json). Raw model outputs are
replayed from the LLM gate's own recordings, each naming the model that wrote it.
"""
import gzip
import json
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .. import llm
from ..config import settings
from ..results import pct
from ..verify import norm, number_in, numbers
from .docs import Doc, DocSet, Period

Metric = Literal["revenue_growth", "revenue", "ebitda_margin", "ebitda", "pat", "pat_margin", "order_inflow",
                 "order_book", "exports", "capex", "volume_growth", "other"]
Unit = Literal["%", "crore", "usd_million", "usd_billion", "none"]
VERDICTS = ("met", "partially", "missed", "too_vague", "not_found", "not_yet_due")
MAX_CHARS = 120_000


# ---- verification ---------------------------------------------------------------------------

def _letters(s: str) -> str:
    """Letters, digits, '.' and '%' only. PDF extraction splits words ("fi rst", "202 5") and models
    tidy punctuation ("--", "INR1,600 - plus"); the words and their order must still match exactly."""
    return re.sub(r"[^a-z0-9.%]", "", norm(s))


def quote_on_page(quote: str, page_text: str) -> bool:
    return len(quote.split()) >= 6 and _letters(quote).strip(".") in _letters(page_text)


def value_in(v: float | None, text: str) -> bool:
    return v is None or number_in(abs(v), text)


# ---- 1. reading each earnings call (cheap) ----------------------------------------------------

class Promise(BaseModel):
    metric: Metric
    label: str = Field(description="short name, e.g. 'Revenue growth', 'Order inflow (ex-QRSAM)', 'Hosur plant'")
    kind: Literal["numeric", "milestone", "qualitative"]
    target_low: float | None = Field(description="lower bound as stated (the single figure for a point target)")
    target_high: float | None = Field(description="upper bound if a range was given, else null")
    unit: Unit
    direction: Literal["at_least", "at_most", "range", "about"]
    horizon: str = Field(description="period it is due: 'Q3 FY26', 'H2 FY26', '9M FY26', 'FY26', 'FY28', or 'unspecified'")
    speaker: str
    quote: str = Field(description="verbatim, 10 to 60 words, copied from the transcript")
    page: int


class Reported(BaseModel):
    metric: Metric
    label: str
    period: str = Field(description="period the figure is for: 'Q1 FY26', 'H1 FY26', '9M FY26' or 'FY26'")
    value: float | None = Field(description="the figure as stated, null for an event such as a plant commissioned")
    unit: Unit
    speaker: str
    quote: str = Field(description="verbatim, 10 to 60 words")
    page: int


class CallRead(BaseModel):
    promises: list[Promise]
    reported: list[Reported]


CALL_SYSTEM = """You read one earnings-call transcript of an Indian listed company for an investor checking
whether management delivers what it promises. Use only the transcript. Never use outside knowledge.

promises: forward-looking statements BY MANAGEMENT (not analysts) about headline outcomes: revenue or
turnover growth, revenue, EBITDA or operating margin, PAT, order inflow, order book, exports, capex,
volume growth, and concrete milestones (a plant, a launch, a capacity, an approval, by a date). Include a
management statement repeating or confirming earlier guidance. Include at most 3 vague ones on headline
outcomes ("we expect healthy growth") as kind "qualitative" so the investor sees they can't be checked.
Skip industry commentary, analysts' numbers that management doesn't confirm, and pleasantries.

reported: figures MANAGEMENT states as achieved for a past period (this quarter, the half, nine months or
the full year): revenue or turnover, growth %, EBITDA, margins, PAT, order inflow, order book, exports,
capex, volume growth; and events that settle an earlier milestone (plant commissioned, order received).

For both:
- metric: one of the listed keys; "other" if none fits. unit: "%" for growth rates and margins, "crore"
  for rupee amounts in crore (convert nothing: if a figure is in lakh or million rupees, use "none"),
  "usd_million"/"usd_billion" for dollar amounts, "none" for counts or events.
- Copy figures exactly as stated. Never compute, round or convert. "15% to 17%" is target_low 15,
  target_high 17, direction "range". "more than 27%" is target_low 27, direction "at_least".
  "around 15%" is direction "about". A target with no number has target_low null.
- horizon / period: canonical labels only. The fiscal year ends in March: FY27 is April 2026 to March
  2027; Q1 is April-June, Q2 July-September, Q3 October-December, Q4 January-March. Resolve "this year",
  "next year", "second half" using the call's context given below. "unspecified" if no period is stated.
  A date resolves to its quarter: "by December 2029" is Q3 FY30, "by March 2027" is Q4 FY27. An order
  book "as on 31 March 2026" or "as on 1 April 2026" is for FY26.
- quote: copy 10 to 60 consecutive words exactly as they appear on that page, including filler words
  and false starts, so it can be found by search. The quote must contain the figure you report. One
  quote per item. page: the N of the [page N] marker the quote sits under. Ignore page numbers printed
  inside the transcript ("Page 3 of 20"); they are often one less than the marker.
- Never put the same statement in both lists."""


def _call_prompt(doc: Doc, pages: list[str]) -> str:
    p = Period.parse(doc.period)
    current_fy = p.fy + 1 if p.q == 4 else p.fy
    head = (f"This is the {doc.period} earnings call. The quarter it reports has ended; at the time of the "
            f"call the current fiscal year is FY{current_fy:02d}"
            + (f" (the call reports the last quarter of FY{p.fy:02d})" if p.q == 4 else "") + ".\n\n")
    body = "\n".join(f"[page {i}]\n{t}" for i, t in enumerate(pages, 1))
    return head + body[:MAX_CHARS]


def read_call(doc: Doc, pages: list[str]) -> tuple[CallRead | None, llm.LLMResult]:
    res = llm.call("extract_guidance", CALL_SYSTEM, _call_prompt(doc, pages), CallRead, mock=lambda: None,
                   max_tokens=12000)
    return res.output, res


# ---- 2. annual-report figures (cheap) ---------------------------------------------------------

class Pair(BaseModel):
    current: float | None = Field(description="the year the report covers, as printed")
    previous: float | None = Field(description="the previous year, as printed")


class AnnualPL(BaseModel):
    found: bool
    page: int
    basis: Literal["consolidated", "standalone", "unknown"]
    unit: Literal["crore", "lakh", "million", "thousand", "rupees", "unknown"]
    revenue: Pair = Field(description="Revenue from operations, only if a total line is printed")
    revenue_parts: list[Pair] = Field(description="if no total is printed: each line under Revenue from operations "
                                                  "(sale of products, sale of services, other operating revenue)")
    other_income: Pair
    finance_costs: Pair
    depreciation: Pair
    pbt: Pair = Field(description="Profit before tax, after exceptional items")
    pat: Pair = Field(description="Profit for the year (total)")


AR_SYSTEM = """You copy figures from the statement of profit and loss in an Indian company's annual report.
Use only the page text given. Copy each figure exactly as printed, as a plain number (no commas; negative
for figures in brackets); null if not printed. Never compute, add or round: if revenue from operations has
no total line, leave revenue null and copy each of its lines into revenue_parts. Prefer the consolidated statement
if one is given. "current" is the year the report covers, "previous" the year before. unit: as stated in
the heading (e.g. "₹ in crore", "Rs. lakh", "₹ million"). If no page is a statement of profit and loss
with both years, set found=false."""

TO_CRORE = {"crore": 1, "lakh": 0.01, "million": 0.1, "thousand": 0.0001, "rupees": 1e-7}


def pl_candidates(pages: list[str]) -> list[int]:
    """Page numbers that look like the full-year statement of profit and loss, consolidated first.
    Some reports print the title under the table, so it may sit anywhere on the page; auditors'
    reports mention the statement too and are excluded."""
    scored = []
    for i, t in enumerate(pages, 1):
        z = re.sub(r"\s+", "", t.lower())
        if "statementofprofitandloss" not in z or "revenuefromoperations" not in z or "profitbefore" not in z:
            continue
        if "auditor" in z or "auditevidence" in z or "notestothe" in z[:300] or "quarterended" in z:
            continue
        s = 4 * ("consolidatedstatementofprofit" in z) + 2 * ("yearended" in z) + min(len(re.findall(r"\d[\d,]*\.\d{2}", t)) // 10, 3)
        scored.append((s, i))
    return [i for _, i in sorted(scored, key=lambda x: (-x[0], x[1]))[:2]]


def read_annual(doc: Doc, pages: list[str]) -> tuple[dict | None, llm.LLMResult | None, list[dict]]:
    """Verified FY figures and code-computed growth/margins from the annual report, as reported items."""
    dropped: list[dict] = []
    cands = pl_candidates(pages)
    if not cands:
        return None, None, [{"stage": "annual_report", "what": "statement of profit and loss", "doc": doc.id,
                             "page": None, "why": "no statement of profit and loss found in the report"}]
    user = "\n\n".join(f"[page {n}]\n{pages[n - 1][:6000]}" for n in sorted(cands))
    res = llm.call("extract_annual", AR_SYSTEM, user, AnnualPL, mock=lambda: None, max_tokens=1500)
    t = res.output
    if t is None or not t.found or t.page not in cands:
        return None, res, [{"stage": "annual_report", "what": "statement of profit and loss", "doc": doc.id,
                            "page": t.page if t else None, "why": "model found no usable statement on the candidate pages"}]
    page = pages[t.page - 1]
    k = TO_CRORE.get(t.unit)
    fig: dict[str, dict] = {}
    printed: dict[str, dict] = {}
    for name in ("revenue", "other_income", "finance_costs", "depreciation", "pbt", "pat"):
        fig[name], printed[name] = {}, {}
        for col in ("current", "previous"):
            v = getattr(getattr(t, name), col)
            if v is not None and not number_in(abs(v), page):
                dropped.append({"stage": "annual_report", "what": f"{name} ({col} year)", "doc": doc.id,
                                "page": t.page, "why": "figure not printed on the cited page"})
                v = None
            printed[name][col] = v
            fig[name][col] = None if v is None or k is None else round(v * k, 2)
    if fig["revenue"]["current"] is None and t.revenue_parts and k is not None:
        # Revenue printed only as its parts: code adds them, and only if every part is on the page.
        parts = [[getattr(p, col) for col in ("current", "previous")] for p in t.revenue_parts]
        printed["revenue_parts"] = {col: [p[i] for p in parts] for i, col in enumerate(("current", "previous"))}
        for i, col in enumerate(("current", "previous")):
            vals = [p[i] for p in parts]
            if all(v is not None and number_in(abs(v), page) for v in vals):
                fig["revenue"][col] = round(sum(vals) * k, 2)
                dropped = [d for d in dropped if d["what"] != f"revenue ({col} year)"]
        fig["revenue"]["how"] = f"sum of {len(parts)} printed lines"
    fy = Period.parse(doc.period)
    lender = "interestearned" in re.sub(r"\s+", "", page.lower())
    ebitda = {}
    for col in ("current", "previous"):
        parts = [fig[x][col] for x in ("pbt", "finance_costs", "depreciation", "other_income")]
        ebitda[col] = None if lender or any(p is None for p in parts) else round(parts[0] + parts[1] + parts[2] - parts[3], 2)
    out = {"doc": doc.id, "page": t.page, "basis": t.basis, "unit": t.unit, "fy": doc.period,
           "prev_fy": Period(fy.fy - 1).label, "figures": fig | {"ebitda": ebitda}, "printed": printed,
           "lender": lender}
    return out, res, dropped


def annual_items(pl: dict | None) -> list[dict]:
    """Annual-report figures as reported items. Growth and margins are computed here, never by a model."""
    if not pl:
        return []
    f, fy, prev, page, doc = pl["figures"], pl["fy"], pl["prev_fy"], pl["page"], pl["doc"]
    base = {"doc": doc, "page": page, "speaker": "", "quote": "", "source": "annual_report", "basis": pl["basis"]}
    items = []

    def add(metric, label, period, value, unit, how):
        if value is not None:
            items.append(base | {"id": f"AR:{metric}:{period}", "metric": metric, "label": label, "period": period,
                                 "value": value, "unit": unit, "how": how})

    rev, ebitda, pat = f["revenue"], f["ebitda"], f["pat"]
    add("revenue", "Revenue from operations", fy, rev["current"], "crore", "printed")
    add("revenue", "Revenue from operations", prev, rev["previous"], "crore", "printed")
    add("pat", "Profit after tax", fy, pat["current"], "crore", "printed")
    summed = f" (each year the sum of {rev['how'].removeprefix('sum of ')})" if rev.get("how") else ""
    add("revenue_growth", "Revenue growth", fy, pct(rev["current"], rev["previous"]), "%",
        f"computed: ₹{rev['current']:,} cr vs ₹{rev['previous']:,} cr{summed}" if rev["previous"] else "")
    if ebitda["current"] is not None and rev["current"]:
        add("ebitda", "EBITDA (PBT + finance costs + D&A − other income)", fy, ebitda["current"], "crore", "computed")
        add("ebitda_margin", "EBITDA margin", fy, round(ebitda["current"] / rev["current"] * 100, 1), "%",
            f"computed: EBITDA ₹{ebitda['current']:,} cr / revenue ₹{rev['current']:,} cr")
    if pat["current"] is not None and rev["current"]:
        add("pat_margin", "PAT margin", fy, round(pat["current"] / rev["current"] * 100, 1), "%",
            f"computed: PAT ₹{pat['current']:,} cr / revenue ₹{rev['current']:,} cr")
    return items


# ---- 3. grouping and judging (strong) ---------------------------------------------------------

class Evidence(BaseModel):
    doc: str = Field(description="doc id of the passage, e.g. 'T-Q4FY26'")
    page: int
    quote: str = Field(description="10 to 60 words copied exactly from the passage")
    value: float | None = Field(description="the delivered figure if the quote states one, as written")
    unit: Unit
    period: str = Field(description="period the quote's figure or event is for, e.g. 'FY26', 'Q4 FY26'")


class Group(BaseModel):
    promise_ids: list[str] = Field(description="the same commitment as stated on successive calls, oldest first")
    actual_ids: list[str] = Field(description="reported items that show what was delivered for it; [] if none")
    evidence: Evidence | None = Field(description="only if no reported item settles it: a quote from the passages given for it")
    verdict: Literal["met", "partially", "missed", "too_vague", "not_found"]
    reason: str = Field(description="at most 25 words; only numbers that appear in the cited items")


class Judgement(BaseModel):
    groups: list[Group]
    credibility: str = Field(description="one sentence, at most 25 words, on the track record shown by these items")


JUDGE_SYSTEM = """You check an Indian company's management against its own guidance, using only the items
given (verified quotes from its earnings calls and figures from its annual report). No outside knowledge.

1. Group promises that are the same commitment restated or revised on later calls (same metric, same
   period). Every promise id appears in exactly one group; a promise with no restatement is a group of one.
2. For each group, list the reported items that show what was delivered for that metric and period
   (actual_ids). Prefer annual-report items for full-year figures. If none settles it, look in the
   passages given for that promise ("search") and, if one says what happened, set evidence with a quote
   copied exactly from it. Otherwise leave both empty.
3. verdict, judged against the FIRST statement in the group:
   met = delivered at or above the target (or the milestone happened by the date);
   partially = clearly short but most of the way, or the milestone happened in part or late;
   missed = clearly short, or the milestone didn't happen by the date;
   too_vague = no number and no checkable milestone, or no period;
   not_found = the items don't say what happened.
   Code recomputes the verdict for numeric promises with a comparable figure; yours is used for the rest.
4. reason: plain words, at most 25 words, quoting only numbers that appear in the cited items. No new
   arithmetic: if a difference isn't given, don't state one.
5. credibility: one sentence on the overall record shown by these items. No adjectives like "strong",
   "impressive", "robust". Only numbers that appear in the items."""


STOP = set("the and for with from that this will our are was have has been into than more less over about "
           "guidance target growth order orders year quarter".split())


COMMON_ACRONYMS = {"INR", "EBITDA", "PAT", "PBT", "USD", "CEO", "CFO", "YOY", "QOQ", "GST", "FY", "CAGR"}


def search_terms(p: dict, symbol: str = "") -> list[str]:
    """Words to look for in later calls: acronyms from the quote (QRSAM, LRSAM), then the label's own
    words. Acronyms weigh more; the company's own name and finance shorthand don't count."""
    acr = [a for a in re.findall(r"\b[A-Z][A-Z-]{2,}\b", p["quote"]) if a not in COMMON_ACRONYMS and a != symbol]
    words = [w for w in re.findall(r"[a-z][a-z-]{3,}", p["label"].lower()) if w not in STOP]
    out: list[str] = []
    for t in acr + words:
        if t.lower() not in (o.lower() for o in out):
            out.append(t)
    return out[:6]


def passages(p: dict, texts: dict[str, list[str]], calls: list[Doc], symbol: str = "", per_promise: int = 3) -> list[dict]:
    """Pages from calls after the promise that mention its terms, best first. Rules only, no model."""
    made = Period.parse(p["call"])
    terms = search_terms(p, symbol)
    if not terms:
        return []
    need = min(2, sum(3 if t.isupper() else 1 for t in terms))
    hits = []
    for d in calls:
        if Period.parse(d.period) <= made:
            continue
        for n, page in enumerate(texts[d.id], 1):
            low = page.lower()
            score = sum(3 if t.isupper() else 1 for t in terms if t.lower() in low)
            if score >= need:
                i = min((low.find(t.lower()) for t in terms if t.lower() in low), default=0)
                hits.append((score, d.period, d.id, n, page[max(0, i - 700): i + 1300]))
    hits.sort(key=lambda h: (-h[0], h[1]))
    return [{"doc": h[2], "call": h[1], "page": h[3], "text": h[4]} for h in hits[:per_promise]]


def judge(promises: list[dict], actuals: list[dict], latest: str, evidence: dict[str, list[dict]]
          ) -> tuple[Judgement | None, llm.LLMResult]:
    def p_line(p):
        line = {"id": p["id"], "call": p["call"], "metric": p["metric"], "label": p["label"], "kind": p["kind"],
                "target": format_target(p), "due": p["horizon"], "quote": p["quote"]}
        if evidence.get(p["id"]):
            line["search"] = evidence[p["id"]]
        return line

    def a_line(a):
        return {"id": a["id"], "source": a["source"], "period": a["period"], "metric": a["metric"], "label": a["label"],
                "value": None if a["value"] is None else f"{fmt_num(a['value'])} {UNIT_LABEL[a['unit']]}".strip(),
                "quote": a["quote"] or a.get("how", "")}

    user = json.dumps({"latest_period_reported": latest, "promises": [p_line(p) for p in promises],
                       "reported": [a_line(a) for a in actuals]}, ensure_ascii=False, indent=0)
    res = llm.call("verdict", JUDGE_SYSTEM, user, Judgement, mock=lambda: None, max_tokens=24000)
    return res.output, res


# ---- 4. code-side rules -----------------------------------------------------------------------

UNIT_LABEL = {"%": "%", "crore": "cr", "usd_million": "$ mn", "usd_billion": "$ bn", "none": ""}


def fmt_num(v: float) -> str:
    return f"{v:,.2f}".rstrip("0").rstrip(".")


def format_target(p: dict) -> str:
    lo, hi, u = p["target_low"], p["target_high"], p["unit"]
    if lo is None and hi is None:
        return ""
    def one(v):
        if u == "%":
            return f"{fmt_num(v)}%"
        if u == "crore":
            return f"₹{fmt_num(v)} cr"
        if u in ("usd_million", "usd_billion"):
            return f"${fmt_num(v)} {'mn' if u == 'usd_million' else 'bn'}"
        return fmt_num(v)
    if lo is not None and hi is not None and hi != lo:
        return f"{one(lo)}–{one(hi)}"
    v = lo if lo is not None else hi
    return {"at_least": f"{one(v)}+", "at_most": f"under {one(v)}", "about": f"about {one(v)}"}.get(p["direction"], one(v))


def due_of(label: str) -> tuple[int, int] | None:
    """(fy, last quarter) a horizon label is due by: 'H1 FY26' -> (26, 2), 'FY26' -> (26, 4)."""
    m = re.fullmatch(r"\s*(?:(Q[1-4]|H[12]|9M)\s*)?FY\s*'?(\d{2}|\d{4})\s*", label or "", re.I)
    if not m:
        return None
    part = (m.group(1) or "").upper()
    q = {"": 4, "H1": 2, "H2": 4, "9M": 3}.get(part) or int(part[1])
    return int(m.group(2)[-2:]), q


def canonical(label: str) -> str:
    m = re.fullmatch(r"\s*(?:(Q[1-4]|H[12]|9M)\s*)?FY\s*'?(\d{2}|\d{4})\s*", label or "", re.I)
    return f"{(m.group(1).upper() + ' ') if m.group(1) else ''}FY{m.group(2)[-2:]}" if m else label.strip()


AR_METRICS = {"revenue", "revenue_growth", "ebitda", "ebitda_margin", "pat", "pat_margin"}


def numeric_verdict(p: dict, value: float) -> str:
    """met / partially / missed against the first stated target. 'Partially': within 1 percentage point
    of a margin target, or at least 80% of a growth or absolute target. 'About X' is met within half a
    point of a margin or 3% of anything else."""
    lo, hi = p["target_low"], p["target_high"]
    margin = p["metric"].endswith("margin")
    if p["direction"] == "at_most":
        t = hi if hi is not None else lo
        if value <= t:
            return "met"
        return "partially" if (value <= t + 1 if margin else value <= t * 1.2) else "missed"
    t = lo if lo is not None else hi
    if p["direction"] == "about" and (abs(value - t) <= 0.5 if margin else abs(value - t) <= abs(t) * 0.03):
        return "met"
    if value >= t:
        return "met"
    if margin:
        return "partially" if value >= t - 1 else "missed"
    return "partially" if t > 0 and value >= 0.8 * t else "missed"


def allowed_numbers(items: list[dict]) -> set[str]:
    out: set[str] = set()
    for it in items:
        for k in ("quote", "label", "period", "horizon", "call", "how"):
            out |= numbers(str(it.get(k) or ""))
        for k in ("value", "target_low", "target_high"):
            if it.get(k) is not None:
                out |= numbers(fmt_num(abs(it[k])))
    return out


# ---- 5. the whole run -------------------------------------------------------------------------

def _url(doc: Doc, page: int) -> str:
    return f"{doc.url}#page={page}"


def run(ds: DocSet, texts: dict[str, list[str]], name: str = "") -> dict:
    docs = {d.id: d for d in ds.calls + ([ds.annual_report] if ds.annual_report else [])}
    dropped: list[dict] = []
    models: dict[str, list] = {"extract_guidance": [], "extract_annual": [], "verdict": []}
    promises, actuals = [], []

    for doc in ds.calls:
        read, res = read_call(doc, texts[doc.id])
        models["extract_guidance"].append({"doc": doc.id, "model": res.model, "source": res.source, "note": res.note,
                                           "fallbacks": res.fallbacks})
        if read is None:
            dropped.append({"stage": "read", "what": f"{doc.period} call", "doc": doc.id, "page": None,
                            "why": f"call not read ({res.note or res.source})"})
            continue
        pages = texts[doc.id]
        for n, p in enumerate(read.promises, 1):
            item = p.model_dump() | {"id": f"P{doc.id[2:]}-{n}", "doc": doc.id, "call": doc.period,
                                     "horizon": canonical(p.horizon)}
            why = _check(item, pages, ("target_low", "target_high"))
            if why:
                dropped.append({"stage": "promise", "what": p.label, "doc": doc.id, "page": p.page, "why": why})
            else:
                promises.append(item)
        for n, a in enumerate(read.reported, 1):
            item = a.model_dump() | {"id": f"R{doc.id[2:]}-{n}", "doc": doc.id, "source": "transcript",
                                     "period": canonical(a.period), "how": "as stated by management"}
            why = _check(item, pages, ("value",))
            if why:
                dropped.append({"stage": "reported", "what": a.label, "doc": doc.id, "page": a.page, "why": why})
            else:
                actuals.append(item)

    pl = None
    if ds.annual_report:
        pl, res, d = read_annual(ds.annual_report, texts[ds.annual_report.id])
        dropped += d
        if res:
            models["extract_annual"].append({"doc": ds.annual_report.id, "model": res.model, "source": res.source,
                                             "note": res.note, "fallbacks": res.fallbacks})
    actuals += annual_items(pl)

    latest = max((Period.parse(d.period) for d in ds.calls)).label
    due_now = [p for p in promises if (d := due_of(p["horizon"])) and d <= due_of(latest)]
    evidence = {p["id"]: passages(p, texts, ds.calls, ds.symbol) for p in due_now}
    j, res = judge(promises, actuals, latest, evidence) if promises else (None, None)
    if res:
        models["verdict"].append({"model": res.model, "source": res.source, "note": res.note, "fallbacks": res.fallbacks})
    rows, judge_dropped = assemble(promises, actuals, j, latest, docs, texts, evidence)
    dropped += judge_dropped
    counts = {v: sum(r["verdict"] == v for r in rows) for v in VERDICTS}
    cred = _credibility(j, rows, counts, promises + actuals, res)
    return {
        "symbol": ds.symbol, "name": name, "generated_at": datetime.now().isoformat(timespec="seconds"),
        "status": "ok" if rows else "empty", "latest_period": latest,
        "docs": ds.to_dict(), "financials": pl, "models": models,
        "scorecard": {"counts": counts, "checkable": counts["met"] + counts["partially"] + counts["missed"],
                      "credibility": cred, "rows": rows},
        "dropped": dropped,
        "judged": bool(j),
    }


def _check(item: dict, pages: list[str], number_fields: tuple[str, ...]) -> str:
    """Why an extracted item fails verification, or '' if it passes."""
    if not 1 <= item["page"] <= len(pages):
        return f"cited page {item['page']} doesn't exist"
    if not quote_on_page(item["quote"], pages[item["page"] - 1]):
        # Transcripts print "Page 3 of 20" on PDF page 4 and models sometimes cite the printed number.
        # Re-cite only when the quote is verbatim on exactly one neighbouring page.
        near = [n for n in (item["page"] - 1, item["page"] + 1) if 1 <= n <= len(pages)
                and quote_on_page(item["quote"], pages[n - 1])]
        if len(near) != 1:
            return "quote not found on the cited page"
        item["page_cited"], item["page"] = item["page"], near[0]
    for f in number_fields:
        if not value_in(item.get(f), item["quote"]):
            return f"{fmt_num(item[f])} is not in the quote"
    if "horizon" in item and item["horizon"] != "unspecified" and not due_of(item["horizon"]):
        item["horizon"] = "unspecified"
    if "period" in item and not due_of(item["period"]):
        return f"period '{item['period']}' isn't a fiscal period"
    return ""


def assemble(promises, actuals, j: Judgement | None, latest: str, docs: dict[str, Doc],
             texts: dict[str, list[str]], evidence: dict[str, list[dict]]) -> tuple[list[dict], list[dict]]:
    by_p = {p["id"]: p for p in promises}
    by_a = {a["id"]: a for a in actuals}
    dropped, seen, groups = [], set(), []
    order = lambda pid: (Period.parse(by_p[pid]["call"]), pid)  # noqa: E731
    for g in (j.groups if j else []):
        ids = sorted({i for i in g.promise_ids if i in by_p and i not in seen}, key=order)
        if not ids:
            continue
        seen |= set(ids)
        aids = [a for a in g.actual_ids if a in by_a]
        if g.evidence and not aids:
            item, why = _evidence_item(g.evidence, by_p[ids[0]], ids, evidence, texts)
            if why:
                dropped.append({"stage": "evidence", "what": by_p[ids[0]]["label"], "doc": g.evidence.doc,
                                "page": g.evidence.page, "why": why})
            else:
                by_a[item["id"]] = item
                aids = [item["id"]]
        groups.append((ids, aids, g))
    groups += [([pid], [], None) for pid in sorted(set(by_p) - seen, key=order)]

    latest_due = due_of(latest)
    rows = []
    for ids, aids, g in groups:
        # A later statement with a figure the model didn't read stays: it may be the cut.
        ids = [i for n, i in enumerate(ids) if not row_problem(by_p[i], lead=n == 0)] or ids
        first, last = settle_direction(by_p[ids[0]]), by_p[ids[-1]]
        why = row_problem(first)
        if why:
            dropped.append({"stage": "promise", "what": first["label"], "doc": first["doc"], "page": first["page"], "why": why})
            continue
        horizon = last["horizon"] if last["horizon"] != "unspecified" else first["horizon"]
        due = due_of(horizon)
        verdict, by, reason, delivered = None, "rule", "", None
        if due is not None and due > latest_due:
            verdict = "not_yet_due"
        elif first["kind"] == "qualitative" or (first["kind"] == "numeric" and first["target_low"] is None
                                                and first["target_high"] is None) or due is None:
            verdict = "too_vague"
            reason = "No number or milestone to check against." if due else "No fixed date to check against."
        else:
            def fits(a):
                return (a["metric"] == first["metric"] and a["unit"] == first["unit"] and a["value"] is not None
                        and due_of(a["period"]) == due and same_measure(first, a)
                        and (a["source"] == "annual_report" or unit_stated(a, "value")))
            comparable = [x for x in (period_from_quote(by_a[a]) for a in aids) if fits(x)]
            comparable.sort(key=lambda a: a["source"] != "annual_report")
            if not comparable:
                # The judge listed nothing usable: code matches verified figures itself, but only when
                # exactly one value fits (consolidated 16% and standalone 17% in one quarter don't).
                pool = [x for x in (period_from_quote(a) for a in actuals) if fits(x)]
                if len({x["value"] for x in pool}) == 1:
                    comparable = sorted(pool, key=lambda a: a["source"] != "annual_report")[:1]
            if first["kind"] == "numeric" and comparable:
                a = comparable[0]
                verdict, delivered = numeric_verdict(first, a["value"]), a
            elif first["kind"] == "numeric":
                verdict = "not_found"
                reason = (f"FINN found no {horizon} figure for this in the later calls"
                          + (" or the annual report's profit and loss statement." if first["metric"] in AR_METRICS else "."))
            elif g and g.verdict in ("met", "partially", "missed") and aids:
                verdict, by, delivered = g.verdict, "model", by_a[aids[0]]
            elif g and g.verdict == "too_vague":
                verdict, by = "too_vague", "model"
            else:
                searched = any(evidence.get(i) for i in ids)
                verdict = "not_found"
                reason = ("Later calls mention it; FINN found none that says whether it happened." if searched
                          else "FINN found no later call that mentions it.")
        if g and g.reason and by == "model":
            cited = [by_p[i] for i in ids] + [by_a[a] for a in aids]
            if numbers(g.reason) <= allowed_numbers(cited):
                reason = g.reason
            else:
                dropped.append({"stage": "verdict", "what": first["label"], "doc": first["doc"], "page": first["page"],
                                "why": "judge's reason used a number not in the cited items; verdict withheld"})
                verdict, by, reason, delivered = "not_found", "rule", "Verdict withheld: reasoning didn't check out.", None
        rows.append({
            "id": ids[0], "metric": first["metric"], "label": first["label"], "kind": first["kind"],
            "verdict": verdict, "verdict_by": by, "reason": reason, "due": horizon,
            "promised": _claim(first, docs) | {"target": format_target(first)},
            "revisions": [_claim(by_p[i], docs) | {"target": format_target(by_p[i])} for i in ids[1:]
                          if format_target(by_p[i]) and _target(by_p[i]) != _target(first)],
            "restated": len(ids) - 1,
            # Every later statement, so a cut the model didn't read as a number still shows its quote.
            "later": [_claim(by_p[i], docs) | {"target": format_target(by_p[i]),
                                               "change": ("no figure read" if not format_target(by_p[i])
                                                          else "revised" if _target(by_p[i]) != _target(first) else "restated")}
                      for i in ids[1:]],
            "delivered": _actual(delivered, docs) if delivered else None,
        })
    rank = {"missed": 0, "partially": 1, "met": 2, "not_found": 3, "too_vague": 4, "not_yet_due": 5}
    rows.sort(key=lambda r: (rank[r["verdict"]], Period.parse(r["promised"]["call"])))
    return rows, dropped


def _evidence_item(e: Evidence, first: dict, ids: list[str], evidence: dict[str, list[dict]],
                   texts: dict[str, list[str]]) -> tuple[dict | None, str]:
    """The judge's evidence counts only if it's from a passage we gave it, verbatim on that page,
    and any figure is in the quote."""
    given = {(x["doc"], x["page"]) for i in ids for x in evidence.get(i, [])}
    if (e.doc, e.page) not in given:
        return None, "evidence cited a page that wasn't among the passages searched"
    if not quote_on_page(e.quote, texts[e.doc][e.page - 1]):
        return None, "evidence quote not found on the cited page"
    if not value_in(e.value, e.quote):
        return None, f"{fmt_num(e.value)} is not in the evidence quote"
    period = canonical(e.period)
    return {"id": f"E-{ids[0]}", "metric": first["metric"], "label": first["label"],
            "period": period if due_of(period) else first["horizon"], "value": e.value, "unit": e.unit,
            "speaker": "", "quote": e.quote, "doc": e.doc, "page": e.page, "source": "transcript",
            "how": "found by searching later calls"}, ""


_UNIT_WORDS = {"%": r"%|per ?cent", "crore": r"crore|\bcr\b|\bcrs?\.", "usd_million": r"\$|dollar|usd",
               "usd_billion": r"\$|dollar|usd"}
_FIGURE = re.compile(r"\d[\d,.]*\s*(%|per ?cent|crore|\bcr\b|million|billion|lakh)|(₹|rs\.?|inr|\$)\s*\d", re.I)
_ABOUT = re.compile(r"\b(about|around|approximately|nearly|almost|close to|roughly)\b", re.I)
_AT_LEAST = re.compile(r"\+|plus|more than|at least|minimum|north of|over|above|exceed|cross", re.I)


def unit_stated(item: dict, value_key: str) -> bool:
    """The quote must say the unit the figure is read in: '70 to 85 days' isn't 70%, and
    'INR25,000 million' isn't ₹25,000 crore."""
    if item.get(value_key) is None or item["unit"] == "none":
        return True
    q = item["quote"]
    if item["unit"] == "crore" and re.search(r"million|billion", q, re.I) and not re.search(r"crore", q, re.I):
        return False
    return bool(re.search(_UNIT_WORDS[item["unit"]], q, re.I))


def row_problem(p: dict, lead: bool = True) -> str:
    """Why a promise can't be shown honestly as extracted, or ''. Applied after the judge, so a rule
    change replays recorded model output instead of calling the model again."""
    has_target = p["target_low"] is not None or p["target_high"] is not None
    due, made = due_of(p["horizon"]), due_of(p["call"])
    if due and made and due <= made:
        return "due by the quarter the call itself reports, so it isn't a forward-looking promise"
    if "?" in p["quote"]:
        return "the quote is a question, not a promise"
    if has_target and p["unit"] == "none":
        return "a figure with no unit FINN can show; left out rather than shown as a bare number"
    if has_target and not unit_stated(p, "target_low" if p["target_low"] is not None else "target_high"):
        return "the quote doesn't state the unit the target was read in"
    if lead and not has_target and p["kind"] != "milestone" and _FIGURE.search(p["quote"]):
        return "the quote states a figure that wasn't read as the target; not judged"
    return ""


_QLABEL = re.compile(r"\b(Q[1-4]|H[12]|9M)\s*FY\s*'?\s*(\d{4}|\d{2})\b", re.I)


def period_from_quote(a: dict) -> dict:
    """A period written in the quote beats the model's label: 'Q4 FY26 EBIT of the firm is 16.6%'
    was recorded as Q1 FY26. Only when the quote names exactly one period."""
    found = {canonical(f"{m.group(1)} FY{m.group(2)[-2:]}") for m in _QLABEL.finditer(a.get("quote") or "")}
    if len(found) == 1 and a["period"] not in found:
        return a | {"period": found.pop(), "period_read": a["period"]}
    return a


def margin_kind(text: str) -> str | None:
    if re.search(r"EBITDA|PBDIT|operating profit before dep", text, re.I):
        return "ebitda"
    if re.search(r"\bEBIT\b", text):
        return "ebit"
    return None


def same_measure(p: dict, a: dict) -> bool:
    """EBIT guidance isn't met by an EBITDA figure: both share a metric key, so the words decide."""
    kp = margin_kind(f"{p['label']} {p['quote']}")
    ka = margin_kind(f"{a['label']} {a['quote']} {a.get('how', '')}")
    return kp is None or ka is None or kp == ka


def settle_direction(p: dict) -> dict:
    """'about INR300 crores' is a point target, not '₹300 cr+'."""
    if p["direction"] == "at_least" and _ABOUT.search(p["quote"]) and not _AT_LEAST.search(p["quote"]):
        return p | {"direction": "about"}
    return p


def _target(p: dict) -> tuple:
    """What a revision changes: the bound that's checked. '15%+' restating '15%–17%' is not a revision."""
    return (p["target_high"],) if p["direction"] == "at_most" else (p["target_low"] if p["target_low"] is not None else p["target_high"],)


def _claim(p: dict, docs: dict[str, Doc]) -> dict:
    return {"call": p["call"], "speaker": p["speaker"], "quote": p["quote"], "doc": p["doc"], "page": p["page"],
            "url": _url(docs[p["doc"]], p["page"])}


def format_value(v: float | None, unit: str) -> str:
    if v is None:
        return ""
    return format_target({"target_low": v, "target_high": None, "unit": unit, "direction": "range"})


def _actual(a: dict, docs: dict[str, Doc]) -> dict:
    return {"value": a["value"], "unit": a["unit"], "text": format_value(a["value"], a["unit"]),
            "period": a["period"], "label": a["label"], "source": a["source"], "how": a.get("how", ""),
            "speaker": a["speaker"], "quote": a["quote"], "doc": a["doc"], "page": a["page"],
            "url": _url(docs[a["doc"]], a["page"]), "title": docs[a["doc"]].title}


def _credibility(j: Judgement | None, rows, counts, items, res) -> dict:
    """Headline and line are built from the verdicts by code. The judge's own sentence isn't shown:
    a numbers check can't stop it calling a 'partially' row 'missed', and a line that contradicts the
    rows below it is worse than none."""
    n = counts["met"] + counts["partially"] + counts["missed"]
    headline = f"Met {counts['met']} of {n} checkable promises" if n else "No promise could be checked yet"

    def names(v):
        labels = [r["label"][:1].lower() + r["label"][1:] if r["label"][1:2].islower() else r["label"]
                  for r in rows if r["verdict"] == v]
        return labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + " and " + labels[-1] if labels else ""

    parts = [f"{word} {names(v)}" for v, word in (("missed", "Missed"), ("partially", "short on"), ("met", "delivered"))
             if names(v)]
    line = "; ".join(parts) + "." if parts else ""
    return {"headline": headline, "line": line[:1].upper() + line[1:], "by": "FINN"}


# ---- recording --------------------------------------------------------------------------------

def recording_path(symbol: str):
    return settings.data_dir / "recordings" / "research" / f"{symbol.upper()}.json"


def pages_path(symbol: str):
    return settings.data_dir / "recordings" / "research" / f"{symbol.upper()}.pages.json.gz"


def save(rec: dict, texts: dict[str, list[str]]) -> None:
    """Write the recording plus the text of every page it cites, so CI can re-verify each claim
    without the PDFs (which are never committed)."""
    cited: dict[str, dict[str, str]] = {}
    for r in rec["scorecard"]["rows"]:
        for c in [r["promised"], *r["revisions"], *r.get("later", []), *([r["delivered"]] if r["delivered"] else [])]:
            cited.setdefault(c["doc"], {})[str(c["page"])] = texts[c["doc"]][c["page"] - 1]
    if rec.get("financials"):
        f = rec["financials"]
        cited.setdefault(f["doc"], {})[str(f["page"])] = texts[f["doc"]][f["page"] - 1]
    p = recording_path(rec["symbol"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(rec, indent=1, ensure_ascii=False))
    pages_path(rec["symbol"]).write_bytes(gzip.compress(json.dumps(cited, ensure_ascii=False).encode(), mtime=0))


def reverify(rec: dict, cited: dict[str, dict[str, str]]) -> list[str]:
    """Every recorded claim re-checked against the stored page text. Returns the failures (should be none)."""
    bad = []
    for r in rec["scorecard"]["rows"]:
        for c in [r["promised"], *r["revisions"], *r.get("later", [])]:
            if not quote_on_page(c["quote"], cited[c["doc"]][str(c["page"])]):
                bad.append(f"{r['label']}: promise quote not on {c['doc']} p.{c['page']}")
        d = r["delivered"]
        if d:
            page = cited[d["doc"]][str(d["page"])]
            if d["quote"] and not quote_on_page(d["quote"], page):
                bad.append(f"{r['label']}: delivery quote not on {d['doc']} p.{d['page']}")
            if d["source"] == "transcript" and not value_in(d["value"], d["quote"]):
                bad.append(f"{r['label']}: delivered figure not in its quote")
    f = rec.get("financials")
    if f:
        page = cited[f["doc"]][str(f["page"])]
        for name, cols in f["printed"].items():
            for col, vals in cols.items():
                for v in (vals if isinstance(vals, list) else [vals]):
                    if v is not None and not number_in(abs(v), page):
                        bad.append(f"annual report {name} {col} not on p.{f['page']}")
    return bad


def catalog() -> list[dict]:
    """Recorded research, for the index the app shows and for deciding where Ask FINN can go."""
    d = settings.data_dir / "recordings" / "research"
    out = []
    for p in sorted(d.glob("*.json")) if d.exists() else []:
        r = json.loads(p.read_text())
        out.append({"symbol": r["symbol"], "name": r["name"], "headline": r["scorecard"]["credibility"]["headline"],
                    "counts": r["scorecard"]["counts"], "latest_period": r["latest_period"],
                    "generated_at": r["generated_at"]})
    return out


def load(symbol: str) -> dict | None:
    p = recording_path(symbol)
    return json.loads(p.read_text()) if p.exists() else None
