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
- **Defaults:** cheap = `gemini-3.5-flash-lite`, strong = `gemini-3.8-flash`, both listed as free on Google's pricing page (updated 2026-10-28). Pro models aren't on the free tier.
- **Limits verified, not guessed, as far as Google allows.** Google's rate-limit page (updated 2026-10-28) no longer publishes per-model free numbers: limits are per project, shown in AI Studio, and daily quotas reset at midnight Pacific. Defaults (cheap 10 RPM / 500 RPD, strong 5 RPM / 20 RPD) are conservative third-party figures; set the real ones from AI Studio in .env.
- **Rate limiting is layered:** (1) a per-model sliding 60-second window that waits up to LLM_RATE_WAIT_MAX for a free slot; (2) a per-model daily count from the ledger since midnight Pacific; (3) on a provider 429, retry once after Google's RetryInfo delay, or, if QuotaFailure says it's the per-day quota, stop calling that model until the next Pacific midnight. Every block falls back to the recorded/mock output with a reason, never an error page.
- **Caching makes free limits go further:** outputs are recorded by hash of (purpose, provider, model, prompt, schema) and committed, so a filing or transcript is analysed once, ever, and the public demo replays recordings without touching the quota. Changing the model or prompt changes the hash, so stale outputs are never reused for a different model.
- **Ledger:** free-tier calls log real token counts (thinking tokens counted as output) at $0; paid slots are costed from their env prices. The $5 hard cap and public-demo limits are unchanged.
- **Privacy trade-off:** Google may use free-tier inputs to improve its products. We only send public exchange filings and transcripts, so that's acceptable here; it would not be for private data.
