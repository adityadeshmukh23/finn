from finn import filings
from finn.classify import HIGH, MEDIUM, ROUTINE, classify
from finn.verify import number_in, numbers_in, quote_in

PAGE = """Delivered Turnover of ₹ 18,071 crores with USG of 15%. The Board approved the re -appointment
of Mr A B as Chief Information Security Officer, effective 1 February 202 7."""


def test_quote_must_be_in_the_text():
    assert quote_in("Delivered turnover of ₹ 18,071 crores", PAGE)
    assert quote_in("re-appointment of Mr A B", PAGE)                 # PDF split "re -appointment"
    assert quote_in("effective 1 February 2027", PAGE)                # PDF split "202 7"
    assert not quote_in("Delivered turnover of ₹ 18,701 crores", PAGE)   # transposed digits
    assert not quote_in("turnover", PAGE)                                # too short to mean anything


def test_numbers_must_be_in_the_text():
    assert numbers_in("Turnover 18,071 crores, growth 15%", PAGE)
    assert not numbers_in("Turnover 18,071 crores, growth 16%", PAGE)
    assert number_in(18071, PAGE) and not number_in(18017, PAGE)
    assert number_in(1234567.5, "Revenue 12,34,567.50 lakh")           # Indian grouping, trailing zero


def _rec(**kw):
    base = {"status": "read", "verified": True, "category": "results", "importance": "high",
            "summary": "Turnover of 18,071 crores", "quote": "Delivered Turnover", "page": 1}
    return base | kw


def test_verified_read_places_an_unreadable_filing():
    c = classify("Outcome of Board Meeting", "Outcome of the Board Meeting held on 28th October, 2026.")   # HUL
    out, summary = filings.apply(c, _rec())
    assert (out.category, out.tier, out.reason) == ("results", HIGH, "Quarterly results")
    assert summary == "Turnover of 18,071 crores"


def test_unverified_read_changes_nothing():
    c = classify("Outcome of Board Meeting", "Outcome of the Board Meeting held on 28th October, 2026.")
    assert filings.apply(c, _rec(verified=False)) == (c, None)
    assert filings.apply(c, None) == (c, None)


def test_rules_bar_for_top_management_applies_to_model_reads():
    c = classify("General Updates", "Disclosure under Regulation 30")
    out, _ = filings.apply(c, _rec(category="management_change", summary="Ms X re-appointed as Independent Director",
                                   quote="re-appointment of Ms X as an Independent Director"))
    assert out.tier == MEDIUM
    out, _ = filings.apply(c, _rec(category="management_change", summary="Deputy Managing Director Mr Y to cease",
                                   quote="Deputy Managing Director"))
    assert out.tier == HIGH


def test_model_read_cannot_promote_a_clear_rule():
    c = classify("Bagging/Receiving of orders/contracts", "Acme has informed the Exchange about Bagging/Receiving of orders")
    out, summary = filings.apply(c, _rec(category="M&A", importance="high", summary="Order of 500 crore"))
    assert out == c and summary == "Order of 500 crore"


def test_routine_read_gets_a_routine_group():
    c = classify("Updates", "Please find attached a media statement issued by the Company.")
    out, _ = filings.apply(c, _rec(category="press_release", importance="routine"))
    assert out.tier == ROUTINE and out.reason == "General press releases"


def test_model_may_demote_a_medium_rule_label_but_not_a_high_one():
    capex = classify("Updates", "Acme announces expansion of its Pune campus")
    out, _ = filings.apply(capex, _rec(category="press_release", importance="routine", summary="Opened a campus"))
    assert out.tier == ROUTINE
    order = classify("Corporate Insolvency Resolution Process", "Order passed by NCLAT setting aside the order of NCLT")
    out, _ = filings.apply(order, _rec(category="litigation", importance="routine", summary="An order"))
    assert out.tier == HIGH


def test_results_summary_without_a_number_keeps_the_period_headline():
    c = classify("Outcome of Board Meeting", "Outcome of the Board Meeting held on 28th October, 2026.")
    _, summary = filings.apply(c, _rec(summary="The board approved unaudited financial results"))
    assert summary is None
    _, summary = filings.apply(c, _rec(summary="Board approved results for the quarter ended September 30, 2026"))
    assert summary is None   # a date is not a figure
