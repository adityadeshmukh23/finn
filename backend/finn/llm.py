"""The single gate every LLM call goes through, whatever the provider.

Order: recorded output (by input hash) -> mock when the slot has no key -> budget, public-demo
and free-tier rate guards -> live call through providers.get(slot.provider).
Recorded outputs are files under data/recordings/llm/ and are committed, so the deployed demo
and keyless runs replay real outputs instead of calling the API.
"""
import hashlib
import json
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Callable, TypeVar
from zoneinfo import ZoneInfo

from pydantic import BaseModel

from . import db, providers
from . import models as M
from .config import Slot, settings

T = TypeVar("T", bound=BaseModel)
PACIFIC = ZoneInfo("America/Los_Angeles")   # Gemini daily quotas reset at midnight Pacific


@dataclass
class LLMResult:
    output: BaseModel | None
    source: str          # recorded | mock | live | blocked
    cost_usd: float = 0.0
    note: str = ""


def _key(purpose: str, slot: Slot, system: str, user: str, schema: type[BaseModel]) -> str:
    raw = json.dumps([purpose, slot.provider, slot.model, system, user, schema.__name__])
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _recording_path(purpose: str, key: str):
    return settings.data_dir / "recordings" / "llm" / purpose / f"{key}.json"


def _model_label(slot: Slot) -> str:
    return f"{slot.provider}:{slot.model}"


def _log(purpose, slot: Slot, source, client, it=0, ot=0, ct=0, cost=0.0):
    with db.tx() as c:
        c.execute(
            "INSERT INTO ledger(ts, day, purpose, model, source, input_tokens, output_tokens,"
            " cache_read_tokens, cost_usd, client) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (time.time(), date.today().isoformat(), purpose, _model_label(slot), source, it, ot, ct, cost, client),
        )


# ---- spend guards -------------------------------------------------------------------------

def spent_total() -> float:
    return db.conn().execute("SELECT COALESCE(SUM(cost_usd),0) FROM ledger WHERE source='live'").fetchone()[0]


def _today(client: str | None = None) -> tuple[int, float]:
    q = "SELECT COUNT(*), COALESCE(SUM(cost_usd),0) FROM ledger WHERE source='live' AND day=?"
    args: list = [date.today().isoformat()]
    if client:
        q += " AND client=?"
        args.append(client)
    n, usd = db.conn().execute(q, args).fetchone()
    return n, usd


def guard(estimate_usd: float, client: str | None) -> str | None:
    """Return a reason string if a live call must not happen, else None."""
    if spent_total() + estimate_usd > settings.budget_usd_total:
        return f"Budget cap of ${settings.budget_usd_total:.2f} reached"
    if settings.public_demo:
        n, usd = _today()
        if n >= settings.daily_live_calls or usd + estimate_usd > settings.daily_usd_cap:
            return "Today's live-analysis limit for the public demo is used up"
        if client and _today(client)[0] >= settings.per_ip_daily_calls:
            return "You've used today's live analyses on this demo"
    return None


# ---- free-tier rate limiter ---------------------------------------------------------------

_minute: dict[str, deque] = {}            # model label -> timestamps of calls in the last 60s
_exhausted_until: dict[str, float] = {}   # model label -> epoch when the provider's daily cap resets
_rate_lock = threading.Lock()


def _pacific_midnight(next_one: bool = False) -> float:
    now = datetime.now(PACIFIC)
    m = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return (m + timedelta(days=1) if next_one else m).timestamp()


def calls_today(slot: Slot) -> int:
    """Live calls to this slot's model since midnight Pacific (the provider's quota day)."""
    return db.conn().execute(
        "SELECT COUNT(*) FROM ledger WHERE source='live' AND model=? AND ts>=?",
        (_model_label(slot), _pacific_midnight()),
    ).fetchone()[0]


def acquire(slot: Slot, max_wait: float) -> str | None:
    """Reserve a request under the slot's RPM/RPD. Waits up to max_wait for a minute slot.
    Returns a reason string if the call can't go ahead."""
    label = _model_label(slot)
    if _exhausted_until.get(label, 0) > time.time():
        return f"{slot.model} free-tier daily quota used up (resets midnight Pacific)"
    if slot.rpd and calls_today(slot) >= slot.rpd:
        return f"{slot.model} reached its {slot.rpd}/day limit (resets midnight Pacific)"
    if not slot.rpm:
        return None
    deadline = time.time() + max_wait
    while True:
        with _rate_lock:
            q = _minute.setdefault(label, deque())
            now = time.time()
            while q and now - q[0] >= 60:
                q.popleft()
            if len(q) < slot.rpm:
                q.append(now)
                return None
            wait = 60 - (now - q[0]) + 0.05
        if time.time() + wait > deadline:
            return f"{slot.model} is at {slot.rpm} requests/minute; try again shortly"
        time.sleep(wait)


# ---- the gate -----------------------------------------------------------------------------

def call(
    purpose: str,
    system: str,
    user: str,
    schema: type[T],
    mock: Callable[[], T | None],
    client: str | None = None,
    max_tokens: int = 2000,
    max_wait: float | None = None,
) -> LLMResult:
    slot = M.slot_for(purpose)
    key = _key(purpose, slot, system, user, schema)
    path = _recording_path(purpose, key)
    if path.exists():
        _log(purpose, slot, "recorded", client)
        return LLMResult(schema.model_validate_json(path.read_text()), "recorded")

    if not settings.live(slot):
        _log(purpose, slot, "mock", client)
        return LLMResult(mock(), "mock", note=f"Mock mode: no {slot.provider} key or LLM_MODE=mock")

    estimate = M.cost_usd(slot, (len(system) + len(user)) // 3, max_tokens)
    reason = guard(estimate, client) or acquire(slot, settings.rate_wait_max if max_wait is None else max_wait)
    if reason:
        _log(purpose, slot, "blocked", client)
        return LLMResult(mock(), "blocked", note=reason)

    provider = providers.get(slot.provider)
    for attempt in (1, 2):
        try:
            comp = provider.generate(slot.model, system, user, schema, max_tokens)
            break
        except providers.RateLimited as e:
            if e.daily:
                _exhausted_until[_model_label(slot)] = _pacific_midnight(next_one=True)
            if e.daily or attempt == 2 or (e.retry_after or 0) > settings.rate_wait_max:
                _log(purpose, slot, "blocked", client)
                why = "daily free-tier quota used up" if e.daily else "rate limited by the provider"
                return LLMResult(mock(), "blocked", note=f"{slot.model}: {why}")
            time.sleep(e.retry_after or 5)
        except providers.ProviderError as e:
            _log(purpose, slot, "blocked", client)
            return LLMResult(mock(), "blocked", note=str(e))

    cost = M.cost_usd(slot, comp.input_tokens, comp.output_tokens, comp.cache_read_tokens)
    _log(purpose, slot, "live", client, comp.input_tokens, comp.output_tokens, comp.cache_read_tokens, cost)
    if comp.parsed is None:
        return LLMResult(None, "live", cost, note=comp.note)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(comp.parsed.model_dump_json(indent=1))
    return LLMResult(comp.parsed, "live", cost)


def ledger_summary() -> dict:
    c = db.conn()
    by_source = {
        r["source"]: {"calls": r["n"], "usd": round(r["usd"], 4)}
        for r in c.execute("SELECT source, COUNT(*) n, COALESCE(SUM(cost_usd),0) usd FROM ledger GROUP BY source")
    }
    by_purpose = [
        dict(r)
        for r in c.execute(
            "SELECT purpose, model, COUNT(*) calls, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,"
            " ROUND(SUM(cost_usd), 4) usd FROM ledger WHERE source='live' GROUP BY purpose, model"
        )
    ]
    n_today, usd_today = _today()
    slots = [
        {
            "slot": s.name, "provider": s.provider, "model": s.model, "live": settings.live(s),
            "free": s.price_in == 0 and s.price_out == 0,
            "calls_today": calls_today(s), "rpd": s.rpd, "rpm": s.rpm,
        }
        for s in settings.slots.values()
    ]
    return {
        "spent_usd": round(spent_total(), 4),
        "budget_usd": settings.budget_usd_total,
        "today": {"live_calls": n_today, "usd": round(usd_today, 4)},
        "by_source": by_source,
        "by_purpose": by_purpose,
        "slots": slots,
        "mode": "live" if settings.any_live else "mock",
        "public_demo": settings.public_demo,
    }
