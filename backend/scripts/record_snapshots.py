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

# End-of-day prices: enough sessions before the announcements window for a 20-session volume baseline.
from finn.sources import prices  # noqa: E402

snap = prices.record_snapshot(sorted(symbols), end - timedelta(days=days + 60), end)
print(f"Recorded EOD bars for {len(snap['bars'])} symbols, {snap['from']} to {snap['to']}")
