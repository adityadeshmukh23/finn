import json
import re

import pytest

from finn.config import REPO_ROOT
from finn.research import pvd, walk

SYMBOLS = [c["symbol"] for c in pvd.catalog()]
WALKS = walk.build(SYMBOLS)
BY_ROW = {(w["symbol"], w["row"]): w for w in WALKS}

# (group, steps as low bound, delivered, vs first, vs last). The approved figures: a change here changes what the demo says.
EXPECTED = {
    ("KAYNES", "PQ1FY26-1"): ("revised_delivered", [4500, 4000], 3626.35, ("share", 80.5856), ("share", 90.6587)),
    ("BEL", "PQ1FY26-2"): ("held_delivered", [27, 27, 27], 29.2, ("points", 2.2), ("points", 2.2)),
    ("BEL", "PQ1FY26-1"): ("held_delivered", [15, 15, 15], 16.2, ("points", 1.2), ("points", 1.2)),
    ("BEL", "PQ1FY26-3"): ("held_delivered", [27000, 27000, 27000], 30045, ("share", 111.2778), ("share", 111.2778)),
    ("BEL", "PQ1FY26-5"): ("held_delivered", [1000, 1000, 1000], 900, ("share", 90.0), ("share", 90.0)),
    ("COFORGE", "PQ2FY26-8"): ("held_delivered", [14, 14], 14.4, ("points", 0.4), ("points", 0.4)),
    ("COFORGE", "PQ4FY26-3"): ("revised_open", [15.5, 15.5, 16], None, None, None),
    ("DIXON", "PQ3FY26-4"): ("revised_open", [3500, 4000], None, None, None),
    ("DIXON", "PQ4FY26-13"): ("revised_open", [7500, 6700], None, None, None),
}


def test_exactly_the_nine_usable_walks_with_their_figures():
    assert set(BY_ROW) == set(EXPECTED)
    for key, (group, lows, delivered, first, last) in EXPECTED.items():
        w = BY_ROW[key]
        assert w["group"] == group, key
        assert [s["low"] for s in w["steps"]] == lows, key
        assert (w["delivered"] or {}).get("value") == delivered, key
        assert (w["vs_first"] and (w["vs_first"]["kind"], w["vs_first"]["value"])) == first, key
        assert (w["vs_last"] and (w["vs_last"]["kind"], w["vs_last"]["value"])) == last, key


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_every_quote_and_figure_reverifies_against_the_committed_page_text(symbol):
    cited = walk.cited_pages(symbol)
    for w in (w for w in WALKS if w["symbol"] == symbol):
        assert walk.reverify(w, cited) == []


def test_the_web_build_ships_what_the_recordings_give():
    assert json.loads((REPO_ROOT / "web/public/demo/walks.json").read_text()) == json.loads(json.dumps(WALKS))


def test_a_row_keeps_its_verdict_against_the_first_promise():
    for key, w in BY_ROW.items():
        row = next(r for r in pvd.load(key[0])["scorecard"]["rows"] if r["id"] == key[1])
        assert w["verdict"] == row["verdict"]
        assert row["promised"]["quote"] == w["steps"][0]["quote"]


@pytest.mark.parametrize("key, why", [
    (("BEL", "PQ4FY26-2"), "two statements on one call differ"),
    (("COFORGE", "PQ2FY26-9"), "a different figure with no period"),
    (("ASIANPAINT", "PQ1FY26-1"), "restated, never with a year"),
    (("BEL", "PQ1FY26-4"), "no delivered figure and never revised"),
    (("COFORGE", "PQ3FY26-4"), "worded promise with another row's quote"),
    (("DIXON", "PQ1FY26-10"), "a milestone, no figure"),
])
def test_excluded_rows_stay_out(key, why):
    assert key not in BY_ROW, why


def test_speakers_are_the_company_s_own():
    assert {s["speaker"] for w in WALKS for s in w["steps"]} == {"Jairam Sampath", "Manoj Jain", "Damodar Bhattad", "Sudhir Singh", "Saurabh Goel", "Atul Lall"}
    assert not re.search(r"\benam\b", (REPO_ROOT / "web/public/demo/walks.json").read_text(), re.I)


def test_a_step_is_held_or_revised_with_no_direction_word():
    assert {s["change"] for w in WALKS for s in w["steps"]} == {"first", "held", "revised"}


def test_a_relabelled_row_says_so_in_its_own_quotes():
    assert "other than QRSAM" in BY_ROW["BEL", "PQ1FY26-3"]["steps"][1]["quote"]
    assert any("14% EBIT guidance for FY2026" in s["quote"] for s in BY_ROW["COFORGE", "PQ2FY26-8"]["steps"])


KAYNES_Q3 = "So, in terms of revenue, I think last quarter is going to be a busy quarter for us, and including the last quarter for FY '26, we'll cross about INR4,000 crores minimum and mainly driven by EMS revenues."


def test_a_figure_is_recovered_from_a_quote_only_when_it_can_be_only_one_thing():
    assert walk.recover_figure(KAYNES_Q3, "crore", "FY26") == 4000
    assert walk.recover_figure(KAYNES_Q3, "crore", "FY27") is None     # names another period
    assert walk.recover_figure(KAYNES_Q3, "%", "FY26") is None         # no figure in this unit
    assert walk.recover_figure("For FY '26 we see INR4,000 crores to INR4,200 crores of revenue", "crore", "FY26") is None
    assert walk.recover_figure("We will cross about INR4,000 crores minimum this time around", "crore", "FY26") is None


@pytest.mark.parametrize("value, quote, floor, about", [
    (27, "So, we maintain the EBITDA margin of 27% only for the current financial year.", False, False),
    (27, "Revenue growth more than 15%, EBITDA margin more than 27%, order inflow of INR27,000-plus crores excluding QRFM.", True, False),
    (27000, "Revenue growth more than 15%, EBITDA margin more than 27%, order inflow of INR27,000-plus crores excluding QRFM.", True, False),
    (15, "revenue growth, we are going to have 15% plus EBITDA margin, definitely 27%.", True, False),
    (15.5, "15.5% on a consolidated basis, which includes Encora.", False, False),
    (15.5, "EBIT margins are expected to be in the range of 16.5 to 17% on a standalone basis, and 15.5% or higher on a consolidated basis.", True, False),
    (16, "We are pleased to raise our consolidated EBIT margin guidance for fiscal year 2027 to 16%, from the 15.5% we had shared", False, False),
    (4000, KAYNES_Q3, True, True),
    (1000, "at least INR 1,600 plus definitely we are going to be there, CAPEX INR 1,000 crore and defense non-defense business of 90 to 10.", False, False),
    (14, "once we hit 14% EBIT, if we manage to hit it this year, we will plan to at a minimum clip along at 14% EBIT", True, False),
])
def test_plus_and_about_come_from_the_words_beside_the_figure(value, quote, floor, about):
    assert walk.qualifier(value, quote) == {"floor": floor, "about": about}


def test_a_step_says_over_only_where_the_words_earn_it():
    assert [s["over"] for s in BY_ROW["DIXON", "PQ3FY26-4"]["steps"]] == [False, True]         # "more than INR4,000 crores", revised
    assert not any(s["over"] for s in BY_ROW["BEL", "PQ1FY26-1"]["steps"])                     # "more than 15%", held
    assert not any(s["over"] for s in BY_ROW["COFORGE", "PQ2FY26-8"]["steps"])                 # "over any further EBIT improvement" isn't about the 14%
    assert walk.says_over(4000, "our revenue is going to be over INR4,000 crores", revised=False)
    assert not walk.says_over(4000, "our revenue is going to be more than INR4,000 crores", revised=False)


def test_a_ceiling_or_a_dollar_target_is_not_a_walk_yet():
    assert walk.parse_target("under 5%") is None
    assert walk.parse_target("about $1 bn") is None
    assert walk.parse_target("₹3,500 cr–₹4,000 cr") == {"low": 3500, "high": 4000, "unit": "crore"}
    assert walk.parse_target("20.5%–21%") == {"low": 20.5, "high": 21, "unit": "%"}
