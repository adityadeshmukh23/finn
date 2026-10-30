"""Write the briefing the PWA shows when the API is asleep or unreachable.

Usage (from backend/): python -m scripts.export_bundled_digest
"""
import json

from fastapi.testclient import TestClient

from finn.config import REPO_ROOT
from finn.main import app

out = REPO_ROOT / "web" / "public" / "snapshot"
out.mkdir(parents=True, exist_ok=True)
client = TestClient(app)
for hours in (24, 72, 168):
    d = client.get(f"/api/digest?hours={hours}").json()
    (out / f"digest-{hours}.json").write_text(json.dumps(d, ensure_ascii=False))
    print(f"{hours}h: {d['counts']['total']} filings, {len(d['cards'])} cards, source={d['source']['source']}")
