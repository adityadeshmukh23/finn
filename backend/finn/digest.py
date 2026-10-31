"""Windowed digest: classify, dedupe, score, group by company, and account for what was hidden.

Pure functions over Announcement lists, so ranking is deterministic and testable.
"""
import re
from collections import defaultdict
from datetime import datetime, timedelta

from . import filings
from .classify import HIGH, MEDIUM, ROUTINE, Classified, classify
from .sources.nse import Announcement

SCORES = {
    ("management_change", HIGH): 95,
    ("results", HIGH): 90,
    ("M&A", HIGH): 85,
    ("litigation", HIGH): 80,
    ("pledging", HIGH): 80,
    ("credit_rating", HIGH): 75,
    ("fund_raise", HIGH): 70,
    ("management_change", MEDIUM): 55,
    ("M&A", MEDIUM): 50,
    ("fund_raise", MEDIUM): 50,
    ("bonus_split", MEDIUM): 50,
    ("capex", MEDIUM): 50,
    ("press_release", MEDIUM): 45,
    ("credit_rating", MEDIUM): 45,
    ("insider_trading", MEDIUM): 45,
    ("earnings_call", MEDIUM): 40,
    ("results", MEDIUM): 35,
    ("dividend", MEDIUM): 30,
}

WHY = {
    "Top management change": "Leadership change at the top: execution risk until the successor settles in.",
    "Board change": "Board composition is changing.",
    "Management change (details in filing)": "Management change; the filing names who and which role.",
    "Quarterly results": "Fresh quarterly numbers, the main input to your view on this stock.",
    "Results deck": "Management's own slides framing the quarter.",
    "Concall transcript": "Management's commentary on the quarter, in their words.",
    "M&A": "Changes what the company owns. Check the price paid and how it's funded.",
    "Restructuring": "Group structure is changing.",
    "Litigation / regulatory order": "A legal or regulatory outcome that can hit earnings or operations.",
    "Credit rating downgrade": "Lenders see more risk; borrowing gets costlier.",
    "Credit rating upgrade": "Lenders see less risk; borrowing gets cheaper.",
    "Promoter pledge": "Promoter shares used as loan collateral: forced-selling risk if the price falls.",
    "Equity issuance": "New shares dilute existing holders. Check the price and the purpose.",
    "Buyback": "The company is returning cash by buying back shares.",
    "Fund raise": "The company is raising money. Check the size and the instrument.",
    "Capex / expansion": "Spending on capacity: future growth, near-term cash outflow.",
    "Order win": "New business. Size it against annual revenue.",
    "Product / approval news": "A new product or approval that could add revenue.",
    "Dividend": "Cash payout to shareholders.",
    "Bonus / split": "More shares at proportionally lower price; no cash changes hands.",
    "Insider trades": "An insider traded their own shares, a read on their view.",
}

_BOILERPLATE = re.compile(
    r"^.*?\bhas (informed|intimated|submitted to) the exchange,?\s*(about|regarding|that|on|of)?\s*(the\s)?", re.I
)
_PERIOD = re.compile(
    r"(quarter|period|half[- ]year)[^.]{0,40}?ended\s+(?:on\s+)?"
    r"(\d{1,2})(?:st|nd|rd|th)?[\s.-]*([A-Za-z]{3,9})[,\s.-]*(\d{4})"
    r"|(?:quarter|period)[^.]{0,40}?ended\s+(?:on\s+)?([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})",
    re.I,
)


def results_period(text: str) -> str | None:
    """'quarter ended September 30, 2026' -> 'Sep 2026'. None if no period is stated."""
    m = _PERIOD.search(text)
    if not m:
        return None
    month, year = (m.group(3), m.group(4)) if m.group(2) else (m.group(5), m.group(7))
    return f"{month[:3].title()} {year}"


def headline(a: Announcement, c: Classified | None = None) -> str:
    if c and c.category == "results" and c.reason == "Quarterly results":
        p = results_period(a.text)
        return f"Results for the quarter ended {p}" if p else "Quarterly results filed"
    t = re.sub(r"\s+", " ", a.text).strip()
    t = _BOILERPLATE.sub("", t).strip(" '\".:")
    t = re.sub(r"^a press release dated .{0,40}?titled\s*", "", t, flags=re.I).strip(" '\"“”.:")
    t = re.sub(r"^(disclosure|intimation)\b.{0,200}?regulations?,? 20\d\d(,? as amended)?\s*[-–:]+\s*", "", t, flags=re.I)
    if c and c.reason == "Concall transcript" and len(t) < 60:
        return "Concall transcript filed"
    if len(t) < 12 or t.lower() == a.desc.lower():
        t = a.desc
    t = t[:1].upper() + t[1:]
    return t if len(t) <= 180 else t[:177].rstrip() + "…"


def _item(a: Announcement, c: Classified, window_start: datetime, window_end: datetime,
          read: dict | None = None, summary: str | None = None) -> dict:
    base = SCORES.get((c.category, c.tier), 0)
    span = (window_end - window_start).total_seconds() or 1
    recency = 5 * max(0.0, (a.dt - window_start).total_seconds()) / span
    return {
        "id": a.id,
        "symbol": a.symbol,
        "category": c.category,
        "tier": c.tier,
        "reason": c.reason,
        "headline": summary or headline(a, c),
        # Where a summary came from the filing (verified quote + numbers), say so and cite the page.
        "read": {"page": read["page"], "quote": read["quote"]} if summary and read else None,
        "why": WHY.get(c.reason, ""),
        "url": a.url,
        "ts": a.ts,
        "nse_category": a.desc,
        "score": round(base + recency, 1) if c.tier != ROUTINE else 0,
    }


def build(items: list[Announcement], as_of: datetime, hours: int, meta: dict[str, dict],
          reads: dict[str, dict] | None = None) -> dict:
    reads = reads or {}
    start = as_of - timedelta(hours=hours)
    in_window = [a for a in items if start < a.dt <= as_of]

    seen, rows = set(), []
    for a in sorted(in_window, key=lambda a: a.ts, reverse=True):
        key = (a.symbol, headline(a).lower()[:120])
        if key in seen:
            continue
        seen.add(key)
        c, summary = filings.apply(classify(a.desc, a.text), reads.get(a.id))
        rows.append(_item(a, c, start, as_of, reads.get(a.id), summary))

    surfaced = defaultdict(list)
    hidden = defaultdict(list)
    for r in rows:
        if r["tier"] != ROUTINE:
            surfaced[r["symbol"]].append(r)
    folded = defaultdict(list)
    for r in rows:
        if r["tier"] == ROUTINE:
            # Results ads repeat the results filing: they ride on that company's card, not in the hidden row.
            if r["category"] == "results" and r["symbol"] in surfaced:
                folded[r["symbol"]].append(r)
            else:
                hidden[r["reason"]].append(r)

    cards = []
    for sym, its in surfaced.items():
        its.sort(key=lambda r: r["score"], reverse=True)
        extra_high = sum(1 for r in its[1:] if r["tier"] == HIGH)
        m = meta.get(sym, {})
        cards.append({
            "symbol": sym,
            "company": m.get("name", sym),
            "sector": m.get("sector", ""),
            "size": m.get("size", ""),
            "score": round(its[0]["score"] + 3 * extra_high, 1),
            "lead": its[0],
            "items": its[1:],
            "routine_count": sum(1 for r in rows if r["symbol"] == sym and r["tier"] == ROUTINE),
            "folded": folded.get(sym, []),
        })
    cards.sort(key=lambda c: c["score"], reverse=True)

    hidden_groups = sorted(
        ({"reason": k, "count": len(v), "items": v} for k, v in hidden.items()),
        key=lambda g: g["count"], reverse=True,
    )
    active = {r["symbol"] for r in rows}
    return {
        "window": {"start": start.isoformat(timespec="seconds"), "end": as_of.isoformat(timespec="seconds"), "hours": hours},
        "counts": {
            "total": len(rows),
            "shown": sum(1 + len(c["items"]) + len(c["folded"]) for c in cards),
            "hidden": sum(g["count"] for g in hidden_groups),
            "duplicates_dropped": len(in_window) - len(rows),
        },
        "cards": cards,
        "hidden": hidden_groups,
        "quiet": sorted(s for s in meta if s not in active),
    }
