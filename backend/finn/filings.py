"""Reading the filing itself, for the filings NSE's one-line text can't place or summarise.

Rules first (classify.py). Only `ambiguous` filings and the kinds the briefing summarises go to the
cheap model, with the filing's first pages and the category definitions in the prompt. Each read is
recorded by NSE announcement ID under data/recordings/filings/, so a filing is read once, ever, and
the static demo replays reads with no network or key. A read is used only if its quote is found in
the filing text and its numbers are too (verify.py); otherwise the briefing falls back to the rules.
"""
import io
import json
import re
from typing import Literal

from pydantic import BaseModel, Field

from . import http, llm
from .classify import HIGH, MEDIUM, ROUTINE, Classified, is_top_role
from .config import settings
from .sources.nse import Announcement
from .verify import numbers_in, quote_in

CATEGORIES = Literal[
    "results", "M&A", "fund_raise", "management_change", "litigation", "insider_trading", "earnings_call",
    "investor_meetings", "credit_rating", "dividend", "bonus_split", "capex", "press_release",
    "postal_ballot", "agm_egm", "pledging", "unclassified",
]

# What the briefing writes a one-line summary for, even when the rules placed it (treatment table).
SUMMARISE = {"M&A", "Restructuring", "Litigation / regulatory order", "Equity issuance", "Buyback", "Fund raise",
             "Capex / expansion", "Order win"}

FIGURE = re.compile(r"\d[\d,.]*\s*(%|crore|cr\b|lakh|mn\b|million|bn\b|billion)|(rs\.?|inr|₹)\s*\d", re.I)

# Category -> the group label and "why" key the digest uses when a read reclassifies a filing.
REASON = {
    ("results", HIGH): "Quarterly results", ("results", MEDIUM): "Results deck",
    ("results", ROUTINE): "Results newspaper ads",
    ("management_change", HIGH): "Top management change", ("management_change", MEDIUM): "Board change",
    ("management_change", ROUTINE): "Senior staff changes",
    ("M&A", HIGH): "M&A", ("M&A", MEDIUM): "Restructuring", ("M&A", ROUTINE): "Subsidiary housekeeping",
    ("litigation", HIGH): "Litigation / regulatory order", ("litigation", MEDIUM): "Litigation / regulatory order",
    ("fund_raise", HIGH): "Fund raise", ("fund_raise", MEDIUM): "Fund raise", ("fund_raise", ROUTINE): "Routine debt issuance",
    ("credit_rating", HIGH): "Credit rating downgrade", ("credit_rating", MEDIUM): "Credit rating upgrade",
    ("pledging", HIGH): "Promoter pledge", ("pledging", MEDIUM): "Promoter pledge",
    ("insider_trading", MEDIUM): "Insider trades", ("insider_trading", HIGH): "Insider trades",
    ("dividend", MEDIUM): "Dividend", ("bonus_split", MEDIUM): "Bonus / split", ("capex", MEDIUM): "Capex / expansion",
    ("capex", HIGH): "Capex / expansion", ("press_release", MEDIUM): "Product / approval news",
    ("earnings_call", MEDIUM): "Concall transcript",
}
ROUTINE_GROUP = {
    "earnings_call": "Concall notices & recordings", "investor_meetings": "Investor meetings",
    "agm_egm": "Shareholder meetings & ballots", "postal_ballot": "Shareholder meetings & ballots",
    "credit_rating": "Credit ratings (no change stated)", "dividend": "Dividend", "press_release": "General press releases",
}

SYSTEM = """You read one Indian stock-exchange filing and label it for an investor's daily briefing.
Use only the filing text given. Never use outside knowledge.

Categories (pick exactly one):
- results: quarterly/annual results, the board meeting approving them, results decks, shareholder letters, and newspaper ads of results already published.
- M&A: acquisition, merger, demerger, joint venture, investing in or selling a stake in a subsidiary, a subsidiary's IPO or listing.
- fund_raise: rights issue, QIP, preferential allotment, buyback, debt (NCDs, commercial paper).
- management_change: a CEO, CFO, MD, director or KMP joining, resigning, retiring or being re-designated.
- litigation: lawsuits, regulatory orders, fines, warnings, tax demands, insolvency proceedings (say whether the company is the debtor or a creditor).
- insider_trading: a promoter or insider buying or selling their own shares.
- earnings_call: the investor call notice, transcript or recording link.
- investor_meetings: meetings with specific investors or funds, investor conferences.
- credit_rating: a rating assigned, upgraded, downgraded or reaffirmed.
- dividend: a cash dividend and its record date.
- bonus_split: a bonus issue or stock split.
- capex: approving spend on a new plant, facility or capacity.
- press_release: general news: order wins, products, partnerships, clarifications.
- postal_ballot, agm_egm: shareholder votes and meetings.
- pledging: promoter pledge created, released or changed.
- unclassified: routine paperwork (ESOP allotments, compliance certificates, auditor appointments, newspaper notices that are not results).

Watch for traps: a newspaper advertisement of results is "results" with importance "routine" (it repeats the results filing).
A covering letter that only says results "will be considered" at a future meeting is "results", importance "medium".
A subsidiary's listing is "M&A" even if it mentions the subsidiary's results.
A litigation update that only sets or moves a hearing date is importance "medium"; an order, judgment or demand is "high".
Debt raising (NCDs, commercial paper, borrowing limits) is "fund_raise" with importance "routine".

Importance:
- high: could change an investor's view of the stock now (results themselves, CEO/CFO/MD change, acquisition, adverse order, rating downgrade, pledge, buyback).
- medium: worth a line in the briefing (board changes, order wins, dividends, capex, equity issues, transcripts).
- routine: paperwork the investor should never need to read, and corporate news with no bearing on earnings (awards, CSR, events, ESG reports, office openings without stated capacity or spend).

summary: one line, at most 25 words, leading with the number or the person if there is one. Plain words, no adjectives like "significant".
Only numbers that appear in the filing. Empty string if the filing says nothing beyond its title.
quote: a short exact phrase (8 to 30 words) copied verbatim from the filing that supports the category and summary.
page: the page number the quote is on."""


class FilingRead(BaseModel):
    category: CATEGORIES
    importance: Literal["high", "medium", "routine"]
    summary: str = Field(description="one line, <=25 words, numbers only from the filing")
    quote: str = Field(description="exact phrase copied from the filing")
    page: int


def _path(ann_id: str):
    return settings.data_dir / "recordings" / "filings" / f"{ann_id}.json"


def load_reads() -> dict[str, dict]:
    d = settings.data_dir / "recordings" / "filings"
    return {p.stem: json.loads(p.read_text()) for p in sorted(d.glob("*.json"))} if d.exists() else {}


def pdf_pages(url: str, max_pages: int = 3) -> list[str]:
    """Text of the first pages. Image-only PDFs come back as empty strings."""
    from pypdf import PdfReader
    body = http.get(url, ttl=None, headers={"Referer": "https://www.nseindia.com/"}).body
    if not body.startswith(b"%PDF"):
        raise http.FetchError("not a PDF")
    reader = PdfReader(io.BytesIO(body))
    return [(p.extract_text() or "") for p in reader.pages[:max_pages]]


def needs_read(c: Classified) -> bool:
    return c.ambiguous or c.reason in SUMMARISE


def read(a: Announcement, c: Classified) -> dict:
    """Read one filing and record the outcome by announcement ID (including failures, so we don't retry)."""
    rec = {"id": a.id, "symbol": a.symbol, "url": a.url, "rules": {"category": c.category, "tier": c.tier}}
    try:
        pages = pdf_pages(a.url)
    except http.FetchError as e:
        rec |= {"status": "unavailable", "note": f"Filing could not be fetched ({e})"}
        return _save(rec)
    text = "\n".join(f"[page {i}]\n{t}" for i, t in enumerate(pages, 1))   # same as page_text()
    if len(re.sub(r"\s", "", text.replace("[page", ""))) < 80:
        rec |= {"status": "no_text", "note": "Filing is a scanned image; no text to read"}
        return _save(rec)
    user = f"NSE category: {a.desc}\nNSE one-line text: {a.text}\n\nFiling text:\n{text[:9000]}"
    res = llm.call("classify" if c.ambiguous else "summarise_filing", SYSTEM, user, FilingRead, mock=lambda: None,
                   max_tokens=600)
    if res.output is None:
        # Not recorded: a mock/blocked run should retry next time it has a key.
        return {**rec, "status": "skipped", "note": res.note or res.source}
    rec |= {"status": "read", "model_source": res.source, **res.output.model_dump()}
    return _save(check(rec, text))


def check(rec: dict, text: str) -> dict:
    quote_ok = quote_in(rec["quote"], text)
    nums_ok = numbers_in(rec["summary"], text)
    return rec | {"verified": quote_ok and nums_ok, "checks": {"quote_found": quote_ok, "summary_numbers_found": nums_ok}}


def page_text(url: str) -> str:
    return "\n".join(f"[page {i}]\n{t}" for i, t in enumerate(pdf_pages(url), 1))


def _save(rec: dict) -> dict:
    p = _path(rec["id"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(rec, indent=1, ensure_ascii=False))
    return rec


def apply(c: Classified, rec: dict | None) -> tuple[Classified, str | None]:
    """Overlay a verified read on the rules' answer. Returns (classification, summary or None).

    Unverified reads change nothing: the rules' label stands and the card links the filing."""
    if not rec or rec.get("status") != "read" or not rec.get("verified"):
        return c, None
    out = _overlay(c, rec)
    summary = rec.get("summary") or None
    if out.category == "results" and summary and not FIGURE.search(summary):
        summary = None   # "Board approved results" says less than our "Results for the quarter ended …"
    return out, summary


def _overlay(c: Classified, rec: dict) -> Classified:
    if not c.ambiguous:
        if c.tier == MEDIUM and rec["importance"] == ROUTINE:
            # The model may demote a medium rule label it has read (an office opening filed as "expansion"),
            # never promote one. High rule labels stand.
            return Classified(c.category, ROUTINE, ROUTINE_GROUP.get(c.category, "Other routine filings"))
        return c
    cat, tier = rec["category"], rec["importance"]
    if cat == "management_change" and tier == HIGH and not is_top_role(f"{rec['summary']} {rec.get('quote', '')}"):
        tier = MEDIUM   # same bar as the rules: only CEO/CFO/MD-level changes rank as top management
    if tier == ROUTINE:
        return Classified(cat, ROUTINE, REASON.get((cat, ROUTINE)) or ROUTINE_GROUP.get(cat) or "Other routine filings")
    for t in (tier, MEDIUM):   # a model's "high dividend" is still a dividend line
        if (cat, t) in REASON:
            return Classified(cat, t, REASON[(cat, t)])
    return c
