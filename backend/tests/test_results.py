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
    assert results.headline(view) == "PAT ₹1,085 cr, +6.6% YoY; revenue +16.9% YoY (consolidated)"
    dated = {**view, "period": "Sep 2026", "basis": "standalone"}
    assert results.headline(dated) == "PAT ₹1,085 cr, +6.6% YoY; revenue +16.9% YoY (Sep 2026 qtr, standalone)"
    assert results._crore(332861.0) == "3,32,861" and results._crore(99.44) == "99.4"
    assert results.headline({**view, "confidence": "low"}) is None


# HUL Q2 consolidated, as pypdf extracts it: columns are this quarter, year ago, previous quarter.
PARTS_PAGE = """(Rs in crores)
Revenue from operations
18,037 15,715 17,149 Sale of products 35,186 31,267 63,636
34 27 35 Sale of services 69 54 127
155 177 157 Other operating revenue 312 355 705
160 147 188 Other income 348 348 751
18,386 16,066 17,529 TOTAL INCOME 35,915 32,024 65,219
74 124 75 Finance costs 149 246 410
363 322 353 Depreciation and amortisation expense 716 648 1,333
3,814 3,702 3,632 Profit before tax 7,446 6,969 13,812
2,796 2,694 2,680 PROFIT FOR THE PERIOD 5,476 5,462 15,059"""


def parts_table():
    f = lambda c, p, y: {"current": c, "previous": p, "year_ago": y}  # noqa: E731
    return table(revenue=f(18037.0, 17149.0, 15715.0), other_income=f(160.0, 188.0, 147.0), finance_costs=f(74.0, 75.0, 124.0),
                 depreciation=f(363.0, 353.0, 322.0), pbt=f(3814.0, 3632.0, 3702.0), pat=f(2796.0, 2680.0, 2694.0))


def test_revenue_printed_only_as_parts_is_summed_by_code():
    out = results.compute(parts_table(), PARTS_PAGE, lender=False)
    r = out["rows"]["revenue"]
    assert (r["current"], r["previous"], r["year_ago"]) == (18226.0, 17341.0, 15919.0)
    assert r["qoq_pct"] == 5.1 and r["yoy_pct"] == 14.5
    assert out["margins"]["pat"] == 15.3
    assert out["revenue_how"] == "sum of 3 printed lines" and out["confidence"] == "high"


def test_parts_that_do_not_reach_the_total_withhold_the_card():
    page = PARTS_PAGE.replace("18,386 16,066 17,529 TOTAL", "18,999 16,066 17,529 TOTAL")
    out = results.compute(parts_table(), page, lender=False)
    assert out["confidence"] == "low" and out["confidence_note"] == results.PARTS_DONT_ADD
    assert out["rows"]["revenue"]["current"] is None and out["revenue_how"] is None


def test_a_revenue_line_that_is_the_total_is_left_alone():
    out = results.compute(table(), PAGE, lender=False)
    assert out["rows"]["revenue"]["current"] == 9976.51 and out["revenue_how"] is None
    # Parts are printed but the model read the total line under them.
    page = """Revenue from operations
(a) Sale of products 9,000.00 9,500.00 8,000.00
(b) Other operating revenue 976.51 1,041.94 531.27
Total revenue from operations 9,976.51 10,541.94 8,531.27
Other income 247.79 240.85 198.64
Total income 10,224.30 10,782.79 8,729.91"""
    assert results.revenue_parts(table(), page) is None


def checked(**over):
    f = lambda c, p, y: {"current": c, "previous": p, "year_ago": y}  # noqa: E731
    base = {"revenue": f(9976.51, 10541.94, 8531.27), "other_income": f(247.79, 240.85, 198.64), "finance_costs": f(55.4, 47.83, 43.87),
            "depreciation": f(313.67, 304.19, 304.93), "pbt": f(1477.78, 2095.75, 1391.52), "pat": f(1085.35, 1559.45, 1018.23)}
    return base | {k: f(*v) for k, v in over.items()}


def test_consistent_figures_pass():
    assert results.inconsistencies(checked()) == []


def test_pat_above_pbt_fails():
    assert results.inconsistencies(checked(pat=(1500.0, 1559.45, 1018.23))) == ["PAT is above PBT in this quarter"]


def test_implausible_implied_tax_fails_in_any_column():
    # Equitas as recorded: PBT 28,738.39 with the June quarter's 18,360.69 as PAT.
    assert results.inconsistencies(checked(pbt=(28738.39, 24407.3, 3353.81), pat=(18360.69, None, 2413.53))) == [
        "implied tax of 36.1% in this quarter is outside 10% to 35%"]
    assert "the year-ago quarter" in results.inconsistencies(checked(pat=(1085.35, 1559.45, 1300.0)))[0]


def test_a_loss_has_no_tax_rate_to_check():
    assert results.inconsistencies(checked(pbt=(-100.0, 2095.75, 1391.52), pat=(-80.0, 1559.45, 1018.23))) == []


def test_a_current_figure_repeating_another_column_fails():
    assert results.inconsistencies(checked(revenue=(9976.51, 9976.51, 8531.27))) == ["Revenue repeats a figure from another column"]
    assert results.inconsistencies(checked(finance_costs=(74.0, 74.0, 124.0))) == []     # small round figures repeat by chance


def test_an_inconsistent_card_goes_low_and_says_why():
    t = table()
    t["pat"] = {"current": 1500.0, "previous": 1559.45, "year_ago": 1018.23}
    out = results.compute(t, PAGE + "\n1,500.00", lender=False)
    assert out["confidence"] == "low" and out["confidence_note"] == "The figures don't fit together: PAT is above PBT in this quarter."
    assert results.compute(table(), PAGE, lender=False)["inconsistent"] == []


SCRAMBLED = "\n".join(f"{n:,.2f}" for n in range(1200, 1240))     # one token per line, as Equitas's OCR layer comes out


def test_a_page_of_lone_figures_has_no_rows():
    assert not results.has_rows(SCRAMBLED)
    assert results.has_rows(PAGE)
    # Reliance prints a third of its figures alone on a line and its other rows read fine.
    assert results.has_rows("\n".join(["1,234.56"] * 11 + ["Revenue 1,234.56 2,345.67 3,456.78"] * 8))
    assert results.has_rows("Notice of meeting\n12.50\n")          # too few figures to call it a table at all


def test_an_unreadable_table_is_withheld_with_no_model_call(monkeypatch):
    from finn import llm
    from finn.sources.nse import Announcement

    def no_call(*a, **k):
        raise AssertionError("the model must not be called on a page with no rows")
    monkeypatch.setattr(llm, "call", no_call)
    monkeypatch.setattr(results, "_save", lambda rec: rec)
    page = "Consolidated results Quarter ended Revenue from operations Profit before tax\n" + SCRAMBLED
    monkeypatch.setattr(results, "_pages", lambda url: ["Cover", page])
    a = Announcement(id="1", symbol="X", company="X", desc="d", text="t", url="https://example.com/x.pdf", ts="2026-10-29 14:50:00")
    rec = results.extract(a, lender=True)
    assert rec["status"] == "withheld" and rec["confidence"] == "low" and rec["page"] == 2

    view = results.card_view(rec)
    assert view["status"] == "extracted" and view["confidence"] == "low" and view["confidence_note"] == results.NO_ROWS
    assert view["url"].endswith("#page=2") and results.headline(view) is None
    assert view["rows"]["pat"]["current"] is None and view["rows"]["ebitda"] is None


def test_a_low_confidence_card_ships_no_figures():
    t = table()
    t["pat"]["current"] = 1058.35
    rec = {"id": "1", "symbol": "X", "url": "u", "status": "extracted", "extracted": t, "lender": False}
    rec |= results.compute(t, PAGE, lender=False)
    assert rec["rows"]["revenue"]["current"] == 9976.51           # computed, and kept in the recording for the audit
    view = results.card_view(rec)
    assert all(v is None for r in view["rows"].values() for v in r.values())
    assert view["margins"] == {"ebitda": None, "pat": None}


def test_recompute_withholds_a_recorded_extraction_when_its_page_has_no_rows(monkeypatch):
    monkeypatch.setattr(results, "_save", lambda rec: rec)
    rec = {"id": "1", "symbol": "X", "url": "u", "status": "extracted", "extracted": table(), "candidates": [1], "lender": True}
    out = results.recompute(rec, [""] * 11 + [SCRAMBLED], lender=True)     # table() cites page 12
    assert out["status"] == "withheld" and "extracted" not in out and "rows" not in out


def test_a_loss_takes_the_real_minus_sign():
    assert results._crore(-1234.5) == "−1,234" and results._crore(-99.44) == "−99.4"
    assert results._crore(332861.0) == "3,32,861"


def test_period_reads_every_quarter_label_in_the_recording():
    for label in ["30 Sep 26", "30.09.2026", "September 30, 2026", "30 September 2026", "30th Sept 2026", "30-Sep-26", "30th Sep'26"]:
        assert results.period(label) == "Sep 2026", label


def test_period_refuses_what_is_not_a_date():
    for label in ["491271", "", "September 30", "Q2", "45.13.2026"]:
        assert results.period(label) is None, label
