#!/usr/bin/env bash
# One command to run FINN locally with live NSE data: API on :8000, PWA on :5173.
#   ./run.sh                      your portfolio (data/portfolio.json)
#   ./run.sh TATAMOTORS ZOMATO    ...plus any other NSE tickers
#   ./run.sh research TATAMOTORS  record promised-vs-delivered research for any NSE ticker first
#                                 (needs GEMINI_API_KEY in .env; a few minutes per company), then start
# Without GEMINI_API_KEY in .env, model calls replay recordings or use mock output.
set -euo pipefail
cd "$(dirname "$0")"
[ -d "$HOME/.local/node/bin" ] && PATH="$HOME/.local/node/bin:$PATH"
command -v python3 >/dev/null || { echo "Need Python 3.12"; exit 1; }
command -v npm >/dev/null || { echo "Need Node 24 (npm)"; exit 1; }

if [ ! -x .venv/bin/uvicorn ]; then
  echo "Setting up Python env…"
  python3 -m venv .venv && .venv/bin/pip install -q -r backend/requirements.txt
fi
[ -d web/node_modules ] || (echo "Installing web deps…" && cd web && npm install --silent)
[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example (no keys: mock/recorded mode)."; }

if [ "${1:-}" = "research" ]; then
  shift
  [ $# -gt 0 ] || { echo "Usage: ./run.sh research TICKER [TICKER...]"; exit 1; }
  (cd backend && ../.venv/bin/python -m scripts.research "$@") || echo "Some research wasn't recorded (see above); starting the app anyway."
  set --
fi

export FINN_SYMBOLS="$(IFS=,; echo "${*:-}" | tr '[:lower:]' '[:upper:]')"
[ -n "$FINN_SYMBOLS" ] && echo "Adding tickers: $FINN_SYMBOLS"

(cd backend && ../.venv/bin/uvicorn finn.main:app --port 8000) &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT INT TERM
echo "API on http://127.0.0.1:8000 · open http://localhost:5173"
cd web && npm run dev -- --port 5173 --strictPort
