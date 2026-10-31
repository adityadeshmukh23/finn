"""Runtime settings. Everything tunable lives here or in .env; nothing else reads os.environ."""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


def default_llm_mode() -> str:
    return os.getenv("LLM_MODE") or ("mock" if _bool("PUBLIC_DEMO", False) else "auto")


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("FINN_DATA_DIR", REPO_ROOT / "data")))
    # "auto" = live for any slot whose provider has a key, else mock. "mock" forces recorded/mock outputs.
    # The public demo defaults to mock: a key on the host does nothing until LLM_MODE=auto is set too.
    llm_mode: str = field(default_factory=lambda: default_llm_mode())
    provider_keys: dict[str, bool] = field(default_factory=lambda: {
        "gemini": bool(os.getenv("GEMINI_API_KEY")),
        "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
    })
    slots: dict[str, "Slot"] = field(default_factory=lambda: {"cheap": _slot("CHEAP"), "strong": _slot("STRONG")})
    # Longest we'll wait for a free per-minute slot before falling back (seconds).
    rate_wait_max: float = float(os.getenv("LLM_RATE_WAIT_MAX", "20"))
    # Per-request timeout; the SDK's own silent retries otherwise stretch an overload to minutes.
    request_timeout: float = float(os.getenv("LLM_TIMEOUT", "90"))
    # Public demo: serve cached/snapshot results; live LLM calls are rate-limited.
    public_demo: bool = _bool("PUBLIC_DEMO", False)
    budget_usd_total: float = float(os.getenv("BUDGET_USD_TOTAL", "5.0"))
    daily_usd_cap: float = float(os.getenv("DAILY_USD_CAP", "0.25"))
    daily_live_calls: int = int(os.getenv("DAILY_LIVE_CALLS", "20"))
    per_ip_daily_calls: int = int(os.getenv("PER_IP_DAILY_CALLS", "3"))
    # Cache TTLs (seconds)
    announcements_ttl: int = int(os.getenv("ANNOUNCEMENTS_TTL", "900"))
    prices_ttl: int = int(os.getenv("PRICES_TTL", "21600"))
    # Polite fetching
    min_seconds_between_requests: float = float(os.getenv("FETCH_MIN_INTERVAL", "1.0"))
    # Hosts we fetch research documents from get a wider gap (robots.txt sets no crawl-delay; this is ours).
    slow_hosts: dict[str, float] = field(default_factory=lambda: {
        h: float(os.getenv("RESEARCH_FETCH_INTERVAL", "3.0"))
        for h in ("www.screener.in", "www.bseindia.com")
    })
    screener_ttl: int = int(os.getenv("SCREENER_TTL", "86400"))
    # Extra NSE tickers to brief on top of data/portfolio.json, e.g. "TATAMOTORS,ZOMATO" (./run.sh takes them as args).
    extra_symbols: tuple[str, ...] = tuple(
        s.strip().upper() for s in os.getenv("FINN_SYMBOLS", "").split(",") if s.strip()
    )
    cors_origins: tuple[str, ...] = tuple(
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    )

    @property
    def cache_db(self) -> Path:
        return self.data_dir / "cache" / "finn.sqlite"

    @property
    def snapshot_dir(self) -> Path:
        return self.data_dir / "snapshots"

    def live(self, slot: "Slot") -> bool:
        return self.llm_mode != "mock" and self.provider_keys.get(slot.provider, False)

    @property
    def any_live(self) -> bool:
        return any(self.live(s) for s in self.slots.values())


@dataclass(frozen=True)
class Slot:
    """A model slot. Provider, model, prices and rate limits all come from env."""
    name: str
    provider: str
    model: str
    price_in: float          # USD per million tokens; 0 on a free tier
    price_out: float
    price_cache_read: float
    rpm: int                 # requests per minute we allow ourselves (0 = unlimited)
    rpd: int                 # requests per day, counted from midnight Pacific (0 = unlimited)


# Defaults are Gemini free-tier models. Google publishes per-project limits only in AI Studio
# (aistudio.google.com/rate-limit); set LLM_*_RPM / LLM_*_RPD to what yours shows.
_DEFAULTS = {
    "CHEAP": ("gemini", "gemini-3.5-flash-lite", 10, 500),
    "STRONG": ("gemini", "gemini-3.6-flash", 5, 20),
}


def _slot(name: str) -> Slot:
    provider, model, rpm, rpd = _DEFAULTS[name]
    env = lambda k, d: os.getenv(f"LLM_{name}_{k}", d)  # noqa: E731
    return Slot(
        name=name.lower(),
        provider=env("PROVIDER", provider),
        model=env("MODEL", model),
        price_in=float(env("PRICE_IN", "0")),
        price_out=float(env("PRICE_OUT", "0")),
        price_cache_read=float(env("PRICE_CACHE_READ", "0")),
        rpm=int(env("RPM", str(rpm))),
        rpd=int(env("RPD", str(rpd))),
    )


settings = Settings()
