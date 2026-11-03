"""The corrections found by checking recorded cards against their PDFs, pinned so a re-record can't bring them back."""
import json

import pytest

from finn import results
from finn.config import settings

RECORDED = {r["symbol"]: r for r in results.load_all().values()}
SHOWN = [r for r in RECORDED.values() if r.get("confidence") in ("high", "medium")]
DEMO = settings.data_dir.parent / "web" / "public" / "demo"


def test_equitas_is_withheld_with_its_page_and_ships_no_figure():
    view = results.card_view(RECORDED["EQUITASBNK"])
    assert view["confidence"] == "low" and view["page"] == 3 and view["url"].endswith("#page=3")
    assert view["rows"]["pat"]["current"] is None and results.headline(view) is None


def test_hul_revenue_is_the_sum_of_its_printed_lines():
    r = RECORDED["HINDUNILVR"]
    assert r["revenue_how"] == "sum of 3 printed lines"
    rev = r["rows"]["revenue"]
    assert (rev["current"], rev["previous"], rev["year_ago"], rev["qoq_pct"], rev["yoy_pct"]) == (18226.0, 17341.0, 15919.0, 5.1, 14.5)


@pytest.mark.parametrize("r", SHOWN, ids=lambda r: r["symbol"])
def test_every_card_with_figures_passes_the_consistency_checks(r):
    assert r["inconsistent"] == []


def test_withheld_figures_are_not_in_any_data_file():
    # Equitas's misread PAT in lakh and crore, and the year-on-year change built on it.
    for f in DEMO.glob("*.json"):
        text = f.read_text()
        assert "183.61" not in text and "660.6" not in text, f.name


def test_bel_fy27_margin_is_not_called_revised():
    rec = json.loads((settings.data_dir / "recordings" / "research" / "BEL.json").read_text())
    row = next(r for r in rec["scorecard"]["rows"] if r["id"] == "PQ4FY26-2")
    assert row["revisions"] == [] and {v["change"] for v in row["later"]} == {"differs"}
