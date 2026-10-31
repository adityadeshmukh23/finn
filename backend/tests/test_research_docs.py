"""Document index rules: which screener rows are earnings calls, and which quarter each one reports.
Snippets are copied from real transcripts (BEL, Kaynes, Asian Paints, Coforge, Persistent)."""
import pytest

from finn.research.docs import Period, parse_documents, transcript_kind, transcript_period

SCREENER = """
<div class="documents annual-reports flex-column"><h3>Annual reports</h3><ul class="list-links">
  <li><a href="https://www.bseindia.com/xml-data/corpfiling/AttachHis/fe75.pdf"
         class="plausible-event-name=Annual+Report" target="_blank">Annual Report 2026</a>
      <button data-url="/annual-reports/1/summary/">AI Summary</button></li>
  <li><a href="https://www.bseindia.com/x/7387.pdf" target="_blank">Annual Report 2025</a></li>
</ul></div>
<div class="documents credit-ratings flex-column"><a href="https://icra.in/r.pdf">Rating update</a></div>
<div class="documents concalls flex-column"><ul class="list-links">
  <li class="flex"><div class="ink-600 nowrap" style="width: 74px">Jul 2026</div>
    <a class="button-chip" href="https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=d2a7.pdf&amp;x=1"
       target="_blank" rel="noopener noreferrer" title="Raw Transcript">Transcript</a>
    <button data-url="/concalls/summary/1/">AI Summary</button><div class="button-chip">PPT</div></li>
  <li class="flex"><div class="ink-600 nowrap" style="width: 74px">Oct 2026</div>
    <div class="button-chip">PPT</div></li>
</ul></div>
"""


def test_parse_documents_reads_links_only():
    d = parse_documents(SCREENER)
    assert d["annual_reports"] == [
        {"year": 2026, "url": "https://www.bseindia.com/xml-data/corpfiling/AttachHis/fe75.pdf"},
        {"year": 2025, "url": "https://www.bseindia.com/x/7387.pdf"},
    ]
    assert d["concalls"] == [
        {"month": "Jul 2026", "transcript": "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=d2a7.pdf&x=1"},
        {"month": "Oct 2026", "transcript": None},
    ]


@pytest.mark.parametrize("text,label", [
    ("performance of the Company for the quarter ended 30 th June , 2026 . The transcript", "Q1 FY27"),
    ("results for the quarter and nine months ended December 31, 2025", "Q3 FY26"),
    ("for the fourth quarter and year ended 31st March 2026", "Q4 FY26"),
    ("Subject: Intimation of Earnings call transcript of Q1 FY2026-27 Pursuant to", "Q1 FY27"),
    ("Earnings call transcript for Q4 FY 2024 - 2025 Pursuant to Regulation 30", "Q4 FY25"),
    ("Welcome to the Q2 FY '26 earnings conference call of Bharat Electronics", "Q2 FY26"),
    ("Q4 and 12M FY2026 Earnings Conference Call Transcript", "Q4 FY26"),
    ("results for the fourth quarter of FY26 ended", "Q4 FY26"),
])
def test_transcript_period(text, label):
    assert transcript_period([text]).label == label


def test_stated_quarter_end_beats_a_label():
    # Kaynes labels read "Q1 FY2026" in places; the quarter-end date is unambiguous.
    assert transcript_period(["Q1 FY2026 call ... for the quarter ended 30th June 2026"]).label == "Q1 FY27"


def test_kind_business_update_and_acquisition_calls_are_not_earnings():
    assert transcript_kind(["Subject: Business Update Conference call transcript of December 08, 2025."]) == "other"
    assert transcript_kind(["Coforge Limited Conference Call with Analysts and Institutional Investors "
                            "December 26, 2025 on the proposed acquisition"]) == "other"


def test_kind_agm_job_title_is_not_an_agm():
    page = ("Q1 FY2027 Earnings Conference Call Transcript Management: Mr. Lakshya Sharma : AGM – Finance "
            "with regards to the financial results of the Company for the quarter ended 30th June 2026")
    assert transcript_kind([page]) == "earnings"


def test_kind_needs_a_period():
    assert transcript_kind(["Transcript of the conference call held on July 3, 2026"]) == "other"


def test_period_parse_and_order():
    assert Period.parse("Q3 FY26") == Period(26, 3)
    assert Period.parse("FY2027") == Period(27, 0)
    assert Period.parse("next year") is None
    assert Period(26, 4).end < Period(27, 0).end
    assert Period(26, 0).end == Period(26, 4).end
