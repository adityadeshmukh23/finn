"""Management-change card: who, which role, from when, why, and their background, all from the filing.

SEBI's Reg. 30 disclosure for a KMP or director change carries a reason, an effective date and, for an
appointment, a brief profile. The cheap model copies those fields; each must be backed by a verbatim
quote found in the filing (verify.py) or it isn't shown. Recorded by NSE announcement ID under
data/recordings/mgmt/. Background from outside the filing is a separate, optional, labelled layer.
"""
import json
import re
from typing import Literal

from pydantic import BaseModel, Field

from . import llm
from .config import settings
from .filings import pdf_pages
from .http import FetchError
from .sources.nse import Announcement
from .verify import norm, numbers_in, quote_in


class Change(BaseModel):
    person: str = Field(description="full name as printed, without Mr/Ms/Dr")
    role: str = Field(description="role as printed, e.g. 'Managing Director & CEO'")
    change: Literal["appointed", "resigned", "ceased", "retiring", "re-designated", "re-appointed"]
    effective: str = Field(description="effective date exactly as printed, or '' if not stated")
    reason: str = Field(description="reason as stated in the filing, at most 30 words, or '' if not stated")
    reason_quote: str = Field(description="verbatim phrase from the filing supporting the reason, or ''")
    profile: str = Field(description="background from the filing's brief profile, at most 40 words, or ''")
    profile_quote: str = Field(description="verbatim phrase from the profile, or ''")
    page: int


class Changes(BaseModel):
    changes: list[Change]


SYSTEM = """You read one Indian stock-exchange filing about a change in directors or key managerial personnel.
List each person whose role changes. Use only the filing text; never outside knowledge.
Copy names, roles and dates as printed. "reason" is the reason the filing gives (for a resignation, often in the
person's letter; for an appointment, often "appointed by the board on the recommendation of ..."); leave it empty if none is given.
"profile" summarises the filing's own "brief profile" section (education, past roles, years of experience) in plain words,
only facts stated there; leave it empty if the filing has no profile.
For every reason and profile, give a short verbatim quote (6 to 30 words) copied from the filing that supports it.
page: the page where this person's details appear."""


def _path(ann_id: str):
    return settings.data_dir / "recordings" / "mgmt" / f"{ann_id}.json"


def load_all() -> dict[str, dict]:
    d = settings.data_dir / "recordings" / "mgmt"
    return {p.stem: json.loads(p.read_text()) for p in sorted(d.glob("*.json"))} if d.exists() else {}


def _in(s: str, text: str) -> bool:
    return bool(s) and norm(s).replace(" ", "") in norm(text).replace(" ", "")


def check(c: dict, text: str) -> dict:
    """Keep only what the filing backs. The person must be named in it; reason and profile need their quote."""
    name_ok = _in(re.sub(r"^(mr|ms|mrs|dr|smt|shri)\.?\s+", "", c["person"], flags=re.I), text)
    reason_ok = bool(c["reason"]) and quote_in(c["reason_quote"], text) and numbers_in(c["reason"], text)
    profile_ok = bool(c["profile"]) and quote_in(c["profile_quote"], text) and numbers_in(c["profile"], text)
    eff_ok = _in(c["effective"], text)
    return {
        **c,
        "reason": c["reason"] if reason_ok else "",
        "profile": c["profile"] if profile_ok else "",
        "effective": c["effective"] if eff_ok else "",
        "verified": name_ok,
        "checks": {"name": name_ok, "reason": reason_ok, "profile": profile_ok, "effective": eff_ok},
    }


_PROFILE = re.compile(r"brief profile|profile of|qualifications?|years of experience|is a (qualified|chartered|graduate)", re.I)


def filing_text(url: str) -> str:
    """The first 4 pages plus up to 3 later pages that look like a profile annexure (board outcomes put
    it at the end of a 20-page PDF), each tagged with its real page number for citation."""
    pages = pdf_pages(url, max_pages=40)
    keep = list(range(min(4, len(pages))))
    keep += [i for i in range(4, len(pages)) if _PROFILE.search(pages[i])][:3]
    return "\n".join(f"[page {i + 1}]\n{pages[i]}" for i in keep)


def extract(a: Announcement) -> dict:
    rec: dict = {"id": a.id, "symbol": a.symbol, "url": a.url}
    try:
        text = filing_text(a.url)
    except FetchError as e:
        return _save(rec | {"status": "unavailable", "note": f"Filing could not be fetched ({e})"})
    if len(re.sub(r"\s", "", text)) < 200:
        return _save(rec | {"status": "no_text", "note": "Filing is a scanned image"})
    user = f"NSE one-line text: {a.text}\n\nFiling text:\n{text[:14000]}"
    res = llm.call("extract_mgmt", SYSTEM, user, Changes, mock=lambda: None, max_tokens=1500)
    if res.output is None:
        return {**rec, "status": "skipped", "note": res.note or res.source}
    changes = [check(c.model_dump(), text) for c in res.output.changes]
    return _save(rec | {"status": "read", "changes": changes})


def _save(rec: dict) -> dict:
    p = _path(rec["id"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(rec, indent=1, ensure_ascii=False))
    return rec


FIELDS = ("person", "role", "change", "effective", "reason", "profile", "page")


def view(rec: dict | None) -> list[dict] | None:
    """Verified changes for the card, with a link to the page; None if nothing verified."""
    if not rec or rec.get("status") != "read":
        return None
    out = [{k: c[k] for k in FIELDS} | {"url": f"{rec['url']}#page={c['page']}"} for c in rec["changes"] if c["verified"]]
    return out or None


EXITS = {"resigned", "ceased", "retiring"}


def people(recs: list[dict | None]) -> list[dict]:
    """Verified changes across a company's filings in the window, one row per (person, change), keeping
    the row with the most detail. Process boilerplate ("appointed on the recommendation of the NRC") is
    not a reason, so a reason is shown for exits only."""
    best: dict[tuple, dict] = {}
    for rec in recs:
        for c in view(rec) or []:
            c = c | {"reason": c["reason"] if c["change"] in EXITS else ""}
            key = (norm(c["person"]), c["change"])
            score = sum(bool(c[k]) for k in ("effective", "reason", "profile"))
            if key not in best or score > best[key][0]:
                best[key] = (score, c)
    order = {"resigned": 0, "ceased": 0, "retiring": 0, "appointed": 1, "re-designated": 2, "re-appointed": 3}
    return sorted((c for _, c in best.values()), key=lambda c: order.get(c["change"], 9))
