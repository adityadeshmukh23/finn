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

## CI install fix (2026-11-01)

- **CI #1 failed resolving `pydantic==2.11.4`:** `google-genai==2.34.0` requires `pydantic>=2.12.5`. Local dev never saw it because the venv had already drifted to 2.14.2. Pydantic now floats in `>=2.12.5,<3` (fastapi and anthropic accept anything below 3); a clean install resolves to 2.14.2, same as dev.
- **CI runs the toolchain we develop on:** Python from `.python-version` (3.12) and Node 24 (Node 20 is past end-of-life). Every CI step was checked from a fresh clone with a clean venv and no `.env`: 44 tests, demo-data freshness, the tracked-secrets guard, and the web build.

## Live at https://finn-olive.vercel.app (2026-11-01)

- **Checked on the deployed site at 375px:** replay note, a "Demo data as of 30 Oct, 8:29 pm" badge, the $0.00 replay ledger, no `/api` requests, no console errors, and no horizontal scroll. Window, date and alert controls change the digest; deep links fall through to the app.
- **NSE from the cloud: not exercised.** The public site is static and makes no NSE or API calls by design. Every briefing comes from the 30 Oct snapshot. Whether NSE answers cloud IPs is still unverified; it only matters if the optional Render API is ever deployed.
- **Fixed a race found on the live site:** a fast window-then-date change could show the earlier request's briefing under the later date's header. Now only the latest request updates the screen.

## Push mode 1: classifier reads the filing only when the rules can't (2026-11-01)

- **Rules first, still.** Four misfiles found on the 30 Oct snapshot are now rule fixes with tests: an independent chair of a *subsidiary's* board isn't top management (KPIT); a subsidiary's listing is M&A even when it mentions the subsidiary's results (Reliance/Jio Platforms); "Incorporation of Wholly Owned Subsidiary" is housekeeping with or without "a" (Maruti); "Non-Executive Director" no longer matches "Executive Director".
- **Results newspaper ads are `results`, tier routine**, as the glossary files them, and they fold into that company's results card instead of the hidden row. They never make a results card on their own: the earlier cheap-model mislabel is now impossible by construction.
- **The cheap model sees only what the rules flag as ambiguous** (empty "Reg. 30" and board-outcome summaries, vague "General Updates", insolvency filings that don't say who the debtor is) plus the kinds the briefing summarises (M&A, litigation, equity raises, capex, order wins): 39 of 229 filings. It gets the first three PDF pages and the glossary's category definitions with the known traps spelled out (results ads, subsidiary listings, hearing-date notices, debt raises).
- **A read counts only if verified:** its quote must be in the filing text (spaces ignored, because PDF extraction splits "202 7") and every number in its summary must be too. 38 of 39 pass; the one that fails keeps the rules' label. Rules keep the last word: the model can place an ambiguous filing, and demote a medium rule label it has read (an office opening filed as "expansion"), but never promote a clear rule label; a model "top management" read must still name a CEO/CFO/MD-level role.
- **HUL now has a results card.** NSE's summary of its board outcome was empty; the filing itself says turnover ₹18,071 crore, which is now the headline.
- **Recorded by NSE announcement ID** in `data/recordings/filings/` (committed) alongside the gate's hash-keyed recordings. `scripts.read_filings` runs once locally with a key and skips anything recorded; `--reverify` re-checks recorded reads after a verifier change with no model calls. The static build and the API only replay recordings, so CI, the public demo and keyless runs never call a model. Cost: 39 free-tier calls, once.
- **Live filings that arrive after the snapshot get rules only** until `read_filings` is run for them; a request never waits on a model.

## Push mode 2: every card says why it ranks where it does (2026-11-01)

- **Score stays simple and inspectable:** event weight (table in `digest.py`; top-management change 95, results 90, M&A 85, litigation 80 …) + up to 5 for recency inside the window + 3 per other high-priority filing from the same company. No model in the ranking.
- **The "why #N" line is computed in the browser** (`web/src/rank.ts`), because alert settings (and, next, price/volume alerts) change the order client-side; a server-written line would go stale the moment a setting changes. It names the lead event, what else the company filed, and the deciding comparison with the card above (higher weight, fewer corroborating filings, filed earlier, or older but outscored on recency).
- **Results newspaper ads ride on the results card** ("2 results newspaper ads, same numbers, already filed") rather than inflating the hidden row; the hidden row still counts and groups everything else.
- **Summaries read from the filing say so** ("Summary checked against p.N", with the verified quote on hover), so a model-written headline is never mistaken for NSE's own text.

## Push mode 3: end-of-day price and volume alerts, configurable in the browser (2026-11-01)

- **Source:** Yahoo Finance via yfinance (`SYMBOL.NS`, unadjusted close), as the brief suggests. Live calls are cached in memory for `PRICES_TTL`; any failure falls back to `data/snapshots/prices/eod.json` with a badge ("Prices to 30 Oct close · Yahoo Finance"), and a ticker Yahoo doesn't know is named, not hidden. The snapshot starts in August so every demo day has a full 20-session baseline, and it ends at the same 30 Oct close as the filings snapshot so the two line up.
- **Arithmetic lives in Python and is tested** (`finn/market.py`): day move is close vs previous close; volume multiple is today's volume / mean of the previous 20 sessions, today excluded so a spike doesn't dilute its own baseline; no multiple with fewer than 10 prior sessions or a zero baseline. The build ships those numbers (12 KB `market.json`), and the browser only compares them with the investor's thresholds, so changing a threshold needs no server and works on the static site.
- **Defaults: 2× volume (the brief's figure) and ±4% in a day**, both steppers in Alerts. 4% because on the 30 Oct snapshot it separates real events (Equitas −12% on results and a CEO exit, Sterling Tools +7.9%) from ordinary large-cap noise (Reliance never crosses 3.4%).
- **A session belongs to a window if its 15:30 IST close does.** The card shows the most unusual crossing session in the window, against both thresholds.
- **A move with no filing gets its own card** ("−6.3% on 42× volume; no EQUITASBNK filing in this window") with a link to the NSE quote page. It ranks at 65 plus up to 20 by how far past the threshold it went, so 40×+ volume sits with results, and a 4% wobble sits with board changes. On a card that also has filings, each crossed threshold adds 6 and the "why #N" line says so ("stock −12.2% on 49× volume").
- **Known gap:** we can't yet say *why* volume spiked (block or bulk deals); BAJAJELEC's 88× day on 15 Oct with a 0.4% move looks like a block deal, and the card says to check for exactly that instead of guessing.

## Push mode 4: quarterly-results card, verified figures or none (2026-11-01)

- **Division of labour:** code finds candidate pages (whitespace-stripped text, since PDF extraction splits "Pro fit"; consolidated preferred), the cheap model copies figures off up to three pages with the page it used, and code does everything else: verifies each figure is printed on that page, converts to ₹ crore, computes EBITDA, QoQ, YoY and margins, and grades confidence.
- **EBITDA is computed, labelled, and only where it means something:** PBT + finance costs + D&A − other income, and only when all four parts verified. Lenders (bank/NBFC/housing finance) show "n/a for lenders": their finance cost is the cost of the product.
- **Growth off a loss or zero is "n.m."**, not a percentage that reads backwards.
- **The verifier had to learn PDF number splitting** ("9 ,976 .51", "1,391.5 2", "2 ,8 25.61") without ever gluing adjacent columns; both directions are tested on Asian Paints' real extracted text.
- **Confidence:** high = consolidated and every figure found on the page; medium = standalone only, or a non-headline figure dropped; low = a headline figure (revenue, PBT or PAT) missing or the unit unclear. **Low shows no numbers**, only the reason and the page link: a wrong number on a briefing card is worse than none.
- **Outcome on the snapshot (17 holdings with a results filing, 17 cheap-model calls, $0):** 7 high (Aarti, Asian Paints, HUL, KPIT, L&T, Polycab, Reliance), 3 medium (Bajaj Finance; Equitas and Infosys standalone), 5 low (Maruti's PDF is OCR'd with misread digits; Sun Pharma's text merges columns; HDFC Bank, Home First, Sterling Tools partly), 2 none (Deepak Nitrite is a scanned image; no table found for Info Edge). Stopped tuning there: the remaining failures are source quality, and they fail honestly.
- **Confident cards lead with the number:** "PAT ₹29,250 cr, +32.1% YoY; revenue +28.6%".

## Push mode 5: management-change card from the filing itself (2026-11-01)

- **Who, role, effective date, reason, background: all from the Reg. 30 disclosure.** The cheap model copies them with a verbatim quote for the reason and the profile; code keeps a person only if they're named in the filing, and blanks any reason, date or profile it can't find there (numbers included). 14 top-management filings, 16 live calls (two re-reads after the page fix), 34 changes, all naming a person found in the filing, $0.
- **The profile is often at the end of a 20-page board outcome**, so the reader sends the first 4 pages plus up to 3 later pages that look like a profile annexure, each with its real page number for the citation.
- **Reasons are shown for exits only.** For an appointment the "reason" field is process boilerplate ("on the recommendation of the NRC"), which tells an investor nothing.
- **One row per person and change across a company's filings.** Info Edge filed the same transition five times; the card shows it once, keeping the most complete version.
- **Web enrichment of bios is not built.** It's optional in the plan, and the filing's own profile already covers the CFO appointments in the demo (Aarti, Home First). If added, it would be a separate, labelled "outside the filing" link, never mixed into the verified fields.
- **Push-mode model spend, all phases:** 93 live cheap-model calls (classification reads, filing summaries, results tables, management changes, including re-runs after prompt fixes), about 285k input and 18k output tokens, $0 on the Gemini free tier. Every output is recorded; the public demo makes no model calls.
