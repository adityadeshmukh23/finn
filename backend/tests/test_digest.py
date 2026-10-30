from datetime import datetime, timedelta

from finn import digest
from finn.sources.nse import IST, Announcement

AS_OF = datetime(2026, 10, 30, 18, 0, tzinfo=IST)
META = {"AAA": {"name": "Alpha"}, "BBB": {"name": "Beta"}, "CCC": {"name": "Gamma"}}


def ann(sym, desc, text, hours_ago, i=[0]):
    i[0] += 1
    return Announcement(str(i[0]), sym, sym, desc, text, f"https://x/{i[0]}.pdf",
                        (AS_OF - timedelta(hours=hours_ago)).isoformat())


ITEMS = [
    ann("AAA", "Resignation", "Resignation of Mr X as Managing Director & CEO", 2),
    ann("AAA", "Copy of Newspaper Publication", "Newspaper ad", 3),
    ann("BBB", "Outcome of Board Meeting", "Approved financial results for the quarter ended September 30, 2026", 5),
    ann("BBB", "Outcome of Board Meeting", "Approved financial results for the quarter ended September 30, 2026", 5),
    ann("BBB", "ESOP/ESOS/ESPS", "Allotment of 100 Shares", 6),
    ann("AAA", "Dividend", "Interim dividend declared", 40),   # outside a 24h window
]


def test_window_rank_and_accounting():
    d = digest.build(ITEMS, AS_OF, 24, META)
    assert [c["symbol"] for c in d["cards"]] == ["AAA", "BBB"]          # CEO exit outranks results
    assert d["counts"] == {"total": 4, "shown": 2, "hidden": 2, "duplicates_dropped": 1}
    assert d["counts"]["shown"] + d["counts"]["hidden"] == d["counts"]["total"]
    assert {g["reason"] for g in d["hidden"]} == {"Newspaper ads", "ESOP grants & allotments"}
    assert d["quiet"] == ["CCC"]


def test_wider_window_includes_older_items():
    d = digest.build(ITEMS, AS_OF, 72, META)
    aaa = next(c for c in d["cards"] if c["symbol"] == "AAA")
    assert [i["category"] for i in aaa["items"]] == ["dividend"]


def test_results_headline_states_period():
    assert digest.results_period("results for the quarter ended September 30, 2026") == "Sep 2026"
    assert digest.results_period("quarter and half year ended 30th September, 2026") == "Sep 2026"
    assert digest.results_period("results for the quarter ended 30.09.2026") is None


def test_empty_window():
    d = digest.build([], AS_OF, 24, META)
    assert d["cards"] == [] and d["counts"]["total"] == 0 and d["quiet"] == ["AAA", "BBB", "CCC"]
