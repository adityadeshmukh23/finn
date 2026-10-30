"""Polite, cached HTTP. One request per host per interval, cached by URL with a TTL.

No logins, no CAPTCHA solving, no paywall bypass: if a source refuses us, we fail and the
caller falls back to a recorded snapshot.
"""
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from . import db
from .config import settings

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
_last_hit: dict[str, float] = {}
_host_lock = threading.Lock()
_client = httpx.Client(headers={"User-Agent": UA, "Accept": "*/*"}, timeout=20, follow_redirects=True)


class FetchError(Exception):
    pass


@dataclass
class Fetched:
    body: bytes
    fetched_at: float
    from_cache: bool


def _wait_turn(host: str) -> None:
    with _host_lock:
        wait = _last_hit.get(host, 0) + settings.min_seconds_between_requests - time.time()
        if wait > 0:
            time.sleep(wait)
        _last_hit[host] = time.time()


def get(url: str, ttl: float | None, headers: dict | None = None) -> Fetched:
    """Return the cached body if younger than ttl (None = never expires), else fetch."""
    row = db.conn().execute("SELECT fetched_at, body FROM http_cache WHERE url=?", (url,)).fetchone()
    if row and (ttl is None or time.time() - row["fetched_at"] < ttl):
        return Fetched(row["body"], row["fetched_at"], True)
    _wait_turn(urlparse(url).netloc)
    try:
        r = _client.get(url, headers=headers)
    except httpx.HTTPError as e:
        raise FetchError(f"{urlparse(url).netloc}: {type(e).__name__}") from e
    if r.status_code != 200:
        raise FetchError(f"{urlparse(url).netloc} returned {r.status_code}")
    now = time.time()
    with db.tx() as c:
        c.execute(
            "INSERT OR REPLACE INTO http_cache(url, fetched_at, content_type, body) VALUES (?,?,?,?)",
            (url, now, r.headers.get("content-type"), r.content),
        )
    return Fetched(r.content, now, False)
