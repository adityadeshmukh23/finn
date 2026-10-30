"""Which slot each task uses. Slots themselves (provider, model, price, limits) are set in env;
see config.Slot. Routing order everywhere: deterministic rules first, then the cheap slot, then
the strong slot only for tasks that need judgement.
"""
from .config import Slot, settings

# purpose -> slot. The strong slot is reserved for promised-vs-delivered verdicts and bull/bear.
ROUTES = {
    "classify": "cheap",
    "summarise_filing": "cheap",
    "extract_guidance": "cheap",
    "extract_results": "cheap",
    "ask": "cheap",
    "verdict": "strong",
    "bull_bear": "strong",
}


def slot_for(purpose: str) -> Slot:
    return settings.slots[ROUTES[purpose]]


def cost_usd(slot: Slot, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0) -> float:
    return (
        input_tokens * slot.price_in + output_tokens * slot.price_out + cache_read_tokens * slot.price_cache_read
    ) / 1_000_000
