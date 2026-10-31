"""LLM providers behind one interface. Each takes (model, system, user, schema) and returns a
validated pydantic object plus token usage. Provider SDKs are imported lazily, so mock mode and
an unused provider need nothing installed or configured.
"""
import os
import re
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel


@dataclass
class Completion:
    parsed: BaseModel | None
    input_tokens: int
    output_tokens: int          # includes any thinking tokens the provider bills as output
    cache_read_tokens: int = 0
    note: str = ""


class RateLimited(Exception):
    """Provider said slow down. `daily` means the day's quota is gone until the reset."""

    def __init__(self, retry_after: float | None, daily: bool, detail: str = ""):
        super().__init__(detail)
        self.retry_after, self.daily = retry_after, daily


class ProviderError(Exception):
    pass


class Provider(Protocol):
    def generate(self, model: str, system: str, user: str, schema: type[BaseModel], max_tokens: int) -> Completion: ...


class GeminiProvider:
    def __init__(self):
        from google import genai
        from google.genai import types

        from .config import settings
        self._timeout = settings.request_timeout
        # The SDK retries 5 times by default, 429s included, which hides RetryInfo from the gate and
        # turned a 503 "high demand" into a 279s call. Retry fast server errors once; a 504 (deadline
        # already spent) and 429s go straight back to llm.call.
        self._client = genai.Client(
            api_key=os.environ["GEMINI_API_KEY"],
            http_options=types.HttpOptions(
                timeout=int(self._timeout * 1000),
                retry_options=types.HttpRetryOptions(
                    attempts=1 + settings.retries, initial_delay=2, max_delay=8, http_status_codes=[500, 502, 503],
                ),
            ),
        )

    def generate(self, model, system, user, schema, max_tokens):
        import httpx
        from google.genai import errors, types

        try:
            r = self._client.models.generate_content(
                model=model,
                contents=user,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    response_schema=schema,
                    max_output_tokens=max_tokens,
                ),
            )
        except errors.APIError as e:
            if e.code == 429:
                raise _gemini_rate_limit(e) from e
            raise ProviderError(f"Gemini {e.code}: {e.message}") from e
        except httpx.TimeoutException as e:
            raise ProviderError(f"Gemini timed out after {self._timeout:.0f}s") from e
        u = r.usage_metadata
        parsed = r.parsed if isinstance(r.parsed, schema) else None
        if parsed is None and r.text:
            try:
                parsed = schema.model_validate_json(r.text)
            except ValueError:
                parsed = None
        return Completion(
            parsed=parsed,
            input_tokens=(u.prompt_token_count or 0) if u else 0,
            output_tokens=((u.candidates_token_count or 0) + (u.thoughts_token_count or 0)) if u else 0,
            cache_read_tokens=(u.cached_content_token_count or 0) if u else 0,
            note="" if parsed else "Model output did not match the schema",
        )


def _gemini_rate_limit(e) -> RateLimited:
    """Read RetryInfo and QuotaFailure from a 429 body: how long to wait, and whether it's the daily cap."""
    body = getattr(e, "response_json", None) or getattr(e, "details", None) or {}   # attribute name varies by SDK version
    details = ((body.get("error") or {}).get("details") or []) if isinstance(body, dict) else []
    retry, daily = None, False
    for d in details:
        t = d.get("@type", "")
        if t.endswith("RetryInfo"):
            m = re.match(r"([\d.]+)s", str(d.get("retryDelay", "")))
            retry = float(m.group(1)) if m else None
        if t.endswith("QuotaFailure"):
            daily = any("PerDay" in (v.get("quotaId") or "") for v in d.get("violations") or [])
    return RateLimited(retry, daily, e.message or "rate limited")


class AnthropicProvider:
    def __init__(self):
        import anthropic
        self._client = anthropic.Anthropic()
        self._anthropic = anthropic

    def generate(self, model, system, user, schema, max_tokens):
        try:
            r = self._client.messages.parse(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=schema,
            )
        except self._anthropic.RateLimitError as e:
            ra = e.response.headers.get("retry-after")
            raise RateLimited(float(ra) if ra else None, False, str(e)) from e
        except self._anthropic.APIStatusError as e:
            raise ProviderError(f"Anthropic {e.status_code}") from e
        u = r.usage
        return Completion(
            parsed=r.parsed_output,
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
            cache_read_tokens=u.cache_read_input_tokens or 0,
            note="" if r.parsed_output else f"No parsed output (stop_reason={r.stop_reason})",
        )


_REGISTRY = {"gemini": GeminiProvider, "anthropic": AnthropicProvider}
_instances: dict[str, Provider] = {}


def get(name: str) -> Provider:
    if name not in _REGISTRY:
        raise ProviderError(f"Unknown LLM provider '{name}'. Known: {', '.join(_REGISTRY)}")
    if name not in _instances:
        _instances[name] = _REGISTRY[name]()
    return _instances[name]
