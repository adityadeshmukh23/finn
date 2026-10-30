"""Record the NSE announcements snapshot used when NSE is unreachable (run from a machine NSE allows).

Usage: python -m scripts.record_snapshots [days]
"""
import json
import sys
from datetime import timedelta

from finn.config import settings
from finn.sources import nse

days = int(sys.argv[1]) if len(sys.argv) > 1 else 21
end = nse.now_ist().date()
symbols = {p["symbol"] for p in json.loads((settings.data_dir / "portfolio.json").read_text())["portfolio"]}
n = nse.record_snapshot(end - timedelta(days=days), end, symbols)
print(f"Recorded {n} announcements for {len(symbols)} symbols, {end - timedelta(days=days)} to {end}")
