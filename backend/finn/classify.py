"""Rule-based filing classifier. Categories follow the ENAM glossary; tiers decide what surfaces.

Rules run on NSE's own category (`desc`) plus the filing's one-line text. Anything the rules
can't place lands in `unclassified`, which is routine by default; an LLM pass for those
leftovers can be layered on later without changing this module's contract.
"""
import re
from dataclasses import dataclass

HIGH, MEDIUM, ROUTINE = "high", "medium", "routine"

TOP_EXEC = re.compile(
    r"\b(MD|M\.D\.|CEO|CFO|COO|Managing Director|Chief Executive|Chief Financial|Chief Operating|"
    r"Whole[- ]?time Director|(?<!Non-)(?<!Non )Executive Director)\b",
    re.I,
)
CHAIR = re.compile(r"\b(Chairman|Chairperson)\b", re.I)
RESULTS_AD = re.compile(r"financial results|\bresults\b.*(quarter|half[- ]year)", re.I)
SUBSIDIARY_SETUP = re.compile(r"incorporation of (a |an )?(new )?(wholly[- ]owned |step[- ]down )*subsidiar|strike[- ]off|struck off", re.I)
LISTING = re.compile(r"initial public offer|\bipo\b|listing of (its |our )?subsidiary|trading in (the )?equity shares of .{0,80}commence", re.I)
RESULTS = re.compile(r"financial results?|\bresults\b.*quarter|quarter.*\bresults\b", re.I)


@dataclass(frozen=True)
class Classified:
    category: str
    tier: str
    reason: str      # short label; for routine items it's the "why hidden" group name
    ambiguous: bool = False   # rules couldn't tell from NSE's text; the filing itself decides (cheap model)


def _c(category, tier, reason, ambiguous=False):
    return Classified(category, tier, reason, ambiguous)


def is_top_role(text: str) -> bool:
    """CEO/CFO/MD-level. A chair counts only if they aren't an independent director, and a role at a
    subsidiary only if it's executive (KPIT: an independent chair of a subsidiary's board is not the top)."""
    if TOP_EXEC.search(text):
        return True
    return bool(CHAIR.search(text)) and not re.search(r"independent director|subsidiary", text, re.I)


def classify(desc: str, text: str) -> Classified:
    d = (desc or "").strip().lower()
    t = text or ""
    tl = t.lower()

    # Paperwork that never moves a stock, whatever it mentions.
    if "newspaper publication" in d or re.search(r"newspaper (clipping|publication|advertisement)", tl):
        # The glossary files results ads under results; they repeat the results filing, so they stay routine.
        if RESULTS_AD.search(t):
            return _c("results", ROUTINE, "Results newspaper ads")
        return _c("unclassified", ROUTINE, "Newspaper ads")
    if d.startswith("certificate under sebi") or "compliance certificate" in tl:
        return _c("unclassified", ROUTINE, "Compliance certificates")
    if "trading window" in d or "trading window" in tl:
        return _c("unclassified", ROUTINE, "Trading-window notices")
    if "esop" in d or re.search(r"\besop|esps|grant of .* options", tl):
        return _c("unclassified", ROUTINE, "ESOP grants & allotments")
    if "monitoring agency" in d or "statement of deviation" in d:
        return _c("unclassified", ROUTINE, "Fund-use compliance reports")

    # Management
    if d in {"appointment", "resignation", "change in management", "change in director(s)",
             "resignation of director/kmp/smp", "cessation"} or re.search(
        r"\b(appointment|resignation|cessation|re-?designation|transition)\b", tl
    ) and re.search(r"director|officer|kmp|ceo|cfo|\bmd\b", tl) or re.search(
        r"change in (the )?(managing director|\bmd\b|ceo|cfo|chief|key managerial|director|management)", tl
    ):
        if is_top_role(t):
            return _c("management_change", HIGH, "Top management change")
        if re.search(r"independent director|additional director|director", tl):
            return _c("management_change", MEDIUM, "Board change")
        if not t or t.lower().endswith(("director/kmp/smp", "change in management")):
            # Generic header filing; the specific one usually arrives alongside it.
            return _c("management_change", MEDIUM, "Management change (details in filing)", True)
        return _c("management_change", ROUTINE, "Senior staff changes")

    # A subsidiary listing mentions the subsidiary's results; it's still a listing, not ours (Reliance/JPL).
    if LISTING.search(t):
        return _c("M&A", HIGH, "Subsidiary IPO / listing")

    # Results and their satellites
    if d == "outcome of board meeting":
        if RESULTS.search(t):
            return _c("results", HIGH, "Quarterly results")
        if re.search(r"dividend", tl):
            return _c("dividend", MEDIUM, "Dividend")
        if re.search(r"fund ?rais|qip|preferential|rights issue|buy-?back|non[- ]convertible", tl):
            return _c("fund_raise", MEDIUM, "Fund raise")
        return _c("unclassified", ROUTINE, "Board outcomes (no detail in NSE summary)", True)
    if d == "investor presentation" or re.search(r"(results|analyst) presentation", tl):
        return _c("results", MEDIUM, "Results deck")
    if d in {"updates", "general updates", "press release"} and RESULTS.search(t):
        return _c("results", HIGH if d != "press release" else MEDIUM, "Quarterly results")
    if d == "press release" and re.search(r"quarter|\bq[1-4] ?fy|\bh[12] ?fy|performance", tl):
        return _c("results", MEDIUM, "Results press release")
    if "transcript" in tl:
        return _c("earnings_call", MEDIUM, "Concall transcript")
    if re.search(r"audio recording|link of recording|con\.? ?call|conference call|earnings call|investors' call", tl):
        return _c("earnings_call", ROUTINE, "Concall notices & recordings")
    if "analysts/institutional investor meet" in d or re.search(r"analyst\(?s?\)?/investor|investor conference|analyst meet", tl):
        return _c("investor_meetings", ROUTINE, "Investor meetings")

    # Corporate actions and events
    if d in {"acquisition", "amalgamation / merger", "scheme of arrangement", "diversification/disinvestment"} \
            or re.search(r"acqui|amalgamat|merger|demerger|joint venture", tl):
        if SUBSIDIARY_SETUP.search(t):
            return _c("M&A", ROUTINE, "Subsidiary housekeeping")
        return _c("M&A", HIGH, "M&A")
    if d in {"sale or disposal", "other restructuring"}:
        if SUBSIDIARY_SETUP.search(t):
            return _c("M&A", ROUTINE, "Subsidiary housekeeping")
        return _c("M&A", MEDIUM, "Restructuring")
    if "insolvency" in d and not re.search(r"nclat|nclt|order|appeal", tl):
        # Is the company the debtor or a creditor? Only the filing says.
        return _c("litigation", HIGH, "Litigation / regulatory order", True)
    if "insolvency" in d or re.search(r"\bnclt|nclat|sebi order|penalty|show cause|litigation|lawsuit", tl):
        return _c("litigation", HIGH, "Litigation / regulatory order")
    if "credit rating" in d:
        if re.search(r"downgrad|negative|watch", tl):
            return _c("credit_rating", HIGH, "Credit rating downgrade")
        if re.search(r"upgrad", tl):
            return _c("credit_rating", MEDIUM, "Credit rating upgrade")
        return _c("credit_rating", ROUTINE, "Credit ratings (no change stated)")
    if "pledge" in d or "pledg" in tl:
        return _c("pledging", HIGH, "Promoter pledge")
    if "insider trading" in d or "sast" in d:
        return _c("insider_trading", MEDIUM, "Insider trades")
    if d in {"allotment of securities", "issue of securities"} or re.search(r"\bqip\b|preferential|rights issue", tl):
        if re.search(r"non[- ]convertible|commercial paper|\bncd", tl) or d == "issue of securities":
            return _c("fund_raise", ROUTINE, "Routine debt issuance")
        return _c("fund_raise", MEDIUM, "Equity issuance")
    if "buy" in d and "back" in d:
        return _c("fund_raise", HIGH, "Buyback")
    if d in {"dividend", "record date"} or "dividend" in tl:
        return _c("dividend", ROUTINE if d == "record date" else MEDIUM, "Dividend")
    if "bonus" in d or "split" in d or re.search(r"bonus issue|sub-?division|stock split", tl):
        return _c("bonus_split", MEDIUM, "Bonus / split")
    if re.search(r"capex|capacity expansion|new plant|greenfield|brownfield|expansion of", tl):
        return _c("capex", MEDIUM, "Capex / expansion")
    if "bagging" in d or re.search(r"order (win|worth|of rs|valued)|receiv(ed|ing) (an )?order", tl):
        return _c("press_release", MEDIUM, "Order win")
    if d == "press release":
        if re.search(r"approv(al|ed)|launch|usfda|patent", tl):
            return _c("press_release", MEDIUM, "Product / approval news")
        return _c("press_release", ROUTINE, "General press releases")
    if "shareholders meeting" in d or "postal ballot" in tl or re.search(r"\bagm\b|\begm\b", tl):
        return _c("agm_egm", ROUTINE, "Shareholder meetings & ballots")
    if "guarantee" in d:
        return _c("unclassified", ROUTINE, "Intra-group guarantees")
    if re.search(r"auditor", tl):
        return _c("unclassified", ROUTINE, "Auditor appointments")
    if re.search(r"board leadership|chairman|chairperson", tl):
        return _c("management_change", MEDIUM, "Board change")
    if d == "outcome of board meeting" or re.search(r"^outcome of (the )?board meeting", tl):
        return _c("unclassified", ROUTINE, "Board outcomes (no detail in NSE summary)", True)
    if re.search(r"regulation 30|^general updates?$|^updates?$", tl.strip()) or not t:
        # NSE gave no summary; the substance is only in the PDF. Labelled honestly, not guessed.
        return _c("unclassified", ROUTINE, "Reg. 30 disclosures (NSE gave no summary)", True)
    if d in {"updates", "general updates"}:
        return _c("press_release", ROUTINE, "Company news & PR", True)
    return _c("unclassified", ROUTINE, "Other routine filings", True)
