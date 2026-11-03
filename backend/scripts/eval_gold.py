"""A gold set for the filing classifier, for a person to label blind. No model calls and no network.

Writes three files to data/eval/, all fixed by SEED:
- gold_blind.csv: the sampled filings in shuffled order, NSE's own words only, with an empty my_label.
- categories.md: the categories in plain words, the only reference the reviewer needs.
- gold_key.csv: FINN's labels. Kept apart, and not to be opened until the labels are done.

Which filings are sampled depends only on the snapshot and FINN's labels. Excerpts come from PDFs already in the local cache, which
is never committed, so this runs on a machine with that cache and CI checks the committed files instead. Nothing here scores anything.

Usage (from backend/): python -m scripts.eval_gold
       python -m scripts.eval_gold --fetch   # fetch the PDFs of summary-only rows, then refresh only their excerpts
"""
import csv
import io
import json
import random
import re
import sys
import time
from collections import defaultdict

from finn import db, filings, http
from finn.classify import classify
from finn.config import settings
from finn.sources import nse

SEED = 20261103
SIZE = 60
THIN = 7               # a label with this many filings or fewer is taken whole
EXCERPT = 400
SUMMARY_ONLY = "summary only"
OUT = settings.data_dir / "eval"
BLIND_COLUMNS = ["id", "company", "filed_date", "headline", "excerpt", "my_label"]
KEY_COLUMNS = ["id", "finn_label", "finn_tier", "finn_reason", "read_used", "label_filings", "label_sampled", "seed"]

# Where a filing stops being letterhead and "Regulation 30" and starts saying something. The first of these, in order of preference.
_SAYS = re.compile(r"\b(?:we (?:wish|would like|hereby|are pleased|write)\b|this is to\b|please find\b|we inform\b|we enclose\b|"
                   r"further to\b|in continuation\b|in furtherance\b|at (?:its|their) meeting\b)", re.I)
_SUBJECT = re.compile(r"\b(?:Sub(?:ject)?\s*[:.\-]|Re\s*:|Ref\s*:|Dear\s+(?:Sir|Madam|Shareholder))", re.I)


def portfolio() -> dict[str, dict]:
    return {p["symbol"]: p for p in json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]}


def labelled() -> list[dict]:
    """Every filing in the snapshot with FINN's final label: the same rules and verified reads as the briefing."""
    meta, reads = portfolio(), filings.load_reads()
    out = []
    for r in nse.load_snapshot()["items"]:
        a = nse.Announcement(**r)
        if a.symbol not in meta:
            continue
        rules = classify(a.desc, a.text)
        c, _ = filings.apply(rules, reads.get(a.id))
        out.append({"a": a, "label": c.category, "tier": c.tier, "reason": c.reason, "read_used": c != rules})
    return out


def quotas(sizes: dict[str, int], size: int = SIZE, thin: int = THIN) -> dict[str, int]:
    """Thin labels whole; the rest of the sample split by label size, largest remainder first."""
    q = {k: n for k, n in sizes.items() if n <= thin}
    rest = {k: n for k, n in sizes.items() if n > thin}
    left, total = size - sum(q.values()), sum(rest.values())
    share = {k: left * n / total for k, n in rest.items()}
    q |= {k: int(v) for k, v in share.items()}
    for k in sorted(rest, key=lambda k: (int(share[k]) - share[k], k))[:size - sum(q.values())]:
        q[k] += 1
    return q


def sample(rows: list[dict], seed: int = SEED) -> list[dict]:
    """A fixed sample in a fixed shuffled order, so the order says nothing about the label."""
    rng = random.Random(seed)
    by = defaultdict(list)
    for r in rows:
        by[r["label"]].append(r)
    q = quotas({k: len(v) for k, v in by.items()})
    picked = []
    for label in sorted(by):
        members = sorted(by[label], key=lambda r: r["a"].id)
        for r in rng.sample(members, q[label]):
            picked.append(r | {"label_filings": len(members), "label_sampled": q[label]})
    rng.shuffle(picked)
    return picked


def cached_pdf_text(url: str) -> str | None:
    """Text of the first pages from the local cache, or None if the PDF isn't on disk. Never fetches."""
    from pypdf import PdfReader
    row = db.conn().execute("SELECT body FROM http_cache WHERE url=?", (url,)).fetchone()
    if not row or not row["body"].startswith(b"%PDF"):
        return None
    reader = PdfReader(io.BytesIO(row["body"]))
    return "\n".join((p.extract_text() or "") for p in reader.pages[:3])


def excerpt(text: str | None, limit: int = EXCERPT) -> str:
    """A short run of what the filing says, past its letterhead. "summary only" with no PDF on disk or no text in it."""
    flat = re.sub(r"\s+", " ", text or "").strip()
    if len(re.sub(r"\s", "", flat)) < 80:
        return SUMMARY_ONLY
    start = _SAYS.search(flat) or _SUBJECT.search(flat)
    body = flat[start.start():] if start else flat
    return body if len(body) <= limit else body[:limit].rsplit(" ", 1)[0] + "…"


def headline(a: nse.Announcement, limit: int = 300) -> str:
    """NSE's own subject line. Never FINN's rewritten headline or a model's summary: those would carry FINN's reading."""
    flat = re.sub(r"\s+", " ", a.text or a.desc).strip()
    return flat if len(flat) <= limit else flat[:limit].rsplit(" ", 1)[0] + "…"


CATEGORIES = [
    ("results", "Quarterly or annual results, the board meeting approving them, results slides and shareholder letters, and newspaper ads showing results already published.", "The board approved the September quarter results; the statement is attached."),
    ("M&A", "An acquisition, merger, demerger or joint venture, including investing in a subsidiary or selling a stake in one.", "The company will buy 60% of a smaller firm for ₹200 crore."),
    ("fund_raise", "Raising money from outside: a rights issue, QIP, preferential allotment, buyback, or debt such as NCDs and commercial paper.", "The company allotted non-convertible debentures worth ₹500 crore."),
    ("management_change", "A CEO, CFO, MD, director or other key officer joining, resigning, retiring or changing role.", "The CFO resigned, effective next month."),
    ("litigation", "Lawsuits, regulatory orders, fines, warnings, tax demands, or insolvency and restructuring proceedings.", "A tax authority issued a demand of ₹40 crore, and the company will appeal."),
    ("insider_trading", "A promoter or insider buying or selling their own shares.", "A promoter sold 2 lakh shares in the open market."),
    ("earnings_call", "Anything about the investor call on results: the notice, the transcript or the recording link.", "The results call is on Friday at 4 pm; dial-in details are attached."),
    ("investor_meetings", "Meetings with specific investors or funds, or attending an investor conference.", "Management will meet institutional investors at a broker's conference next week."),
    ("credit_rating", "A rating agency assigning, upgrading, downgrading or reaffirming a rating.", "An agency reaffirmed the long-term rating at AA with a stable outlook."),
    ("dividend", "A cash dividend being declared, and its record date.", "The board declared an interim dividend of ₹5 per share."),
    ("bonus_split", "A bonus issue or stock split: the share count changes, and no cash reaches the holder.", "One bonus share for every two held."),
    ("capex", "Approving spend on a new plant, facility or capacity.", "The board approved a new plant, at a cost of ₹300 crore."),
    ("press_release", "General news not covered above: order wins, new products, partnerships, clarifying a rumour.", "The company won an order worth ₹150 crore."),
    ("postal_ballot", "Shareholders voting by postal ballot: the notice and the result.", "A postal ballot notice seeks approval to appoint a director."),
    ("agm_egm", "An annual or extraordinary general meeting: the notice and the result.", "The annual general meeting is on 15 December."),
    ("pledging", "A promoter pledging or releasing shares, or changing a pledge.", "A promoter released a pledge on 5 lakh shares."),
    ("unclassified", "Routine paperwork that doesn't materially move the stock: ESOP allotments, compliance certificates, ESG reports, auditor appointments.", "A certificate under the depositories regulations for the quarter."),
]


def categories_md() -> str:
    rows = "\n".join(f"| `{k}` | {what} | {eg} |" for k, what, eg in CATEGORIES)
    return f"""# Filing categories, for labelling `gold_blind.csv`

Put one label in `my_label` for each row, spelled as below. These definitions restate the glossary that came with the brief.

- Pick the one thing the filing is mainly about, as an investor reading it would see it.
- If the row doesn't give you enough to choose, write `cannot_tell`. Please don't guess. It's a useful answer.
- `summary only` in the excerpt column means the filing's text isn't on disk, so judge from the headline.
- Leave `gold_key.csv` closed until every row has a label.

The examples are made up to show each category. None of them is from the sample.

| Label | What goes in it | Example |
|---|---|---|
{rows}
"""


def build(out=OUT) -> dict:
    rows = sample(labelled())
    meta = portfolio()
    out.mkdir(parents=True, exist_ok=True)
    blind = [{"id": r["a"].id, "company": meta[r["a"].symbol].get("name") or r["a"].company, "filed_date": r["a"].ts[:10],
              "headline": headline(r["a"]), "excerpt": excerpt(cached_pdf_text(r["a"].url)), "my_label": ""} for r in rows]
    key = sorted(({"id": r["a"].id, "finn_label": r["label"], "finn_tier": r["tier"], "finn_reason": r["reason"], "read_used": r["read_used"],
                   "label_filings": r["label_filings"], "label_sampled": r["label_sampled"], "seed": SEED} for r in rows), key=lambda r: r["id"])
    # utf-8-sig so Excel reads the rupee sign.
    for name, cols, data in (("gold_blind.csv", BLIND_COLUMNS, blind), ("gold_key.csv", KEY_COLUMNS, key)):
        with (out / name).open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(data)
    (out / "categories.md").write_text(categories_md())
    return {"filings": len(rows), "summary_only": sum(b["excerpt"] == SUMMARY_ONLY for b in blind)}


def fetch_missing(path=None, gap: float = 3.0) -> dict:
    """Fetch the PDFs of rows still marked summary only, one request every `gap` seconds, into the local cache that's never committed.
    Rewrites only the excerpts of the blind file: same ids, same order, labels untouched. The key isn't read or written."""
    path = path or OUT / "gold_blind.csv"
    with path.open(encoding="utf-8-sig", newline="") as f:
        blind = list(csv.DictReader(f))
    urls = {r["id"]: r["url"] for r in nse.load_snapshot()["items"]}
    failed = 0
    for b in blind:
        if b["excerpt"] != SUMMARY_ONLY:
            continue
        if cached_pdf_text(urls[b["id"]]) is None:
            time.sleep(gap)
            try:
                http.get(urls[b["id"]], ttl=None, headers={"Referer": "https://www.nseindia.com/"})
            except http.FetchError:
                failed += 1
                continue
        b["excerpt"] = excerpt(cached_pdf_text(urls[b["id"]]))
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=BLIND_COLUMNS)
        w.writeheader()
        w.writerows(blind)
    return {"rows": len(blind), "with_excerpt": sum(b["excerpt"] != SUMMARY_ONLY for b in blind), "not_fetched": failed}


if __name__ == "__main__":
    # The counts printed say nothing about which label any filing has.
    print(fetch_missing() if "--fetch" in sys.argv else build())
