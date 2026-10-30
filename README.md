# FINN

A mobile-first investor briefing. You open a ranked list of what changed across your portfolio, not a chatbox: one card per company, the routine paperwork collapsed into a count you can inspect.

**Status: Phase 1.** Briefing from live NSE filings, rule-based ranking, snapshot fallback, cost ledger. Research ("Ask FINN") comes next.

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cp .env.example .env            # optional: add a free GEMINI_API_KEY; without it FINN runs in mock/recorded mode
cd backend && ../.venv/bin/uvicorn finn.main:app --port 8000
```

```bash
cd web && npm install && npm run dev     # http://localhost:5173, proxies /api to :8000
```

Tests: `cd backend && ../.venv/bin/pytest -q`

## How it works

- **Data**: NSE corporate announcements (one request per window, cached; past windows never refetched). If NSE is unreachable, FINN serves `data/snapshots/nse/announcements.json` and says so with a "data as of" badge. If the API itself is down, the PWA shows a briefing bundled at build time.
- **Ranking**: deterministic rules on NSE's category and the filing summary (`backend/finn/classify.py`), scored and grouped by company (`backend/finn/digest.py`). No LLM is involved, so the briefing costs nothing.
- **LLM gate** (`backend/finn/llm.py`): every model call goes through one function that replays recorded outputs first, runs mock mode with no key, enforces free-tier rate limits, a hard spend cap and per-visitor limits on the public demo, and logs tokens and cost to a ledger shown in the app.
- **Providers** (`backend/finn/providers.py`): Gemini (default, free tier) and Anthropic behind one interface. Two slots, `cheap` and `strong`, each with provider, model, price and limits set only in `.env` (see `.env.example`); `backend/finn/models.py` maps tasks to slots.

## Refresh the snapshot

```bash
cd backend && ../.venv/bin/python -m scripts.record_snapshots 21 && ../.venv/bin/python -m scripts.export_bundled_digest
```
