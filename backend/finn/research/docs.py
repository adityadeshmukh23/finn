"""A company's primary documents: earnings-call transcripts and annual reports.

screener.in is used only as an index: we read the links in its Documents section and nothing else
(no ratios, no "AI Summary"). The PDFs themselves come from BSE or the company's own site. The
document list is snapshotted per company, so research still runs when screener is unreachable.

Screener's month label doesn't say what a call was or which quarter it covered, so both come from
the transcript's own text: "Business Update" and acquisition calls are kept out of the quarterly run.
"""
import gzip
import hashlib
import html
import io
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from urllib.parse import urlparse

from .. import http
from ..config import settings

MONTHS = {m: i for i, m in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
CALLS_WANTED = 5          # a baseline call plus the four quarters it's checked against
MAX_TRANSCRIPTS = 9       # rows tried before giving up (some are business updates or have no file)


class Unavailable(Exception):
    """No usable documents for this ticker; the message is shown to the investor as is."""


# ---- fiscal periods ---------------------------------------------------------------------------

@dataclass(frozen=True, order=True)
class Period:
    """Indian fiscal year ends in March: FY27 runs Apr 2026 to Mar 2027. q=0 means the full year."""
    fy: int
    q: int = 0

    @property
    def label(self) -> str:
        return f"FY{self.fy:02d}" if self.q == 0 else f"Q{self.q} FY{self.fy:02d}"

    @property
    def end(self) -> tuple[int, int]:
        """(fy, q) of the last quarter this period covers, for 'is it due yet' comparisons."""
        return (self.fy, self.q or 4)

    @staticmethod
    def parse(s: str) -> "Period | None":
        m = re.fullmatch(r"\s*(?:Q([1-4])\s*)?FY\s*'?(\d{2}|\d{4})\s*", s or "", re.I)
        if not m:
            return None
        return Period(int(m.group(2)[-2:]), int(m.group(1) or 0))


def quarter_ending(month: int, year: int) -> Period | None:
    q = {6: 1, 9: 2, 12: 3, 3: 4}.get(month)
    if q is None:
        return None
    return Period((year if month == 3 else year + 1) % 100, q)


_ENDED = re.compile(
    r"(?:quarter|three months|3 months)[^.]{0,60}?ended\s*(?:on\s*)?"
    r"(?:(\d{1,2})\s*(?:st|nd|rd|th)?\s*,?\s*([a-z]{3})[a-z]*\.?\s*,?\s*(\d{4})"     # 30th June 2026
    r"|([a-z]{3})[a-z]*\s+(\d{1,2})\s*(?:st|nd|rd|th)?,?\s+(\d{4}))",                 # June 30, 2026
    re.I)
_LABEL = re.compile(r"\bQ([1-4])\s*(?:(?:and|&)\s*(?:12M|9M|H[12]|FY)\s*)?FY\s*'?\s*(\d{4}|\d{2})(?:\s*-\s*(\d{4}|\d{2}))?\b", re.I)
_ORDINAL = re.compile(r"\b(first|second|third|fourth) quarter (?:of )?(?:FY\s*'?(\d{2,4})|the (?:fiscal|financial) year)", re.I)
_OTHER_CALL = re.compile(r"business update|acquisition|analyst day|investor day|annual general meeting", re.I)
# Not "AGM": transcripts list an "AGM – Finance" (assistant general manager) among the speakers.
_EARNINGS = re.compile(r"earnings|financial results|results of the company|financial performance|"
                       r"investor(?:s)? call|conference call|analysts? call", re.I)


def transcript_period(pages: list[str]) -> Period | None:
    """The quarter a transcript reports, from its first three pages. A stated quarter-end date beats a
    label ("Q1 FY2026-27" is FY27, not FY26); the most frequent label is the fallback."""
    text = re.sub(r"\s+", " ", " ".join(pages[:3]))
    for m in _ENDED.finditer(text):
        day_first = m.group(2) is not None
        mon, year = (m.group(2), m.group(3)) if day_first else (m.group(4), m.group(6))
        p = quarter_ending(MONTHS.get(mon.lower(), 0), int(year))
        if p:
            return p
    votes: dict[Period, int] = {}
    for m in _LABEL.finditer(text):
        fy = int((m.group(3) or m.group(2))[-2:])      # "FY 2024 - 2025" and "FY2026-27" name the later year
        p = Period(fy, int(m.group(1)))
        votes[p] = votes.get(p, 0) + 1
    if votes:
        return max(votes, key=votes.get)
    m = _ORDINAL.search(text)
    if m and m.group(2):
        return Period(int(m.group(2)[-2:]), ("first", "second", "third", "fourth").index(m.group(1).lower()) + 1)
    return None


def transcript_kind(pages: list[str]) -> str:
    """'earnings' or 'other'. The cover letter and opening page name the call's purpose."""
    head = re.sub(r"\s+", " ", " ".join(pages[:2]))[:4000]
    if _OTHER_CALL.search(head[:1500]):
        return "other"
    if transcript_period(pages) and _EARNINGS.search(head):
        return "earnings"
    return "other"


# ---- screener index ---------------------------------------------------------------------------

def parse_documents(page_html: str) -> dict:
    """Annual-report and concall links from a screener company page (Documents section only)."""
    def block(cls: str) -> str:
        i = page_html.find(f'class="documents {cls}')
        if i < 0:
            return ""
        j = page_html.find('class="documents ', i + 20)
        return page_html[i: j if j > 0 else i + 80000]

    reports = []
    for href, name in re.findall(r'<a href="([^"]+)"[^>]*>\s*(Annual Report \d{4})\s*</a>', block("annual-reports")):
        reports.append({"year": int(name[-4:]), "url": html.unescape(href)})
    calls = []
    for li in re.findall(r"<li[^>]*>(.*?)</li>", block("concalls"), re.S):
        month = re.search(r">\s*([A-Z][a-z]{2} \d{4})\s*</div>", li)
        tr = re.search(r'href="([^"]+)"[^>]*title="Raw Transcript"', li) or re.search(r'href="([^"]+)"[^>]*>\s*Transcript\s*<', li)
        if month:
            calls.append({"month": month.group(1), "transcript": html.unescape(tr.group(1)) if tr else None})
    return {"annual_reports": reports, "concalls": calls}


def _snapshot_path(symbol: str):
    return settings.snapshot_dir / "research" / symbol / "index.json"


def index(symbol: str, refresh: bool = False) -> dict:
    """The company's document list: live from screener (cached a day), else the recorded snapshot."""
    symbol = symbol.upper()
    snap = _snapshot_path(symbol)
    errors = []
    for path in (f"/company/{symbol}/consolidated/", f"/company/{symbol}/"):
        try:
            got = http.get(f"https://www.screener.in{path}", ttl=0 if refresh else settings.screener_ttl)
        except http.FetchError as e:
            errors.append(str(e))
            continue
        docs = parse_documents(got.body.decode("utf-8", "replace"))
        if docs["concalls"] or docs["annual_reports"]:
            out = {"symbol": symbol, "source": "screener.in", "as_of": datetime.fromtimestamp(got.fetched_at).isoformat(timespec="seconds"),
                   "page": f"https://www.screener.in{path}", **docs}
            snap.parent.mkdir(parents=True, exist_ok=True)
            snap.write_text(json.dumps(out, indent=1))
            return out
        errors.append(f"no documents listed at {path}")
    if snap.exists():
        return json.loads(snap.read_text()) | {"source": "snapshot", "message": f"screener.in unreachable ({'; '.join(errors)})"}
    if any("404" in e for e in errors):
        raise Unavailable(f"screener.in has no company page for {symbol}. Check the NSE symbol.")
    raise Unavailable(f"Couldn't reach screener.in for {symbol} ({'; '.join(errors)}) and there's no recorded document list.")


# ---- PDF text ---------------------------------------------------------------------------------

def _text_cache(url: str):
    return settings.data_dir / "cache" / "research" / f"{hashlib.sha1(url.encode()).hexdigest()[:20]}.json.gz"


def pages(url: str) -> list[str]:
    """Text of every page (index 0 = PDF page 1, the number a #page= link opens). Cached on disk;
    the PDF itself stays in the HTTP cache and is never committed."""
    cache = _text_cache(url)
    if cache.exists():
        return json.loads(gzip.decompress(cache.read_bytes()))
    host = urlparse(url).netloc
    settings.slow_hosts.setdefault(host, settings.slow_hosts.get("www.screener.in", 3.0))
    body = http.get(url, ttl=None, headers={"Referer": "https://www.screener.in/"}).body
    if not body.startswith(b"%PDF"):
        raise http.FetchError(f"{host} didn't return a PDF")
    from pypdf import PdfReader
    out = [(p.extract_text() or "") for p in PdfReader(io.BytesIO(body)).pages]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(gzip.compress(json.dumps(out).encode()))
    return out


# ---- choosing the documents -------------------------------------------------------------------

@dataclass
class Doc:
    id: str               # short, stable: "T-Q1FY27", "AR-FY26"
    kind: str             # transcript | annual_report
    title: str
    period: str           # "Q1 FY27" or "FY26"
    url: str
    pages: int = 0
    listed_as: str = ""   # screener's own label, for the audit trail


@dataclass
class DocSet:
    symbol: str
    calls: list[Doc]                     # earnings calls, oldest first
    annual_report: Doc | None
    skipped: list[dict] = field(default_factory=list)   # rows not used, and why
    index_source: str = ""
    index_as_of: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def choose(symbol: str, refresh: bool = False) -> tuple[DocSet, dict[str, list[str]]]:
    """The latest CALLS_WANTED earnings calls and the latest annual report, with their page text."""
    idx = index(symbol, refresh)
    texts: dict[str, list[str]] = {}
    calls: dict[Period, Doc] = {}
    skipped = []
    tried = 0
    for row in idx["concalls"]:
        if len(calls) >= CALLS_WANTED or tried >= MAX_TRANSCRIPTS:
            break
        if not row["transcript"]:
            skipped.append({"listed_as": row["month"], "why": "no transcript link on screener"})
            continue
        tried += 1
        try:
            pg = pages(row["transcript"])
        except http.FetchError as e:
            skipped.append({"listed_as": row["month"], "why": f"PDF not fetched ({e})", "url": row["transcript"]})
            continue
        if sum(len(p) for p in pg) < 2000:
            skipped.append({"listed_as": row["month"], "why": "scanned image, no text", "url": row["transcript"]})
            continue
        if transcript_kind(pg) != "earnings":
            skipped.append({"listed_as": row["month"], "why": "not an earnings call (business update, acquisition or other)",
                            "url": row["transcript"]})
            continue
        per = transcript_period(pg)
        if per in calls:
            skipped.append({"listed_as": row["month"], "why": f"second transcript for {per.label}", "url": row["transcript"]})
            continue
        doc = Doc(f"T-{per.label.replace(' ', '')}", "transcript", f"{per.label} earnings call", per.label,
                  row["transcript"], len(pg), row["month"])
        calls[per] = doc
        texts[doc.id] = pg
    if len(calls) < 2:
        raise Unavailable(f"Found {len(calls)} usable earnings-call transcript(s) for {symbol} on screener.in; "
                          "promised vs delivered needs at least two.")

    ar = None
    for rep in sorted(idx["annual_reports"], key=lambda r: -r["year"])[:1]:
        try:
            pg = pages(rep["url"])
            fy = Period(rep["year"] % 100)
            ar = Doc(f"AR-{fy.label}", "annual_report", f"Annual report {fy.label}", fy.label, rep["url"], len(pg),
                     f"Annual Report {rep['year']}")
            texts[ar.id] = pg
        except http.FetchError as e:
            skipped.append({"listed_as": f"Annual Report {rep['year']}", "why": f"PDF not fetched ({e})", "url": rep["url"]})
    ds = DocSet(symbol.upper(), [calls[p] for p in sorted(calls)], ar, skipped, idx.get("source", ""), idx.get("as_of", ""))
    return ds, texts
