# Deploy

PWA on Vercel, API on a Hugging Face Docker Space. GitHub is the source of truth: a push to `main` runs the backend tests and mirrors only `backend/`, `data/` and `deploy/space/` to the Space (`.github/workflows/deploy-space.yml`), refusing to ship any PDF, `.env` or sqlite file.

Keys and tokens go only into each host's secrets UI. Never into a file, a commit, or a chat.

## 1. GitHub

1. Create an empty repo (no README, no licence), public or private.
2. `git remote add origin <repo URL> && git push -u origin main`.
   The first push runs the workflow and fails at "Push to Space" until step 2 is done. That's expected.

## 2. Hugging Face Space (API)

1. huggingface.co → New Space → SDK **Docker**, template **Blank**, hardware **CPU basic (free)**. Name it e.g. `finn-api`.
2. Settings → Access Tokens → new token, type **Write**, scoped to that Space if offered.
3. GitHub repo → Settings → Secrets and variables → Actions:
   - Secret `HF_TOKEN` = the write token
   - Variable `HF_SPACE` = `<hf-username>/finn-api`
4. GitHub → Actions → "Deploy API to Hugging Face" → Run workflow. Wait for green, then for the Space to show "Running".
5. Space → Settings → Variables and secrets:

   | Name | Kind | Value | Why |
   |---|---|---|---|
   | `CORS_ORIGINS` | Variable | your Vercel URL (after step 3), e.g. `https://finn-xyz.vercel.app` | Lets the PWA call the API |
   | `GEMINI_API_KEY` | **Secret** | your AI Studio key | Optional. Inert until `LLM_MODE=auto` is also set |
   | `LLM_MODE` | Variable | leave unset (= `mock`) | Public demo replays recordings; set `auto` only to allow live calls |
   | `LLM_CHEAP_RPM` / `LLM_CHEAP_RPD` | Variable | from aistudio.google.com/rate-limit | Only matters when live |
   | `LLM_STRONG_RPM` / `LLM_STRONG_RPD` | Variable | from AI Studio | Only matters when live |

   Already set by the Dockerfile: `PUBLIC_DEMO=true`. With it, live calls (when enabled) are capped at `DAILY_LIVE_CALLS=20`/day overall, `PER_IP_DAILY_CALLS=3` per visitor, `DAILY_USD_CAP=0.25`, and `BUDGET_USD_TOTAL=5`, on top of the per-model RPM/RPD limits. Override any of them as Space variables. No Anthropic key is needed; only set `ANTHROPIC_API_KEY` if you point a slot at `anthropic` (see `.env.example`).
6. Check: `https://<hf-username>-finn-api.hf.space/api/health` → `{"ok":true,"llm_mode":"mock","public_demo":true}`.

## 3. Vercel (PWA)

1. vercel.com → Add New → Project → import the GitHub repo.
2. Root Directory: `web`. Framework preset: Vite (build `npm run build`, output `dist`).
3. Environment variable `VITE_API_BASE` = `https://<hf-username>-finn-api.hf.space` (no trailing slash). It's baked in at build time, so redeploy after changing it.
4. Deploy, then put the production URL into the Space's `CORS_ORIGINS` (step 2.5). The Space restarts on its own.

## Known limits

- The Space's disk is ephemeral: the cost ledger and HTTP cache reset when it restarts or wakes from sleep, which also resets the daily demo counters. AI Studio's per-project quota is the backstop.
- Free Spaces sleep after ~48h idle; the first request then takes a while. The PWA shows the briefing bundled at build time until the API answers.
- Per-visitor limits key on the first `X-Forwarded-For` address, which a caller can set. The global daily cap is the limit that holds.
