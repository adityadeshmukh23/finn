import pytest

from finn import market


def _bars(vols, closes=None):
    closes = closes or [100.0] * len(vols)
    return [[f"2026-10-{i + 1:02d}", c, v] for i, (c, v) in enumerate(zip(closes, vols))]


def test_volume_multiple_excludes_the_day_itself():
    s = market.signals(_bars([100] * 20 + [300]))
    assert s[-1]["avg_volume"] == 100
    assert s[-1]["vol_x"] == 3.0          # 300 / mean of the 20 sessions before it, not 300 / 109.5


def test_baseline_uses_only_the_last_20_sessions():
    s = market.signals(_bars([1000] * 5 + [100] * 20 + [200]))
    assert s[-1]["vol_x"] == 2.0


def test_no_multiple_without_enough_history():
    s = market.signals(_bars([100] * 9 + [500]))
    assert s[-1]["vol_x"] is None         # 9 prior sessions < MIN_HISTORY
    s = market.signals(_bars([100] * 10 + [500]))
    assert s[-1]["vol_x"] == 5.0


def test_zero_baseline_is_not_infinite():
    assert market.signals(_bars([0] * 15 + [100]))[-1]["vol_x"] is None


def test_day_move_is_close_on_previous_close():
    s = market.signals(_bars([1, 1, 1], closes=[200.0, 175.6, 197.07]))
    assert s[0]["chg_pct"] is None
    assert s[1]["chg_pct"] == -12.2
    assert s[2]["chg_pct"] == pytest.approx(12.23, abs=0.01)


def test_compact_keeps_history_for_the_baseline_but_ships_only_the_window():
    bars = _bars([100] * 20 + [250])
    out = market.compact({"ACME": bars}, since="2026-10-21")
    assert out == {"ACME": [["2026-10-21", 100.0, 0.0, 2.5]]}
