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
