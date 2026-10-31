"""Promised vs delivered: the verifier, the verdict rules and the recordings. No network, no model."""
import gzip
import json

import pytest

from finn.config import settings
from finn.research import pvd
from finn.research.docs import Doc

# Real BEL Q1 FY26 page text, as pypdf extracts it (split words included).
PAGE = ("Bharat Electronics Limited July 30 , 202 5 Page 20 of 20 R&D investment as it was committed, it will be "
        "INR1,600 - plus crores only. Capex, INR1,000 - plus crores and export $120 - plus m illion. So, these are "
        "our future outlook for FY ' 25 - ' 26, and we are confident of achieving this.")


def test_quote_survives_pdf_splits_and_tidied_punctuation():
    assert pvd.quote_on_page("R&D investment as it was committed, it will be INR1,600-plus crores only. "
                             "Capex, INR1,000-plus crores and export $120-plus million.", PAGE)


def test_paraphrase_and_short_quotes_fail():
    assert not pvd.quote_on_page("R&D investment will be more than INR1,600 crores this year", PAGE)
    assert not pvd.quote_on_page("Capex, INR1,000-plus crores", PAGE)     # under six words


def _promise(**kw):
    base = {"metric": "capex", "label": "Capex", "kind": "numeric", "target_low": 1000.0, "target_high": None,
            "unit": "crore", "direction": "at_least", "horizon": "FY26", "speaker": "CFO", "page": 2,
            "quote": "Capex, INR1,000-plus crores and export $120-plus million.", "call": "Q1 FY26", "doc": "T-Q1FY26"}
    return base | kw


def test_check_recites_a_neighbouring_page_only_when_unique():
    item = _promise(page=1)
    assert pvd._check(item, ["cover letter", PAGE, "closing remarks"], ("target_low",)) == ""
    assert (item["page"], item["page_cited"]) == (2, 1)
    assert pvd._check(_promise(page=1), ["x", "y", PAGE], ("target_low",)) == "quote not found on the cited page"


def test_check_drops_a_target_that_isnt_in_its_quote():
    item = _promise(page=1, target_low=27.0, quote="So we are trying to adhere to the guidance what is given to you.")
    page = "So we are trying to adhere to the guidance what is given to you. EBITDA 27%"
    assert pvd._check(item, [page], ("target_low",)) == "27 is not in the quote"


@pytest.mark.parametrize("p,value,verdict", [
    (dict(metric="revenue_growth", unit="%", target_low=15, direction="at_least"), 16.2, "met"),
    (dict(metric="revenue_growth", unit="%", target_low=15, target_high=17, direction="range"), 12.5, "partially"),
    (dict(metric="revenue_growth", unit="%", target_low=15, direction="at_least"), 11.9, "missed"),
    (dict(metric="ebitda_margin", unit="%", target_low=27, direction="at_least"), 26.2, "partially"),
    (dict(metric="ebitda_margin", unit="%", target_low=27, direction="at_least"), 25.9, "missed"),
    (dict(metric="ebitda_margin", unit="%", target_low=27, direction="about"), 26.6, "met"),
    (dict(metric="capex", unit="crore", target_low=1000, direction="at_least"), 900, "partially"),
    (dict(metric="order_inflow", unit="crore", target_low=57000, direction="about"), 30045, "missed"),
    (dict(metric="other", unit="none", target_low=None, target_high=90, direction="at_most"), 95, "partially"),
])
def test_numeric_verdict(p, value, verdict):
    assert pvd.numeric_verdict(_promise(target_high=None) | p, value) == verdict


def test_periods_and_targets():
    assert pvd.due_of("H1 FY26") == (26, 2) and pvd.due_of("FY26") == (26, 4) and pvd.due_of("9M FY2026") == (26, 3)
    assert pvd.due_of("next 3-4 years") is None
    assert pvd.canonical("q3 fy2030") == "Q3 FY30"
    assert pvd.format_target(_promise()) == "₹1,000 cr+"
    assert pvd.format_target(_promise(unit="%", target_low=15, target_high=17, direction="range")) == "15%–17%"
    assert pvd.format_target(_promise(unit="usd_million", target_low=120)) == "$120 mn+"


def test_annual_growth_and_margins_are_computed_by_code():
    pl = {"doc": "AR-FY26", "page": 124, "basis": "consolidated", "fy": "FY26", "prev_fy": "FY25",
          "figures": {"revenue": {"current": 27479.63, "previous": 23658.01}, "pat": {"current": 6048.48, "previous": 5288.25},
                      "ebitda": {"current": 8015.3, "previous": 6767.59}}}
    items = {i["id"]: i for i in pvd.annual_items(pl)}
    assert items["AR:revenue_growth:FY26"]["value"] == 16.2
    assert items["AR:ebitda_margin:FY26"]["value"] == 29.2
    assert items["AR:pat_margin:FY26"]["value"] == 22.0


DOCS = {d: Doc(d, "transcript", d, d, f"https://x/{d}.pdf") for d in ("T-Q1FY26", "T-Q4FY26", "AR-FY26")}


def _assemble(promises, actuals, groups, texts=None, evidence=None):
    j = pvd.Judgement(groups=[pvd.Group(**g) for g in groups], credibility="")
    return pvd.assemble(promises, actuals, j, "Q1 FY27", DOCS, texts or {}, evidence or {})


def _reported(**kw):
    return {"id": "R1", "metric": "capex", "label": "Capex", "period": "FY26", "value": 900.0, "unit": "crore",
            "speaker": "", "quote": "last year we had INR900 crores capital expenditure", "doc": "T-Q4FY26", "page": 11,
            "source": "transcript", "how": "as stated by management"} | kw


def test_code_overrules_the_model_on_numeric_promises():
    rows, dropped = _assemble([_promise(id="P1")], [_reported()],
                              [dict(promise_ids=["P1"], actual_ids=["R1"], verdict="met", reason="Delivered.", evidence=None)])
    assert (rows[0]["verdict"], rows[0]["verdict_by"]) == ("partially", "rule")
    assert rows[0]["delivered"]["text"] == "₹900 cr"


def test_not_yet_due_and_too_vague_are_rules():
    rows, _ = _assemble(
        [_promise(id="P1", horizon="FY27"), _promise(id="P2", kind="qualitative", target_low=None, metric="other")],
        [], [dict(promise_ids=["P1"], actual_ids=[], verdict="met", reason="", evidence=None),
             dict(promise_ids=["P2"], actual_ids=[], verdict="met", reason="", evidence=None)])
    assert {r["id"]: r["verdict"] for r in rows} == {"P1": "not_yet_due", "P2": "too_vague"}


def test_a_figure_for_another_period_doesnt_count():
    rows, _ = _assemble([_promise(id="P1")], [_reported(period="FY25")],
                        [dict(promise_ids=["P1"], actual_ids=["R1"], verdict="missed", reason="", evidence=None)])
    assert rows[0]["verdict"] == "not_found" and rows[0]["delivered"] is None


def test_model_reason_with_an_unsourced_number_is_withheld():
    ms = _promise(id="P1", kind="milestone", metric="other", label="QRSAM order", target_low=None, horizon="Q4 FY26",
                  quote="We are confident we may get in the Q4 of this year itself QRSAM")
    ev = _reported(id="R1", metric="other", value=None, unit="none", period="Q4 FY26",
                   quote="procedural delays we knew, that is why we told it may go to Q1/Q2")
    rows, dropped = _assemble([ms], [ev], [dict(promise_ids=["P1"], actual_ids=["R1"], verdict="missed",
                                                reason="Delayed by 6 months to September.", evidence=None)])
    assert rows[0]["verdict"] == "not_found" and dropped[0]["stage"] == "verdict"


def test_evidence_must_come_from_a_searched_page_and_be_verbatim():
    ms = _promise(id="P1", kind="milestone", metric="other", label="QRSAM order", target_low=None, horizon="Q4 FY26")
    page = "And QRSAM, we told we were highly optimistic to get it by March, but procedural delays we knew."
    texts = {"T-Q4FY26": ["", page]}
    searched = {"P1": [{"doc": "T-Q4FY26", "page": 2, "call": "Q4 FY26", "text": page}]}
    good = dict(doc="T-Q4FY26", page=2, quote="we told we were highly optimistic to get it by March, but procedural delays",
                value=None, unit="none", period="Q4 FY26")
    rows, dropped = _assemble([ms], [], [dict(promise_ids=["P1"], actual_ids=[], verdict="missed", reason="Not by March.",
                                              evidence=good)], texts, searched)
    assert rows[0]["verdict"] == "missed" and rows[0]["verdict_by"] == "model" and not dropped
    bad = good | {"quote": "we were optimistic to get it by March but it slipped to September"}
    rows, dropped = _assemble([ms], [], [dict(promise_ids=["P1"], actual_ids=[], verdict="missed", reason="Not by March.",
                                              evidence=bad)], texts, searched)
    assert rows[0]["verdict"] == "not_found" and dropped[0]["why"] == "evidence quote not found on the cited page"


def test_restating_a_target_in_other_words_is_not_a_revision():
    a = _promise(id="P1", metric="revenue_growth", unit="%", target_low=15, target_high=17, direction="range", horizon="FY26")
    b = _promise(id="P2", metric="revenue_growth", unit="%", target_low=15, direction="at_least", call="Q4 FY26", doc="T-Q4FY26")
    c = _promise(id="P3", metric="revenue_growth", unit="%", target_low=12, direction="at_least", call="Q4 FY26", doc="T-Q4FY26")
    rows, _ = _assemble([a, b], [], [dict(promise_ids=["P1", "P2"], actual_ids=[], verdict="not_found", reason="", evidence=None)])
    assert rows[0]["restated"] == 1 and rows[0]["revisions"] == []
    rows, _ = _assemble([a, c], [], [dict(promise_ids=["P1", "P3"], actual_ids=[], verdict="not_found", reason="", evidence=None)])
    assert [r["target"] for r in rows[0]["revisions"]] == ["12%+"]


@pytest.mark.parametrize("path", sorted((settings.data_dir / "recordings" / "research").glob("*.json")), ids=lambda p: p.stem)
def test_every_recorded_claim_reverifies_against_its_page(path):
    rec = json.loads(path.read_text())
    cited = json.loads(gzip.decompress(path.with_name(f"{path.stem}.pages.json.gz").read_bytes()))
    assert pvd.reverify(rec, cited) == []
    for r in rec["scorecard"]["rows"]:
        assert r["verdict"] in pvd.VERDICTS
        assert r["promised"]["url"].endswith(f"#page={r['promised']['page']}")
    assert all(m["model"] for stage in rec["models"].values() for m in stage), "every model output names its model"
