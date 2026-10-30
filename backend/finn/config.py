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


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("FINN_DATA_DIR", REPO_ROOT / "data")))
    # "auto" = live if a key is present, else mock. "mock" forces recorded/mock outputs.
    llm_mode: str = os.getenv("LLM_MODE", "auto")
    has_api_key: bool = bool(os.getenv("ANTHROPIC_API_KEY"))
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
    cors_origins: tuple[str, ...] = tuple(
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    )

    @property
    def cache_db(self) -> Path:
        return self.data_dir / "cache" / "finn.sqlite"

    @property
    def snapshot_dir(self) -> Path:
        return self.data_dir / "snapshots"

    @property
    def llm_live(self) -> bool:
        if self.llm_mode == "mock":
            return False
        return self.has_api_key


settings = Settings()
