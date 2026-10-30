"""SQLite store for the HTTP cache and the cost ledger. LLM outputs are recorded as files (see llm.py)."""
import sqlite3
import threading
from contextlib import contextmanager

from .config import settings

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS http_cache (
    url TEXT PRIMARY KEY,
    fetched_at REAL NOT NULL,
    content_type TEXT,
    body BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    day TEXT NOT NULL,
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    source TEXT NOT NULL,            -- live | cache | mock | blocked
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    client TEXT
);
CREATE INDEX IF NOT EXISTS ledger_day ON ledger(day);
"""


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        settings.cache_db.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(settings.cache_db, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
    return _conn


@contextmanager
def tx():
    with _lock:
        c = conn()
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise


def reset_for_tests(path) -> None:
    """Point the store at a fresh file (tests only)."""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = sqlite3.connect(path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
