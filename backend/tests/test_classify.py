import pytest

from finn.classify import HIGH, MEDIUM, ROUTINE, classify

# (NSE category, one-line text, expected category, expected tier). Texts are shaped like real
# NSE summaries but use made-up names.
CASES = [
    ("Resignation", "Acme Ltd has informed the Exchange regarding Resignation of Mr. A B as Managing Director & CEO",
     "management_change", HIGH),
    ("Appointment", "Appointment of Ms X Y as Chief Financial Officer of the company w.e.f. October 31, 2026",
     "management_change", HIGH),
    ("Change in Director(s)", "Appointment of Mr P Q as Independent Director", "management_change", MEDIUM),
    ("Updates", "Acme Ltd has informed the Exchange regarding 'Unaudited Financial results for the quarter ended 30.09.2026'",
     "results", HIGH),
    ("Outcome of Board Meeting", "The Board approved the unaudited financial results for the quarter ended September 30, 2026",
     "results", HIGH),
    ("Press Release", 'A press release titled "Acme: Q2FY27 revenue up 12% YoY"', "results", MEDIUM),
    ("Investor Presentation", "Acme Ltd has informed the Exchange about Investor Presentation", "results", MEDIUM),
    ("Updates", "Earnings Call Transcript", "earnings_call", MEDIUM),
    ("General Updates", "Audio Recording of the investors' call held on 27th October 2026", "earnings_call", ROUTINE),
    ("General Updates", "Initial Public Offer of Acme Platforms Limited", "M&A", HIGH),
    ("Acquisition", "Board approved incorporation of a wholly owned subsidiary", "M&A", ROUTINE),
    ("Corporate Insolvency Resolution Process", "Order passed by NCLAT setting aside the order of NCLT", "litigation", HIGH),
    ("Credit Rating", "CRISIL has downgraded the long-term rating", "credit_rating", HIGH),
    ("Credit Rating", "Acme Ltd has informed the Exchange about Credit Rating", "credit_rating", ROUTINE),
    ("Copy of Newspaper Publication", "Extract of unaudited financial results for the quarter", "unclassified", ROUTINE),
    ("ESOP/ESOS/ESPS", "Allotment of 4675598 Shares", "unclassified", ROUTINE),
    ("Allotment of Securities", "allotment of 2,06,950 securities pursuant to Non Convertible Securities", "fund_raise", ROUTINE),
    ("Record Date", "Record date for the purpose of Dividend is 06-Nov-2026", "dividend", ROUTINE),
    ("Bagging/Receiving of orders/contracts", "Acme Ltd has informed the Exchange about Bagging/Receiving of orders",
     "press_release", MEDIUM),
    ("General Updates", "Disclosure under Regulation 30 of SEBI (LODR) Regulations, 2015", "unclassified", ROUTINE),
    ("General Updates", "Disclosure under Regulation 30 of SEBI (LODR) Regulations, 2015 - Change in Managing Director",
     "management_change", HIGH),
]


@pytest.mark.parametrize("desc,text,category,tier", CASES)
def test_classify(desc, text, category, tier):
    c = classify(desc, text)
    assert (c.category, c.tier) == (category, tier), c.reason


def test_unlabelled_filings_are_named_honestly():
    c = classify("General Updates", "General Updates")
    assert c.reason.startswith("Reg. 30 disclosures")
