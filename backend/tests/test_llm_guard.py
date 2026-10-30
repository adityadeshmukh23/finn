import dataclasses
import sys
import types

import pytest
from pydantic import BaseModel

from finn import db, llm


class Out(BaseModel):
    label: str


@pytest.fixture(autouse=True)
def fresh(tmp_path, monkeypatch):
    db.reset_for_tests(tmp_path / "t.sqlite")
    s = dataclasses.replace(llm.settings, data_dir=tmp_path, llm_mode="auto", has_api_key=True,
                            public_demo=False, budget_usd_total=5.0)
    monkeypatch.setattr(llm, "settings", s)
    yield


def _fake_sdk(monkeypatch, calls):
    class Usage:
        input_tokens, output_tokens, cache_read_input_tokens = 1000, 200, 0

    class Resp:
        usage, parsed_output, stop_reason = Usage(), Out(label="live"), "end_turn"

    class Messages:
        def parse(self, **kw):
            calls.append(kw)
            return Resp()

    mod = types.SimpleNamespace(Anthropic=lambda: types.SimpleNamespace(messages=Messages()))
    monkeypatch.setitem(sys.modules, "anthropic", mod)


def _spend(usd):
    with db.tx() as c:
        c.execute("INSERT INTO ledger(ts, day, purpose, model, source, cost_usd) VALUES (0, date('now'), 'x', 'm', 'live', ?)", (usd,))


def test_mock_mode_never_calls_sdk(monkeypatch):
    monkeypatch.setattr(llm, "settings", dataclasses.replace(llm.settings, has_api_key=False))
    r = llm.call("classify", "s", "u", Out, mock=lambda: Out(label="mock"))
    assert (r.source, r.output.label) == ("mock", "mock")


def test_live_call_is_logged_costed_and_recorded(monkeypatch):
    calls = []
    _fake_sdk(monkeypatch, calls)
    r = llm.call("classify", "s", "u", Out, mock=lambda: Out(label="mock"))
    assert r.source == "live" and len(calls) == 1
    assert r.cost_usd == pytest.approx((1000 * 0.10 + 200 * 0.50) / 1e6)
    again = llm.call("classify", "s", "u", Out, mock=lambda: Out(label="mock"))
    assert again.source == "recorded" and len(calls) == 1      # replayed from file, no second call
    assert llm.ledger_summary()["by_source"]["recorded"]["calls"] == 1


def test_budget_cap_falls_back_to_mock(monkeypatch):
    calls = []
    _fake_sdk(monkeypatch, calls)
    _spend(4.9999)
    r = llm.call("verdict", "s" * 3000, "u", Out, mock=lambda: Out(label="mock"))
    assert r.source == "blocked" and "Budget cap" in r.note and calls == []


def test_public_demo_per_client_limit(monkeypatch):
    calls = []
    _fake_sdk(monkeypatch, calls)
    monkeypatch.setattr(llm, "settings", dataclasses.replace(llm.settings, public_demo=True, per_ip_daily_calls=2))
    sources = [llm.call("classify", "s", f"u{i}", Out, mock=lambda: Out(label="m"), client="ip1").source for i in range(3)]
    assert sources == ["live", "live", "blocked"]
    assert llm.call("classify", "s", "other", Out, mock=lambda: Out(label="m"), client="ip2").source == "live"


def test_public_demo_daily_dollar_cap(monkeypatch):
    calls = []
    _fake_sdk(monkeypatch, calls)
    monkeypatch.setattr(llm, "settings", dataclasses.replace(llm.settings, public_demo=True, daily_usd_cap=0.25))
    _spend(0.2499)
    assert llm.call("verdict", "s" * 3000, "u", Out, mock=lambda: Out(label="m"), client="ip").source == "blocked"
