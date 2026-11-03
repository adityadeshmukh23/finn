"""The Guidance Walk: one promise, each later statement of it, and what was delivered. Rules over the recordings, no model.

Arithmetic only. Delivered against the first promise and against the last statement, margins in points and amounts in percent
of the target. It adds no verdict: the row's own verdict stays scored against the first promise, and nothing here is a score.

A row becomes a walk only if every step has a figure read from a verified quote, and it either ended in a delivered figure or
was revised and isn't due yet. Same-call conflicts and figures with no stated period aren't walks: FINN can't order those.
"""
import gzip
import json
import re

from ..verify import number_in
from .pvd import _STATES_PERIOD, due_of, load, pages_path, quote_on_page, value_in

UNITS = {"%": "%", "cr": "crore"}
GROUPS = ("revised_delivered", "held_delivered", "revised_open")
SETTLED = ("met", "partially", "missed")

# Where the recorded label would mislead beside another row. Each is stated in the walk's own quotes; a test holds that.
LABELS = {("BEL", "PQ1FY26-3"): "Order inflow, excluding QRSAM", ("COFORGE", "PQ2FY26-8"): "FY26 EBIT margin"}

_TARGET = re.compile(r"(?:about )?₹?(\d[\d,.]*)( ?cr|%)?\+?(?:–₹?(\d[\d,.]*)( ?cr|%)?)?")
_FLOOR_BEFORE = re.compile(r"\b(more than|at least|minimum|north of|over|above|exceed\w*)\b", re.I)
_FLOOR_AFTER = re.compile(r"^\s*(?:crores?|cr\b)?\s*-?\s*(plus\b|\+|or higher|or more|or above|and above|minimum\b)", re.I)
_ABOUT = re.compile(r"\b(about|around|approximately|nearly|almost|close to|roughly)\b", re.I)
_MONEY = re.compile(r"(?:INR|Rs\.?|₹)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:crores?|cr\b)", re.I)
_PERCENT = re.compile(r"(\d[\d.]*)\s*%")


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def parse_target(target: str) -> dict | None:
    """'₹3,500 cr–₹4,000 cr' to low 3500, high 4000, crore. Only % and crore, and only a floor or a band: a ceiling or a dollar
    target has no walk yet, so it stays a scorecard row."""
    m = _TARGET.fullmatch(target or "")
    if not m or not (m.group(2) or m.group(4)):
        return None
    unit = UNITS[(m.group(2) or m.group(4)).strip()]
    low, high = _num(m.group(1)), _num(m.group(3)) if m.group(3) else None
    return {"low": low, "high": high if high != low else None, "unit": unit}


def _clause_around(value: float, quote: str) -> list[tuple[str, str]]:
    """Each place the figure sits in the quote: the words before it in its own clause, and what follows it."""
    digits = r",?".join(re.escape(c) for c in f"{value:f}".rstrip("0").rstrip("."))
    return [(re.split(r"[.;]\s|,\s", quote[:m.start()])[-1], quote[m.end():])
            for m in re.finditer(rf"(?<![\d,.]){digits}(?!\d)", quote)]


def qualifier(value: float, quote: str) -> dict:
    """What the speaker said about the figure, from their words beside it. The recording's own '+' and 'about' are the model's
    reading of the whole quote: "we maintain the EBITDA margin of 27% only" was stored as 27%+."""
    around = _clause_around(value, quote)
    return {"floor": any(_FLOOR_BEFORE.search(before) or _FLOOR_AFTER.match(after.lstrip("%")) for before, after in around),
            "about": any(_ABOUT.search(before) for before, _ in around)}


def recover_figure(quote: str, unit: str, due: str) -> float | None:
    """The figure in a later statement the model didn't read. Only if the quote names the period the promise is due and holds
    exactly one figure in the promise's unit: "including the last quarter for FY '26, we'll cross about INR4,000 crores minimum"."""
    if not _names_period(quote, due):
        return None
    found = {_num(x) for x in (_MONEY if unit == "crore" else _PERCENT).findall(quote)}
    return found.pop() if len(found) == 1 else None


def _names_period(quote: str, due: str) -> bool:
    d = due_of(due)
    return bool(d) and any(due_of(f"FY{m}") == d for m in re.findall(r"FY\s*'?\s*(\d{2,4})\b", quote, re.I))


def _step(claim: dict, target: dict, read: str) -> dict:
    checked = target["low"]
    q = {"floor": False, "about": False} if target["high"] is not None else qualifier(checked, claim["quote"])
    return {"call": claim["call"], "speaker": claim["speaker"], "low": target["low"], "high": target["high"], **q,
            "read": read, "quote": claim["quote"], "doc": claim["doc"], "page": claim["page"], "url": claim["url"]}


def _steps(row: dict) -> list[dict] | None:
    first = parse_target(row["promised"]["target"])
    if not first:
        return None
    steps = [_step(row["promised"], first, "recorded")]
    for later in row.get("later", []):
        if later["change"] in ("differs", "no period"):
            return None
        t = parse_target(later["target"])
        if t and t["unit"] != first["unit"]:
            return None
        if not t:
            v = recover_figure(later["quote"], first["unit"], row["due"])
            if v is None or not _STATES_PERIOD.search(later["quote"]):
                return None
            steps.append(_step(later, {"low": v, "high": None, "unit": first["unit"]}, "from the quote"))
        else:
            steps.append(_step(later, t, "recorded"))
    steps[0]["change"] = "first"
    for before, s in zip(steps, steps[1:]):
        s["change"] = "held" if s["low"] == before["low"] else "raised" if s["low"] > before["low"] else "lowered"
    return steps


def _gap(value: float, bound: float, unit: str) -> dict:
    if unit == "%":
        return {"kind": "points", "value": round(value - bound, 4)}
    return {"kind": "share", "value": round(value / bound * 100, 4)}


def _printed_line(rec: dict, row: dict, cited: dict) -> str:
    """The annual report's own line for a printed figure, so the delivered step has words to show. '' if it's not on one line."""
    d = row["delivered"]
    value = rec["financials"]["printed"].get(row["metric"], {}).get("current")
    page = cited.get(d["doc"], {}).get(str(d["page"]), "")
    lines = [ln.strip() for ln in page.splitlines() if value and number_in(value, ln)]
    return lines[0] if len(lines) == 1 and quote_on_page(lines[0], page) else ""


def _workings(rec: dict, metric: str) -> list[dict]:
    """The annual-report figures a computed percentage came from, for the delivered step to print."""
    f = rec["financials"]
    fig = f["figures"]
    if metric == "revenue_growth":
        return [{"label": f["fy"], "value": fig["revenue"]["current"]}, {"label": f["prev_fy"], "value": fig["revenue"]["previous"]}]
    if metric == "ebitda_margin":
        return [{"label": "EBITDA", "value": fig["ebitda"]["current"]}, {"label": "revenue", "value": fig["revenue"]["current"]}]
    return []


def _delivered(rec: dict, row: dict, cited: dict) -> dict:
    d = row["delivered"]
    out = {k: d[k] for k in ("value", "unit", "period", "source", "speaker", "quote", "doc", "page", "url", "title")}
    if d["source"] == "annual_report":
        out["basis"] = rec["financials"]["basis"]
        if d["how"] == "printed":
            out |= {"quote": _printed_line(rec, row, cited), "printed_in": rec["financials"]["unit"]}
        else:
            out["workings"] = _workings(rec, row["metric"])
    return out


def walk_of(rec: dict, row: dict, cited: dict) -> dict | None:
    if row["kind"] != "numeric" or not due_of(row["due"]):
        return None
    steps = _steps(row)
    if not steps or len(steps) < 2:
        return None
    unit = parse_target(row["promised"]["target"])["unit"]
    moved = any(s["change"] != "held" for s in steps[1:])
    d = row["delivered"]
    settled = d is not None and d["value"] is not None and d["unit"] == unit and row["verdict"] in SETTLED
    if settled:
        group = "revised_delivered" if moved else "held_delivered"
    elif row["verdict"] == "not_yet_due" and moved:
        group = "revised_open"
    else:
        return None
    label = LABELS.get((rec["symbol"], row["id"]), row["label"])
    return {
        "symbol": rec["symbol"], "name": rec["name"], "row": row["id"], "group": group, "label": label, "due": row["due"], "unit": unit,
        "verdict": row["verdict"], "steps": steps, "delivered": _delivered(rec, row, cited) if settled else None,
        "vs_first": _gap(d["value"], steps[0]["low"], unit) if settled else None,
        "vs_last": _gap(d["value"], steps[-1]["low"], unit) if settled else None,
    }


def cited_pages(symbol: str) -> dict:
    return json.loads(gzip.decompress(pages_path(symbol).read_bytes()))


def build(symbols: list[str]) -> list[dict]:
    """Every usable walk, grouped in the order the front door shows them."""
    walks = []
    for s in symbols:
        rec = load(s)
        cited = cited_pages(s)
        walks += [w for w in (walk_of(rec, r, cited) for r in rec["scorecard"]["rows"]) if w]
    return sorted(walks, key=lambda w: GROUPS.index(w["group"]))


def reverify(walk: dict, cited: dict) -> list[str]:
    """Every quote and figure in a walk re-checked against the committed page text. Returns the failures (should be none)."""
    bad = []
    name = f"{walk['symbol']} {walk['label']}"
    for s in walk["steps"]:
        page = cited[s["doc"]][str(s["page"])]
        if not quote_on_page(s["quote"], page):
            bad.append(f"{name}: quote not on {s['doc']} p.{s['page']}")
        for v in (s["low"], s["high"]):
            if not value_in(v, s["quote"]):
                bad.append(f"{name}: {v} is not in its quote, {s['doc']} p.{s['page']}")
    d = walk["delivered"]
    if d:
        page = cited[d["doc"]][str(d["page"])]
        if d["quote"] and not quote_on_page(d["quote"], page):
            bad.append(f"{name}: delivered quote not on {d['doc']} p.{d['page']}")
        if d["source"] == "transcript" and not value_in(d["value"], d["quote"]):
            bad.append(f"{name}: delivered figure not in its quote")
    return bad
