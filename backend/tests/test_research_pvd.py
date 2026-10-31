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
        [_promise(id="P1", horizon="FY27"), _promise(id="P2", kind="qualitative", target_low=None, metric="other",
                                                     quote="we will look at possibly very strong ways to keep on growing")],
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
    ms = _promise(id="P1", kind="milestone", metric="other", label="QRSAM order", target_low=None, horizon="Q4 FY26",
                  quote="We are confident we may get in the Q4 of this year itself QRSAM")
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
    a = _promise(id="P1", metric="revenue_growth", unit="%", target_low=15, target_high=17, direction="range", horizon="FY26",
                 quote="It will be between 15% to 17% growth this year")
    b = _promise(id="P2", metric="revenue_growth", unit="%", target_low=15, direction="at_least", call="Q3 FY26", doc="T-Q4FY26",
                 quote="Revenue growth more than 15%, EBITDA margin more than 27%")
    c = _promise(id="P3", metric="revenue_growth", unit="%", target_low=12, direction="at_least", call="Q3 FY26", doc="T-Q4FY26",
                 quote="Revenue growth now more than 12% for the year")
    rows, _ = _assemble([a, b], [], [dict(promise_ids=["P1", "P2"], actual_ids=[], verdict="not_found", reason="", evidence=None)])
    assert rows[0]["restated"] == 1 and rows[0]["revisions"] == []
    rows, _ = _assemble([a, c], [], [dict(promise_ids=["P1", "P3"], actual_ids=[], verdict="not_found", reason="", evidence=None)])
    assert [r["target"] for r in rows[0]["revisions"]] == ["12%+"]
    d = _promise(id="P4", metric="revenue_growth", unit="%", target_low=None, call="Q3 FY26", doc="T-Q4FY26",
                 quote="we'll cross about the earlier number, mainly driven by EMS revenue")
    rows, _ = _assemble([a, b, d], [], [dict(promise_ids=["P1", "P2", "P4"], actual_ids=[], verdict="not_found", reason="", evidence=None)])
    assert [x["change"] for x in rows[0]["later"]] == ["restated", "no figure read"]


@pytest.mark.parametrize("path", sorted((settings.data_dir / "recordings" / "research").glob("*.json")), ids=lambda p: p.stem)
def test_every_recorded_claim_reverifies_against_its_page(path):
    rec = json.loads(path.read_text())
    cited = json.loads(gzip.decompress(path.with_name(f"{path.stem}.pages.json.gz").read_bytes()))
    assert pvd.reverify(rec, cited) == []
    for r in rec["scorecard"]["rows"]:
        assert r["verdict"] in pvd.VERDICTS
        assert r["promised"]["url"].endswith(f"#page={r['promised']['page']}")
    assert all(m["model"] for stage in rec["models"].values() for m in stage), "every model output names its model"


def test_pl_page_finder_prefers_consolidated_and_skips_auditors():
    standalone = "Standalone Statement of Profit and Loss (` in lakhs) For the year ended 31 March 2026 I Revenue from Operations 1.00 Profit before tax 2.00"
    consolidated = ("Sl. No. Particulars For the year ended 31 March 2026 I Revenue from Operations 23.10 Profit before Tax 9.10 "
                    + "x " * 300 + "Consolidated Statement of Profit and Loss for the year ended 31 March 2026")
    auditor = "Independent Auditors' Report ... the Consolidated Statement of Profit and Loss, Revenue from operations, profit before tax"
    assert pvd.pl_candidates([auditor, standalone, consolidated]) == [3, 2]


def test_credibility_line_is_built_from_the_verdicts():
    rows = [{"label": "QRSAM order", "verdict": "missed"}, {"label": "Capex", "verdict": "partially"},
            {"label": "Revenue growth", "verdict": "met"}, {"label": "EBITDA margin", "verdict": "met"},
            {"label": "Exports", "verdict": "not_found"}]
    counts = {v: sum(r["verdict"] == v for r in rows) for v in pvd.VERDICTS}
    c = pvd._credibility(None, rows, counts, [], None)
    assert c["headline"] == "Met 2 of 4 checkable promises"
    assert c["line"] == "Missed QRSAM order; short on capex; delivered revenue growth and EBITDA margin."


def test_revenue_printed_only_as_parts_is_summed_by_code(monkeypatch):
    page = ("Consolidated Statement of Profit and Loss for the year ended 31st March 2026 (` in Crores) "
            "REVENUE FROM OPERATIONS Revenue from Sale of Products 23A 35,416.25 33,626.82 Revenue from Sale of Services "
            "23A 100.12 170.54 Other Operating Revenue 23A 67.17 108.26 Profit before tax 5,900.10 5,000.20 "
            "Profit for the year 4,394.69 3,709.71")
    P = pvd.Pair
    out = pvd.AnnualPL(found=True, page=1, basis="consolidated", unit="crore", revenue=P(current=35583.54, previous=33905.62),
                       revenue_parts=[P(current=35416.25, previous=33626.82), P(current=100.12, previous=170.54),
                                      P(current=67.17, previous=108.26)],
                       other_income=P(current=None, previous=None), finance_costs=P(current=None, previous=None),
                       depreciation=P(current=None, previous=None), pbt=P(current=5900.10, previous=5000.20),
                       pat=P(current=4394.69, previous=3709.71))
    monkeypatch.setattr(pvd, "pl_candidates", lambda pages: [1])
    monkeypatch.setattr(pvd.llm, "call", lambda *a, **k: pvd.llm.LLMResult(out, "recorded", model="m"))
    pl, _, dropped = pvd.read_annual(Doc("AR-FY26", "annual_report", "AR", "FY26", "u"), [page])
    assert pl["figures"]["revenue"]["current"] == 35583.54 and not dropped     # model's own sum was not on the page
    growth = {i["id"]: i for i in pvd.annual_items(pl)}["AR:revenue_growth:FY26"]
    assert growth["value"] == 4.9 and "sum of 3 printed lines" in growth["how"]
    assert pvd.reverify({"scorecard": {"rows": []}, "financials": pl}, {"AR-FY26": {"1": page}}) == []


def test_a_count_without_a_unit_is_left_out():
    p = _promise(id="P1", metric="other", unit="none", target_low=10.0, label="People skilling",
                 quote="we are gunning for training almost 10 lakh people")
    rows, dropped = _assemble([p], [], [dict(promise_ids=["P1"], actual_ids=[], verdict="not_found", reason="", evidence=None)])
    assert rows == [] and dropped[0]["what"] == "People skilling"


@pytest.mark.parametrize("kw,why", [
    (dict(unit="crore", target_low=25000.0, quote="revenue visibility of over INR25,000 million over the next 5 years"),
     "the quote doesn't state the unit the target was read in"),
    (dict(unit="%", target_low=70.0, target_high=85.0, quote="what we expect is about between 70 to 85 days. Last year, it was 85 days."),
     "the quote doesn't state the unit the target was read in"),
    (dict(unit="usd_billion", target_low=2.0, quote="Do we still hold at $1 billion revenue guidance by FY '28 and $2 billion by FY '30?"),
     "the quote is a question, not a promise"),
    (dict(kind="qualitative", target_low=None, unit="%", quote="the EBITDA might exceed the guidance of 15.6%."),
     "the quote states a figure that wasn't read as the target; not judged"),
    (dict(kind="qualitative", target_low=2.0, unit="none", quote="we have committed the 2x of the market growth"),
     "a figure with no unit FINN can show; left out rather than shown as a bare number"),
    (dict(unit="crore", target_low=4500.0, quote="So we maintain our what I call the guidance of INR4,500 crores plus on a consol basis."), ""),
    (dict(kind="qualitative", target_low=None, unit="none", quote="we will look at possibly very strong ways to keep on growing"), ""),
])
def test_row_problems(kw, why):
    assert pvd.row_problem(_promise() | kw) == why


def test_about_in_the_quote_makes_a_point_target():
    p = _promise(target_low=300.0, quote="this year is about INR300 crores for OSAT, INR300 crores for PCB")
    assert pvd.format_target(pvd.settle_direction(p)) == "about ₹300 cr"
    assert pvd.settle_direction(_promise())["direction"] == "at_least"      # "INR1,000-plus crores"


def test_a_dated_future_commitment_is_not_yet_due_even_if_worded():
    p = _promise(id="P1", kind="qualitative", target_low=None, metric="other", horizon="FY27",
                 quote="by end of the financial year we'll turn the cash positive, we are pretty confident on that")
    rows, _ = _assemble([p], [], [dict(promise_ids=["P1"], actual_ids=[], verdict="too_vague", reason="", evidence=None)])
    assert rows[0]["verdict"] == "not_yet_due"


def test_an_analyst_question_first_in_a_group_gives_way_to_managements_statement():
    q = _promise(id="P1", unit="usd_billion", target_low=1.0, metric="revenue", horizon="FY28",
                 quote="Do we still hold at $1 billion revenue guidance by FY '28 and $2 billion by FY '30?")
    m = _promise(id="P2", unit="usd_billion", target_low=1.0, metric="revenue", horizon="FY28", call="Q4 FY26", doc="T-Q4FY26",
                 quote="So $1 billion by FY '28, certainly visibility is there, and we are sure we'll do it.")
    rows, dropped = _assemble([q, m], [], [dict(promise_ids=["P1", "P2"], actual_ids=[], verdict="not_found", reason="", evidence=None)])
    assert rows[0]["promised"]["quote"].startswith("So $1 billion") and not dropped


def test_period_written_in_the_quote_wins():
    a = _reported(metric="ebitda_margin", label="Q4 FY26 EBIT margin", period="Q1 FY26", value=16.6, unit="%",
                  quote="I would like to draw your attention to the fact that Q4 FY26 EBIT of the firm is 16.6%, while it was")
    assert pvd.period_from_quote(a)["period"] == "Q4 FY26"
    two = a | {"quote": "Q4 FY26 EBIT of the firm is 16.6%, while it was 12.3% in Q4 FY25"}
    assert pvd.period_from_quote(two)["period"] == "Q1 FY26"          # two periods named: leave it


def test_ebit_guidance_is_not_settled_by_an_ebitda_figure():
    p = _promise(id="P1", metric="ebitda_margin", label="FY26 EBIT margin", unit="%", target_low=14.0, horizon="FY26",
                 quote="if we manage to hit it this year, we will plan to at a minimum clip along at 14% EBIT")
    ebitda = _reported(id="R1", metric="ebitda_margin", label="FY26 EBITDA margin", value=18.6, unit="%", period="FY26",
                       quote="EBITDA margins came in at 18.6% for the year")
    ebit = _reported(id="R2", metric="ebitda_margin", label="FY26 EBIT margin", value=14.4, unit="%", period="FY26",
                     quote="EBIT margin came in at 14.4% as compared to 10.7% a year ago")
    rows, _ = _assemble([p], [ebitda, ebit], [dict(promise_ids=["P1"], actual_ids=["R1", "R2"], verdict="met", reason="", evidence=None)])
    assert rows[0]["delivered"]["value"] == 14.4


def test_code_matches_a_unique_figure_the_judge_missed_but_not_an_ambiguous_one():
    p = _promise(id="P1", metric="ebitda_margin", label="Q4 EBIT", unit="%", target_low=15.0, horizon="Q4 FY26", call="Q3 FY26",
                 quote="our plan to register a 15% EBIT in Q4 will lead us to the 14% EBIT guidance")
    q4 = _reported(id="R1", metric="ebitda_margin", label="Q4 FY26 EBIT margin", period="Q1 FY26", value=16.6, unit="%",
                   quote="the fact that Q4 FY26 EBIT of the firm is 16.6%, while it was")
    group = [dict(promise_ids=["P1"], actual_ids=[], verdict="not_found", reason="", evidence=None)]
    rows, _ = _assemble([p], [q4], group)
    assert (rows[0]["verdict"], rows[0]["delivered"]["period"]) == ("met", "Q4 FY26")
    other = _reported(id="R2", metric="ebitda_margin", label="Standalone EBIT", period="Q4 FY26", value=17.0, unit="%",
                      quote="standalone EBIT of 17% in the quarter")
    rows, _ = _assemble([p], [q4, other], group)
    assert rows[0]["verdict"] == "not_found"


def test_a_promise_about_the_quarter_being_reported_is_not_a_promise():
    p = _promise(horizon="Q2 FY26", call="Q2 FY26", kind="milestone", target_low=None,
                 quote="effective date of the merger is 1st April 2025 as approved")
    assert pvd.row_problem(p).startswith("due by the quarter the call itself reports")


def test_late_needs_evidence_that_says_when():
    ms = _promise(id="P1", kind="milestone", metric="other", label="Washing machine launch", target_low=None, horizon="Q3 FY26",
                  quote="product will be launched by Q3 of the current fiscal year as planned")
    ev = _reported(id="R1", metric="other", value=None, unit="none", period="Q4 FY26",
                   quote="We have started manufacturing semi-auto washing machines in 16 and 18 kg capacity")
    rows, _ = _assemble([ms], [ev], [dict(promise_ids=["P1"], actual_ids=["R1"], verdict="partially",
                                          reason="Started in Q4 FY26 instead of Q3 FY26.", evidence=None)])
    assert rows[0]["verdict"] == "not_found" and "not when" in rows[0]["reason"]
    dated = ev | {"quote": "mass production to start by Q2 financial year '26-'27 with annual capacity"}
    rows, _ = _assemble([ms], [dated], [dict(promise_ids=["P1"], actual_ids=["R1"], verdict="missed", reason="Pushed out.", evidence=None)])
    assert rows[0]["verdict"] == "missed"
