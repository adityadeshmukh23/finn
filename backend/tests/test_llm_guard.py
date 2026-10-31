import dataclasses
import types

import pytest
from pydantic import BaseModel

from finn import db, llm, providers
from finn.config import Slot

FREE = Slot("cheap", "fake", "fake-lite", 0, 0, 0, rpm=0, rpd=0)
PAID = Slot("strong", "fake", "fake-pro", 2.0, 10.0, 0.2, rpm=0, rpd=0)


class Out(BaseModel):
    label: str


class FakeProvider:
    def __init__(self, script=None):
        self.calls, self.script = [], list(script or [])

    def generate(self, model, system, user, schema, max_tokens):
        self.calls.append(model)
        step = self.script.pop(0) if self.script else None
        if isinstance(step, Exception):
            raise step
        return providers.Completion(Out(label="live"), 1000, 200)


@pytest.fixture
def setup(tmp_path, monkeypatch):
    db.reset_for_tests(tmp_path / "t.sqlite")
    llm._minute.clear()
    llm._exhausted_until.clear()

    def configure(cheap=FREE, strong=PAID, script=None, **kw):
        base = dict(public_demo=False, budget_usd_total=5.0, rate_wait_max=0, fallbacks={}) | kw
        s = dataclasses.replace(
            llm.settings, data_dir=tmp_path, llm_mode="auto", provider_keys={"fake": True},
            slots={"cheap": cheap, "strong": strong}, **base,
        )
        monkeypatch.setattr(llm, "settings", s)
        monkeypatch.setattr(llm.M, "settings", s)
        fake = FakeProvider(script)
        monkeypatch.setattr(providers, "get", lambda name: fake)
        monkeypatch.setattr(llm.time, "sleep", lambda s: None)
        return fake
    return configure


def ask(purpose="classify", user="u", client=None):
    return llm.call(purpose, "s", user, Out, mock=lambda: Out(label="mock"), client=client)


def _spend(usd):
    with db.tx() as c:
        c.execute("INSERT INTO ledger(ts, day, purpose, model, source, cost_usd) VALUES (0, date('now'), 'x', 'm', 'live', ?)", (usd,))


def test_no_key_means_mock_and_no_provider_call(setup):
    fake = setup()
    llm.settings.provider_keys["fake"] = False
    r = ask()
    assert (r.source, r.output.label, fake.calls) == ("mock", "mock", [])


def test_free_tier_logs_tokens_at_zero_cost_and_records(setup):
    fake = setup()
    r = ask()
    assert r.source == "live" and r.cost_usd == 0
    row = db.conn().execute("SELECT model, input_tokens, output_tokens, cost_usd FROM ledger WHERE source='live'").fetchone()
    assert tuple(row) == ("fake:fake-lite", 1000, 200, 0)
    assert ask().source == "recorded" and len(fake.calls) == 1     # replayed from file


def test_paid_slot_is_costed(setup):
    setup()
    assert ask("verdict").cost_usd == pytest.approx((1000 * 2.0 + 200 * 10.0) / 1e6)


def test_budget_cap_blocks_paid_slot(setup):
    fake = setup()
    _spend(4.9999)
    r = llm.call("verdict", "s" * 3000, "u", Out, mock=lambda: Out(label="mock"))
    assert r.source == "blocked" and "Budget cap" in r.note and fake.calls == []


def test_requests_per_day_limit(setup):
    fake = setup(cheap=dataclasses.replace(FREE, rpd=2))
    assert [ask(user=f"u{i}").source for i in range(3)] == ["live", "live", "blocked"]
    assert len(fake.calls) == 2


def test_requests_per_minute_limit_without_waiting(setup):
    setup(cheap=dataclasses.replace(FREE, rpm=2))
    r = [ask(user=f"u{i}") for i in range(3)]
    assert [x.source for x in r] == ["live", "live", "blocked"] and "requests/minute" in r[2].note


def test_provider_429_retries_once_after_delay(setup):
    fake = setup(script=[providers.RateLimited(1.0, daily=False)], rate_wait_max=30)
    assert ask().source == "live" and len(fake.calls) == 2


def test_provider_daily_quota_blocks_until_reset(setup):
    fake = setup(script=[providers.RateLimited(None, daily=True)])
    r = ask()
    assert r.source == "blocked" and "daily" in r.note
    assert ask(user="other").source == "blocked" and len(fake.calls) == 1   # no further calls today


def test_public_demo_per_client_limit(setup):
    setup(public_demo=True, per_ip_daily_calls=2)
    assert [ask(user=f"u{i}", client="ip1").source for i in range(3)] == ["live", "live", "blocked"]
    assert ask(user="x", client="ip2").source == "live"


def test_gemini_429_parsing():
    err = types.SimpleNamespace(message="quota", response_json={"error": {"details": [
        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "34s"},
        {"@type": "type.googleapis.com/google.rpc.QuotaFailure",
         "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
    ]}})
    rl = providers._gemini_rate_limit(err)
    assert rl.retry_after == 34.0 and rl.daily is True


def test_public_demo_daily_cap_across_clients(setup):
    fake = setup(public_demo=True, daily_live_calls=2, per_ip_daily_calls=10)
    r = [ask(user=f"u{i}", client=f"ip{i}") for i in range(3)]
    assert [x.source for x in r] == ["live", "live", "blocked"] and "public demo" in r[2].note
    assert len(fake.calls) == 2


@pytest.mark.parametrize("env,expected", [
    ({"PUBLIC_DEMO": "true"}, "mock"),                       # hosted demo: a key alone never goes live
    ({"PUBLIC_DEMO": "true", "LLM_MODE": "auto"}, "auto"),   # explicit opt-in
    ({}, "auto"),                                            # local dev
])
def test_default_llm_mode(monkeypatch, env, expected):
    from finn import config
    for k in ("PUBLIC_DEMO", "LLM_MODE"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    assert config.default_llm_mode() == expected


# ---- fallback chain -------------------------------------------------------------------------

BACKUP = dataclasses.replace(PAID, model="fake-backup")


def test_overloaded_strong_model_falls_back_and_recording_names_the_model(setup, tmp_path):
    fake = setup(script=[providers.ProviderError("Gemini 503: high demand")], fallbacks={"strong": (BACKUP,)})
    r = ask("verdict")
    assert (r.source, r.model) == ("live", "fake:fake-backup")
    assert r.fallbacks == [{"model": "fake:fake-pro", "why": "Gemini 503: high demand"}]
    assert fake.calls == ["fake-pro", "fake-backup"]
    import json
    rec = json.loads(next((tmp_path / "recordings" / "llm" / "verdict").glob("*.json")).read_text())
    assert rec["_meta"]["model"] == "fake:fake-backup"
    assert rec["_meta"]["fell_back_from"][0]["model"] == "fake:fake-pro"

    again = ask("verdict")          # replay: no provider call, same model and fallback story
    assert (again.source, again.model, again.output.label) == ("recorded", "fake:fake-backup", "live")
    assert again.fallbacks == r.fallbacks
    assert fake.calls == ["fake-pro", "fake-backup"]


def test_whole_chain_down_is_blocked_and_records_nothing(setup, tmp_path):
    setup(script=[providers.ProviderError("503"), providers.ProviderError("504")], fallbacks={"strong": (BACKUP,)})
    r = ask("verdict")
    assert r.source == "blocked" and r.output.label == "mock"
    assert [f["model"] for f in r.fallbacks] == ["fake:fake-pro", "fake:fake-backup"]
    assert not (tmp_path / "recordings" / "llm" / "verdict").exists()


def test_unusable_output_hands_over_to_the_next_model(setup, monkeypatch):
    fake = setup(fallbacks={"strong": (BACKUP,)})
    real = fake.generate
    def gen(model, *a):
        if model == "fake-pro":
            fake.calls.append(model)
            return providers.Completion(None, 1000, 16000, note="Model output did not match the schema")
        return real(model, *a)
    monkeypatch.setattr(fake, "generate", gen)
    r = ask("verdict")
    assert (r.source, r.model) == ("live", "fake:fake-backup")
    assert r.fallbacks == [{"model": "fake:fake-pro", "why": "Model output did not match the schema"}]


def test_gemini_daily_quota_429_is_read_from_the_error_details():
    class E:   # google-genai's ClientError carries the body as .details (no .response_json)
        message = "quota"
        details = {"error": {"details": [
            {"@type": "type.googleapis.com/google.rpc.QuotaFailure",
             "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
            {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "28219s"}]}}
    rl = providers._gemini_rate_limit(E())
    assert rl.daily and rl.retry_after == 28219
