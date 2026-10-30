"""The one place models and prices are configured.

Routing order everywhere: deterministic rules first, then the cheap model, then the strong
model only for tasks that need judgement. Prices are USD per million tokens (first-party API).
"""

MODELS = {
    "cheap": {"id": "claude-haiku-5-5", "input": 0.10, "output": 0.50, "cache_read": 0.01},
    "strong": {"id": "claude-sonnet-5-5", "input": 2.00, "output": 10.00, "cache_read": 0.20},
}

# purpose -> tier. Sonnet is reserved for promised-vs-delivered verdicts and bull/bear.
ROUTES = {
    "classify": "cheap",
    "summarise_filing": "cheap",
    "extract_guidance": "cheap",
    "extract_results": "cheap",
    "ask": "cheap",
    "verdict": "strong",
    "bull_bear": "strong",
}


def model_for(purpose: str) -> dict:
    return MODELS[ROUTES[purpose]]


def cost_usd(model: dict, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0) -> float:
    return (
        input_tokens * model["input"] + output_tokens * model["output"] + cache_read_tokens * model["cache_read"]
    ) / 1_000_000
