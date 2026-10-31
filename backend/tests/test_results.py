import pytest

from finn import results

# Asian Paints Q2 consolidated, as pypdf extracts it (split numbers included).
PAGE = """Revenue from operations 9 ,976 .51 10,541.94 8 ,531.27
Other income 247 .79 240.85 198 .64
e) Finance costs 55 .40 47.83 43.87
t) Depreciation and amortisation expense 313 .67 304.19 304 .93
Profit before tax (7-8) 1,477.78 2 ,095.75 1,391 .52
Profit for the period (9-10) 1,085.35 1,559.45 1,018.23"""


def table(unit="crore", basis="consolidated", **over):
    f = lambda c, p, y: {"current": c, "previous": p, "year_ago": y}  # noqa: E731
    t = {"found": True, "page": 12, "basis": basis, "unit": unit, "quarter_label": "30.09.2026",
         "revenue_label": "Revenue from operations",
         "revenue": f(9976.51, 10541.94, 8531.27), "other_income": f(247.79, 240.85, 198.64),
         "finance_costs": f(55.40, 47.83, 43.87), "depreciation": f(313.67, 304.19, 304.93),
         "pbt": f(1477.78, 2095.75, 1391.52), "pat": f(1085.35, 1559.45, 1018.23)}
    return t | over


def test_qoq_yoy_and_ebitda_are_computed_in_code():
    out = results.compute(table(), PAGE, lender=False)
    r = out["rows"]
    assert r["revenue"]["qoq_pct"] == -5.4 and r["revenue"]["yoy_pct"] == 16.9
    assert r["pat"]["qoq_pct"] == -30.4 and r["pat"]["yoy_pct"] == 6.6
    # EBITDA = PBT + finance costs + D&A - other income
    assert r["ebitda"]["current"] == pytest.approx(1477.78 + 55.40 + 313.67 - 247.79, abs=0.01)
    assert out["margins"]["pat"] == 10.9
    assert out["confidence"] == "high" and out["dropped"] == []


def test_a_figure_not_on_the_page_is_dropped_and_lowers_confidence():
    t = table()
    t["pat"]["current"] = 1058.35                      # transposed digits: not printed anywhere
    out = results.compute(t, PAGE, lender=False)
    assert out["rows"]["pat"]["current"] is None and out["rows"]["pat"]["qoq_pct"] is None
    assert "pat.current" in out["dropped"] and out["confidence"] == "low"


def test_ebitda_needs_every_part_verified():
    t = table()
    t["depreciation"]["previous"] = 999.99
    out = results.compute(t, PAGE, lender=False)
    assert out["rows"]["ebitda"]["previous"] is None and out["rows"]["ebitda"]["qoq_pct"] is None
    assert out["rows"]["ebitda"]["yoy_pct"] is not None
    assert out["confidence"] == "medium"


def test_lenders_get_no_ebitda():
    out = results.compute(table(), PAGE, lender=True)
    assert out["rows"]["ebitda"] is None and out["margins"]["ebitda"] is None


def test_units_convert_to_crore():
    page = PAGE.replace("9 ,976 .51", "997,651")
    t = table(unit="lakh")
    t["revenue"]["current"] = 997651
    assert results.compute(t, page, lender=False)["rows"]["revenue"]["current"] == 9976.51


def test_standalone_is_never_high_confidence():
    assert results.compute(table(basis="standalone"), PAGE, lender=False)["confidence"] == "medium"


def test_growth_off_a_loss_is_not_meaningful():
    assert results.pct(50, -100) is None and results.pct(50, 0) is None and results.pct(None, 10) is None
    assert results.pct(-50, 100) == -150.0


def test_page_finder_prefers_the_consolidated_table():
    pages = ["Notice of board meeting", "Standalone results Quarter ended Revenue from operations Profit before tax",
             "Consolidated results Quarter ended Revenue from opera tions Pro fit before tax", "Segment information"]
    assert [p for _, p, _ in results.page_scores(pages)] == [3, 2]


def test_headline_leads_with_the_number_in_indian_format():
    view = {"status": "extracted", "confidence": "high", "basis": "consolidated",
            "rows": results.compute(table(), PAGE, lender=False)["rows"]}
    assert results.headline(view) == "PAT ₹1,085 cr, +6.6% YoY; revenue +16.9%"
    assert results._crore(332861.0) == "3,32,861" and results._crore(99.44) == "99.4"
    assert results.headline({**view, "confidence": "low"}) is None
