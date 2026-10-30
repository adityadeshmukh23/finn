"""The single gate every LLM call goes through.

Order: recorded output (by input hash) -> mock when offline -> budget/rate guards -> live call.
Recorded outputs are files under data/recordings/llm/ and are committed, so the deployed demo
and keyless runs replay real outputs instead of calling the API.
"""
import hashlib
import json
import time
from dataclasses import dataclass
from datetime import date
from typing import Callable, TypeVar

from pydantic import BaseModel

from . import db
from . import models as M
from .config import settings

T = TypeVar("T", bound=BaseModel)


@dataclass
class LLMResult:
    output: BaseModel | None
    source: str          # recorded | mock | live | blocked
    cost_usd: float = 0.0
    note: str = ""


def _key(purpose: str, model_id: str, system: str, user: str, schema: type[BaseModel]) -> str:
    h = hashlib.sha256(json.dumps([purpose, model_id, system, user, schema.__name__]).encode()).hexdigest()
    return h[:24]


def _recording_path(purpose: str, key: str):
    return settings.data_dir / "recordings" / "llm" / purpose / f"{key}.json"


def _log(purpose, model_id, source, client, it=0, ot=0, ct=0, cost=0.0):
    with db.tx() as c:
        c.execute(
            "INSERT INTO ledger(ts, day, purpose, model, source, input_tokens, output_tokens,"
            " cache_read_tokens, cost_usd, client) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (time.time(), date.today().isoformat(), purpose, model_id, source, it, ot, ct, cost, client),
        )


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


def call(
    purpose: str,
    system: str,
    user: str,
    schema: type[T],
    mock: Callable[[], T | None],
    client: str | None = None,
    max_tokens: int = 2000,
) -> LLMResult:
    model = M.model_for(purpose)
    key = _key(purpose, model["id"], system, user, schema)
    path = _recording_path(purpose, key)
    if path.exists():
        _log(purpose, model["id"], "recorded", client)
        return LLMResult(schema.model_validate_json(path.read_text()), "recorded")

    if not settings.llm_live:
        _log(purpose, model["id"], "mock", client)
        return LLMResult(mock(), "mock", note="Mock mode: no API key or LLM_MODE=mock")

    estimate = M.cost_usd(model, (len(system) + len(user)) // 3, max_tokens)
    reason = guard(estimate, client)
    if reason:
        _log(purpose, model["id"], "blocked", client)
        return LLMResult(mock(), "blocked", note=reason)

    import anthropic  # imported lazily so mock mode needs no SDK configuration

    resp = anthropic.Anthropic().messages.parse(
        model=model["id"],
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_format=schema,
    )
    u = resp.usage
    cost = M.cost_usd(model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens or 0)
    _log(purpose, model["id"], "live", client, u.input_tokens, u.output_tokens, u.cache_read_input_tokens or 0, cost)
    out = resp.parsed_output
    if out is None:
        return LLMResult(None, "live", cost, note=f"No parsed output (stop_reason={resp.stop_reason})")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(out.model_dump_json(indent=1))
    return LLMResult(out, "live", cost)


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
    return {
        "spent_usd": round(spent_total(), 4),
        "budget_usd": settings.budget_usd_total,
        "today": {"live_calls": n_today, "usd": round(usd_today, 4)},
        "by_source": by_source,
        "by_purpose": by_purpose,
        "mode": "live" if settings.llm_live else "mock",
        "public_demo": settings.public_demo,
    }
