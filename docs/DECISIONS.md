# Decisions log

## Phase 1: briefing shell (2026-10-30)

- **NSE is the announcements source, not BSE.** From a Mac, NSE's JSON API answers without cookies; BSE's returns 403. One market-wide request per window, filtered to the portfolio, instead of 18 per-symbol calls. Unverified from cloud hosts, so every fetch falls back to a recorded snapshot with a "data as of" badge.
- **Ranking is rules, not an LLM.** NSE already tags each filing with a category and a one-line summary; regex rules on those place 133 filings in a 7-day window with zero model calls. Unplaceable filings are labelled "Reg. 30 disclosures (NSE gave no summary)" rather than guessed. Why: cost (free), speed, and determinism; an LLM pass on that leftover bucket is a later, cheap add.
- **One card per company.** A results filing, its press release, deck and concall notice are one decision, so they're one card; the lead item is the highest-scoring filing. Management changes at the top (CEO/CFO/MD) outrank results, because they're rarer and harder to price.
- **Hidden filings are grouped by reason and fully inspectable.** The count proves the filtering; opening it is how we caught HDFC Bank's MD change being misfiled as routine (now a test case).
- **Results headlines are rewritten deterministically** ("Results for the quarter ended Sep 2026") from the filing text; NSE's raw summaries for results are letter boilerplate.
- **One LLM gate with a hard budget.** Recorded outputs (by input hash, committed under data/recordings) are replayed first, so keyless runs and the public demo reuse real outputs. Live calls are blocked past $5 total, or on the public demo past $0.25/day, 20 calls/day, or 3 per visitor (hashed IP). Model IDs and prices live only in models.py: Haiku 5.5 for bulk, Sonnet 5.5 only for verdicts and bull/bear.
- **Three layers of fallback for the demo:** live NSE → recorded snapshot → briefing bundled into the PWA at build time (covers a sleeping or unreachable API).
- **Hosting:** PWA on Vercel; API as a Hugging Face Docker Space mirrored by a GitHub Action that ships only backend code, snapshots and recordings, and refuses to deploy if a PDF, .env or sqlite file is in the bundle.
- **One gesture:** swipe left to dismiss (with undo); tap to expand. Effort went into card copy and the hidden-filings row instead.

## LLM layer: provider-agnostic, Gemini free tier by default (2026-10-30)

- **Why:** no paid Anthropic key, and the brief says free tiers are enough and rewards spending less. Gemini's free tier covers structured extraction and classification at zero cost.
- **One interface, two slots.** `providers.py` exposes `generate(model, system, user, schema)` for Gemini and Anthropic; the gate never imports a vendor SDK. Slots `cheap` (bulk extraction/classification) and `strong` (promised-vs-delivered verdicts, bull/bear) each take provider, model, prices and rate limits from env only. Swapping the strong slot to a paid model is an env change, with prices set so the ledger and budget cap work.
- **Defaults:** cheap = `gemini-3.5-flash-lite`, strong = `gemini-3.6-flash` (was 3.8-flash; see the smoke test below), both listed as free on Google's pricing page (updated 2026-10-28). Pro models aren't on the free tier.
- **Limits verified, not guessed, as far as Google allows.** Google's rate-limit page (updated 2026-10-28) no longer publishes per-model free numbers: limits are per project, shown in AI Studio, and daily quotas reset at midnight Pacific. Defaults (cheap 10 RPM / 500 RPD, strong 5 RPM / 20 RPD) are conservative third-party figures; set the real ones from AI Studio in .env.
- **Rate limiting is layered:** (1) a per-model sliding 60-second window that waits up to LLM_RATE_WAIT_MAX for a free slot; (2) a per-model daily count from the ledger since midnight Pacific; (3) on a provider 429, retry once after Google's RetryInfo delay, or, if QuotaFailure says it's the per-day quota, stop calling that model until the next Pacific midnight. Every block falls back to the recorded/mock output with a reason, never an error page.
- **Caching makes free limits go further:** outputs are recorded by hash of (purpose, provider, model, prompt, schema) and committed, so a filing or transcript is analysed once, ever, and the public demo replays recordings without touching the quota. Changing the model or prompt changes the hash, so stale outputs are never reused for a different model.
- **Ledger:** free-tier calls log real token counts (thinking tokens counted as output) at $0; paid slots are costed from their env prices. The $5 hard cap and public-demo limits are unchanged.
- **Privacy trade-off:** Google may use free-tier inputs to improve its products. We only send public exchange filings and transcripts, so that's acceptable here; it would not be for private data.

## Live smoke test and Gemini timeouts (2026-10-30)

- **Both slots work live on the free key.** Cheap (`gemini-3.5-flash-lite`) classified two filings correctly in about 1s; ledger rows show real tokens at $0, and replays come back `recorded` with zero API calls.
- **Strong default moved from `gemini-3.8-flash` to `gemini-3.6-flash`.** 3.8-flash is listed and accepted by the key but was overloaded: raw REST returned 503 "high demand", and 60s timeouts on retries; 3.7-flash timed out too. 3.6-flash answered the same reasoning prompt in about 6s and is free on the pricing page, but minutes later it too returned 503s: free-tier capacity on the Flash models swings by the hour. So strong-slot work (verdicts) will be run ahead of time and recorded; the demo replays recordings and never waits on a congested model. It's one env line (`LLM_STRONG_MODEL`) to move back when 3.8 settles.
- **Bounded the SDK's hidden retries.** google-genai retries 5 times by default, including 429s, which turned one overloaded call into 279s and hid the 429 RetryInfo our limiter relies on. Now: per-request timeout `LLM_TIMEOUT` (90s), one retry on 500/502/503 only; 504 and timeouts become a `blocked` result with the provider's message, and 429s reach `llm.call`, which already handles them.

## Public deploy guardrails (2026-10-31)

- **The hosted API defaults to recorded/mock even with a key present.** `LLM_MODE` now defaults to `mock` when `PUBLIC_DEMO=true` (the Dockerfile sets it). Putting `GEMINI_API_KEY` on the Space does nothing until `LLM_MODE=auto` is also set, so adding a key can't open live calls by accident. Why: the demo should replay recordings; live calls are an explicit opt-in.
- **Guards checked before the key goes public:** with live enabled, the public demo is capped at 20 live calls/day overall, 3 per visitor, $0.25/day and $5 total, plus per-model RPM/RPD. Tests now cover the global daily cap and the mode default. No public endpoint calls the LLM yet anyway.
- **Known weak spot:** the per-visitor key is the first `X-Forwarded-For` address, which callers can spoof; the global cap is what actually holds. The ledger lives on the Space's ephemeral disk, so counters reset on restart; AI Studio's own quota is the backstop.
- **Deploy steps live in docs/DEPLOY.md** and use `GEMINI_API_KEY` and the `LLM_*` variables; no Anthropic key is needed.

## Public demo is static on Vercel; the live API runs locally (2026-10-31)

- **Hugging Face Docker Spaces now need a paid plan, so that path is gone.** Free API hosts checked on 2026-10-31: Render's free web service is the only real one (no card; 512 MB / 0.1 CPU; sleeps after 15 min idle, about 1 min to wake; ephemeral disk; 750 h/month). Koyeb lists no free compute; Fly.io and Railway are card or trial only.
- **Chose a static demo over Render + Vercel.** The public demo serves recorded data anyway (no key on any public host), so a hosted API would only add a one-minute cold start, which a grader opening the link would likely hit, plus an NSE fetch from a cloud IP that may well be blocked. Static means no key to leak, no cost, nothing to sleep.
- **Interactive, not a slideshow.** `scripts/build_static.py` runs the same digest code offline over the snapshot: 22 days × 3 windows. The window picker and as-of date read those files. Alert settings (high-only, muted categories) re-rank in the browser (`web/src/alerts.ts`), so they work on live data too. Muted filings move to a visible "muted by your settings" group rather than vanishing.
- **Volume-multiple and price-move thresholds aren't there yet.** FINN has no price data until push mode; the settings sheet says so instead of showing controls that do nothing.
- **Honest labels:** a "Replay mode" note, a "Demo data as of <snapshot time>" badge, a $0.00 ledger that explains there are no model calls, and no Refresh button.
- **Any ticker still works, locally.** `./run.sh TICKER …` adds tickers to the portfolio (`FINN_SYMBOLS`) with live NSE data. That's how to answer "point FINN at a company you didn't pick". `deploy/render/render.yaml` is kept as an optional, undeployed path.
- **CI replaces the HF workflow:** tests, a check that the demo data matches the snapshot and ranking code, a guard against tracked PDF/.env/sqlite files, and the web build.
