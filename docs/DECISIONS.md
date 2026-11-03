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

## Pull mode 1: promised vs delivered, one company recorded (2026-11-01)

- **Research set: BEL, KAYNES, COFORGE, DIXON, plus ASIANPAINT** (from the portfolio, so Ask FINN on a push card opens a real research view on the static demo). Each was checked by fetching screener.in: five earnings calls in a row and an FY26 annual report, all with a text layer. PERSISTENT was dropped: its Q1 FY27 earnings transcript isn't listed.
- **Screener is an index only.** We read the Documents links and nothing else (no ratios, no "AI Summary"). No login needed; robots.txt allows `/company/` pages and sets no crawl-delay. We fetch one request per 3 s per host (screener, BSE, company IR), cache company pages for a day and PDFs forever, and snapshot the document list per company.
- **What a call was and which quarter it covers come from the transcript, not screener's month label.** Kaynes' "Dec 2025" row is a business-update call; Coforge's is the Encora acquisition call; Kaynes writes "Q4 FY 2024 - 2025"; Asian Paints lists an "AGM – Finance" among speakers. All 36 transcripts checked are tagged correctly, and the rules are tested on those snippets.
- **No embeddings.** A transcript is about 15k tokens, so the cheap model reads each whole, once. The only retrieval is a rules search of later calls (acronyms and label words) for promises nothing reported settles, so "not found in the documents" means we searched.
- **The verifier decides what's shown.** A quote must be on its cited page word for word (letters, digits, "." and "%" compared, because PDFs split words and models tidy punctuation). Every target or figure must be in its quote. Annual-report figures must be printed on their page. Transcripts print "Page 3 of 20" on PDF page 4, so a quote is re-cited to a neighbouring page only when it's verbatim on exactly one. Failures are listed in the app as "dropped by the verifier", with where and why, never shown as claims.
- **Code sets every numeric verdict**, against the first stated target. Met: at or above it. Partially: within 1 point of a margin target, or at least 80% of a growth or amount target. Otherwise missed. Growth, EBITDA and margins come from annual-report figures in code. The strong model only groups restatements, matches figures, and judges milestones. Its reasoning is shown only if every number in it is in the cited items. A target restated in other words ("15%+" after "15–17%") isn't a revision.
- **The credibility line is built from the verdicts, not written by the model.** The judge's sentence passed the numbers check but called a "partially" row "missed". A summary that contradicts the rows below it is worse than none.
- **Strong-model fallback chain** (`LLM_STRONG_FALLBACKS`, default 3.8-flash → 3.7-flash → 3.6-flash). Each recording's `_meta` names the model that answered and the ones it fell back from; the research footnote says so. Over the session, 3.8-flash and 3.7-flash returned 504s several times and the chain caught it every time.
- **Nothing incomplete is recorded.** If any model step is blocked (a 503 on one call, a 504 on the annual report), the run records nothing and says to re-run. Finished steps replay free. CI re-verifies every recorded claim against the stored text of its page, and the PDFs are never committed.
- **BEL outcome:** 5 calls (Q1 FY26 to Q1 FY27) plus the FY26 annual report; consolidated P&L on p.171 (the title sits under the table). Met 3 of 6 checkable promises. Missed: the QRSAM order (due Q4 FY26; the Q1 FY27 call cites procedural delays) and order inflow including QRSAM (about ₹57,000 cr guided, ₹30,045 cr booked). Short on capex (₹900 cr against ₹1,000 cr+). Delivered: revenue growth 16.2%, EBITDA margin 29.2%, order inflow ex-QRSAM. 2 not found, 3 too vague, 6 not yet due (FY27 guidance), 3 claims dropped. Cost: 6 cheap and about 8 strong free-tier calls across reruns, $0.

## Pull mode 2: four companies recorded, row rules from review (2026-11-01)

- **Every row was read against its quotes before it shipped, and what failed became a deterministic rule.** The rules run after the judge, so applying them replays recorded output with no new model calls:
  - **Unit must be stated in the quote.** Kaynes' "INR25,000 million" was read as ₹25,000 crore, and "70 to 85 days" as 70–85%.
  - **A question isn't a promise.** "$2 billion by FY30" was an analyst's question on Kaynes' call.
  - **A period written in the quote beats the model's label.** Coforge's "Q4 FY26 EBIT of the firm is 16.6%" was tagged Q1 FY26.
  - **EBIT and EBITDA must agree,** read from the words in the quotes. They share a metric key, so 14% EBIT guidance could have been compared with an 18.6% EBITDA figure.
  - **Statements due by the quarter the call reports aren't promises.** Coforge's merger "effective date is 1 April 2025" was scored met.
  - **A lead statement whose quote has a figure the model didn't read is left out,** not called vague. Kaynes' "might exceed the guidance of 15.6%" was shown as too vague with no number.
  - **Counts with no unit are left out.** Asian Paints' "almost 10 lakh people" showed as "10+".
  - **"About" or "almost" in the quote makes a point target.**
  - **A dated future commitment is not yet due,** even when worded.
  - **When the judge lists no usable figure, code matches verified figures itself,** but only if exactly one value fits.
- **Every later statement shows in the row,** labelled revised, restated or "no figure read". Kaynes cut ₹4,500 cr+ to "about INR4,000 crores minimum" on its Q3 call; the model didn't read that as a number, and the row would otherwise have said "same target restated".
- **Revenue printed only as its parts is summed by code.** Asian Paints' P&L has no revenue total, and the model had added the lines itself.
- **Credibility line from the verdicts,** not the judge's prose (see Pull mode 1).
- **Strong-model calls:** `LLM_TIMEOUT=240` for offline research runs. The Gemini SDK sends the timeout to the server as the deadline, so at 90 s, 3.8-flash and 3.7-flash returned 504 while reasoning over a long judge prompt. With 240 s, 3.8-flash answered first time. Unusable output (cut off or off-schema) now hands over to the next model like an error.
- **Our ledger undercounts Google's daily quota.** Google stopped gemini-3.8-flash at its 20/day limit when our ledger showed 11 calls for it: the SDK retries 503s itself, and timed-out attempts count on Google's side. Treat the ledger's per-model count as a lower bound. The 429 path also crashed reading the quota details (the SDK names the field `details`), which is now fixed and tested.
- **Outcome:** BEL met 3 of 6 checkable promises. Kaynes is short on FY26 revenue (₹4,500 cr+ guided, ₹3,626.35 cr delivered, 80.6%, so partially). Coforge met 2 of 2 (FY26 EBIT 14.4% against 14%+, Q4 EBIT 16.6% against 15%+). Asian Paints has no checkable promise: its guidance is worded or a margin band with no year. Dixon's six cheap-model reads are recorded, and its judge step waits for tomorrow's quota.

## Pull mode 3: Dixon recorded; known weak spots (2026-11-01)

- **Dixon:** the judge ran once on gemini-3.7-flash, whose daily quota was already gone, then once on 3.6-flash, which answered. The recording names both. `LLM_RETRIES=0` made that one request per model; by default, the SDK and the gate each retry a 503 or short rate limit once, and every try counts against the free quota. Met 1 of 5 checkable promises (robo vacuums by December '25). Missed: HKC display trials and mass production, and the Inventec JV date, all now promised for Q3–Q4 FY27. Partially: Tirupati, where the facility was ready but mass production moved to Q2 FY27.
- **New rule from Dixon's review:** a model verdict of late or missed needs evidence that says when. "We have started manufacturing semi-auto washing machines" shows it happened, not that it was late, so that row is "not found" with the reason stated.

### Weak spots, stated plainly

- **Asian Paints has no checkable promise.** Its management guides in words ("mid-single-digit value growth", "high single-digit volume growth") and with an 18–20% PBDIT band that names no year. FINN doesn't turn words into numbers or assign a year management didn't say, so the scorecard shows six "too vague" rows and no verdict. It's in the set so Ask FINN works from a push card. As a demo of the lens it's thin; a numeric guider from the portfolio (L&T, Bajaj Finance) would show more.
- **Our call ledger undercounts Google's.** On 1 Nov, Google stopped gemini-3.8-flash at its 20/day free limit while our ledger showed 11 calls to it. The SDK's own 503 retry and the attempts that timed out are counted by Google but not fully by us. Treat ledger counts as a lower bound, run research with `LLM_RETRIES=0`, and stop well before the per-model limit.
- **PDF text needed verifier rules, and they're tolerances we chose:**
  - Words and numbers split by extraction ("fi rst", "202 5", "9 ,976 .51") are matched by comparing letters, digits, "." and "%" only.
  - Transcripts print "Page 3 of 20" on PDF page 4, so a quote may be re-cited to one neighbouring page, and only if it's verbatim there and on no other neighbour.
  - Report titles can sit under their table (BEL's consolidated P&L), and revenue can be printed only as its parts (Asian Paints), which code sums.
  - Each rule is tested on the real text that needed it. A stricter verifier would drop more true claims; a looser one would admit paraphrase.
- **"Not found" is FINN's search, not proof of absence.** The cheap model sometimes misses a reported figure: Coforge's Q4 EBIT was found only after the period-from-quote rule. The rules search of later calls uses keywords. Reasons are worded "FINN found no…" for that reason.
- **Model verdicts on milestones rest on one quote each.** They're shown with the quote and page, and withheld if the reasoning uses an unsourced number or claims lateness without a date, but they're still a judgement.

## No service worker; a kill switch for the old one (2026-11-01)

- **Bug:** the live site rendered blank on a normal load and worked after a hard reload. The build precached `index.html`, and when that cached shell named hashed assets the server no longer had, every normal load requested a missing script (404) and mounted nothing. Reproduced locally: with the precached shell pointing at an old hash, `#root` stays empty and the console shows the 404. A plain redeploy sequence on its own did not blank (first load stale but working, second fresh), so the trigger is the shell and assets disagreeing, which a precache makes permanent until the next worker revision.
- **Chose to remove the service worker, not tune it.** The demo is static replay data; offline use isn't part of its value, and a cached shell is a failure mode a reviewer can't recover from without knowing to hard reload. Network-first navigation would fix this one case but keeps a cache layer to get wrong. Kept: the web manifest, so add-to-home-screen still works.
- **`public/sw.js` is a kill switch,** deployed permanently. Browsers that still have the old worker re-fetch `/sw.js` on their next visit (even when the page itself is a stale shell), so only a worker at that URL can rescue them. It claims clients, deletes every cache, unregisters itself and reloads open pages; it has no fetch handler. `index.html` also unregisters any worker and clears caches when it is loaded from the network. `vercel.json` serves `sw.js` and `index.html` no-cache, and the SPA rewrite still never answers a missing `/assets/` or `/demo/` file with HTML.
- **Verified end to end:** old build installed, shell poisoned to the stale-hash state (blank), then the fixed build served on the same origin and loaded normally: the page reloaded itself, rendered the briefing, and left 0 service workers and 0 caches.
- **CI:** `npm run check:sw` after the web build fails if the build contains a caching worker, if the kill switch doesn't take over, delete caches, unregister and reload pages, if `index.html` references a file that isn't in `dist`, if the rewrite would answer a missing asset with HTML, or if `sw.js` or `index.html` aren't no-cache. Also confirmed to fail on a poisoned build.
- **Cost:** no offline use and `vite-plugin-pwa` is gone from the dependencies (lockfile regenerated).

## Polish block 1: Ledger design foundation (2026-11-01)

- **Rows with a figure column, not cards.** Card 1 started at 382 px of 812; the first row now starts at 175 px. The figure picks a field the card already has (PAT YoY, else revenue YoY, else the stock's move, else its volume multiple) and computes nothing. Low confidence never gets a figure: the row says "figures withheld" in amber.
- **System fonts, no Inter.** It was named in the stack but never loaded. A web font would cost 30 KB and a font swap for little on a phone whose system face is already good.
- **Colour rule changes three things you can see:** the orange "hot" dot on every high-tier card is gone (it carried no information and coloured a +0.9% rise as an alarm), category is a text label, and "partially" went from amber to neutral so amber only ever means low confidence.
- **Muted text darkened** for contrast at 12 px: `ink-3` from #8a8e97 to #6b6f78 in light, #6f747e to #8a8f99 in dark.
- **Explicit times everywhere.** `when()` is deleted. "As of" on a past date is that window's end, and "Prices to the X close" now stops at the last session on or before it (it used to say 30 Oct whatever date you picked).
- **The headline counts verdicts instead of "Met N of M".** "Met 0 of 1" hid that Kaynes' one row was partially met; it now reads "1 partially, of 1 checkable". The recorded headline is unchanged; the screen derives its line from the same counts.
- **Quiet days say why, from the price data.** A weekend is named; a weekday with no bar reads "no price data, likely a market holiday" (20 Oct in the recording). No hard-coded holiday list.
- **A price card no longer tells you to go and check the news.** It says "No filing in this window". The lookback that answers why Equitas moved comes with the company file (block 2).
- **Book is new, Alerts became a tab.** Book lists the 18 holdings with the last close and day move, biggest move first. Alerts lists what fired, then the settings, and says plainly that nothing is sent to the phone.
- **CI gains** `npm test` (vitest, pure functions only, no DOM or testing library) and a 130 KB gzip ceiling on JS and CSS.
- **Known and left for later blocks:** Sun Pharma's low-confidence results can still take #1 (ranking is a stretch item, audit defect 9); Ask FINN's unrecorded case still shows the old sheet until block 2; dismiss is swipe-only until block 5; the research screen keeps its bordered panels, which read as receipts.

## Polish: block 1 review fixes (2026-11-01)

- **Results we can't show a number for don't take #1.** Sun Pharma's low-confidence results outscored Reliance and led the default screen with no figure. The highest-scoring other card now leads, and both "why #N" lines say so; scores don't change. On the 62 non-empty recorded briefings at default settings, 38 now lead with a figure; the other 24 lead with management (9), legal (8), M&A (6) or news (1), which have no number by nature and stay first by design.
- **Smallest text is 13/18, muted grey one notch stronger** (#5f636c light, #9ca1ab dark), from review on a real browser at 320 px. Rows still fit; the first screen loses about one line.
- **Filing stats behind Details, window picker and undo share one docked slot above the tabs.** The slot is reserved in the page's bottom padding, so neither floats over a row, and a dismiss near the dock scrolls the next row clear.

## Polish block 2: company file sheet (2026-11-01)

- **Ask FINN opens a file, not research or an apology.** It was an apology on 49 of 50 cards. Now every entry point (Ask FINN, every Book row, every fired alert) opens one sheet with what FINN verifiably holds, and "run locally" is a small footnote for tickers with no research.
- **One additive `timeline.json`, 95 KB, 18 KB gzipped,** built by the same classifier and verified reads as the briefing, and filtered in the browser by the as-of date, so a past date never sees a later filing. If it fails to load, the sheet shows the card's own filings. Tested by removing the file.
- **A price card points at the heaviest event on the last filing day,** not the latest. Equitas on 30 Oct used to say "check for news"; it now says "Last, 29 Oct: Resignation of Mr. P N Vasudevan as Managing Director & CEO". It states what was filed and when, and claims no cause. Investor decks filed later that day would have won under "latest".
- **Close and volume are two aligned panels, never one chart with two axes.** Inline SVG, no library. A filing marks the first close at or after it, so an after-hours filing marks the next day, which is the session that could react to it. Tap or drag a session and the figure above follows.

## Polish: second review fixes and block 3, Today hero (2026-11-01)

- **Every sheet owns a history entry.** The back gesture used to leave FINN from the first screen. Open pushes an entry, back pops it and closes, and any other close pops it too. Going from the company file to research replaces the entry, so back returns to the screen under the sheet. `sheetHistory.ts` is tested against a model of the browser's history and was run for real at all widths.
- **The window picker moved into the header, reversing the docked row.** Docked, it plus the tabs took about 100 px and hid Ask FINN. The review offered slimming, merging or collapsing; merging is the only one that also fixes the first screen, since collapse-on-scroll leaves it docked at the top. The cost is reach: it's a stretch for the thumb, on something rarely changed. Row actions also moved above the results table, so Ask FINN stays on the first screen.
- **Swipe failed when the pointer left the row,** which is why it could look position-dependent. It now captures the pointer, needs a fifth of the screen (72 px at most) or a fast flick, and never starts within 24 px of the left edge, which iOS uses for back. We could not reproduce a failure specific to the big percentage; touch and mouse both work from there in emulation.
- **Volume bars stop at twice the alert line** and the biggest bar prints its real multiple. A chart that's true but unreadable is no use, and the figure above still gives any session's exact value.
- **Plain headlines are display-only rules that fire on shapes they fully understand.** A test runs them over every recorded headline: no number may appear that wasn't in the original, and none may get longer. The link still opens the filing.
- **The synthesis line is templates over a card's own fields, no model.** It says what was filed and when, never why a stock moved; a test scans every recorded briefing for that, and for numbers that aren't on the row. Results with no figures get no clause while anything else can speak.
- **"Handled" counts only what the investor cleared.** The end line reads "9 companies to look at, 11 filtered. Nothing else is waiting." until rows are dismissed, then "9 handled, 11 filtered". Calling untouched rows handled would be false. Companies and filings are different units, as they are throughout.
- **The book strip is one swipeable row, not an 18-tile grid.** A grid with 44 px tiles costs about 150 px and truncates tickers. Biggest move first means what's off screen matters least.

## Polish: Compact first screen (2026-11-03)

- **Layered, not deleted.** Phone testing found the first screens cramped. A reader now gets three levels: glance (the top 3 rows, one number each), tap (why, filing, table, dismiss) and dig (company file, research). Measured on the real build against the targets set before building, at 390x844 and 375x667: text elements 24 (target 30 or fewer, was 52 and 41), words 96 (100, was about 155 and 111), numbers 15 (16, was 37 and 29), controls 9 (10, was 16 and 14), first row at 131 px (under 140, was 269). "Was" figures subtract the invisible text the first count wrongly included.
- **Results with no figures stay out of the top 3** while another row can take the place. Scores don't change, and the row is still in the list at #4 with its reason. Sun Pharma moved from #2 to #4 on the default screen. The earlier rule only protected #1; a top 3 is what a first-time reader sees. Tested across every recorded briefing.
- **Dismiss moved into the opened row, which partly reverses the visible X from the block 1 review.** Six X's competed for attention on a screen meant to answer what to tap. The swipe stays on every row. Detailed keeps the X.
- **Synthesis and book strip are Detailed only.** The synthesis repeated the rows directly under it. The strip is replaced in Compact by "Book: 11 up, 7 down", which opens the Book tab, where all 18 holdings are listed. Both still exist; nothing was removed.
- **Compact is the default, and the choice stays on the device.** Detailed restores everything open at once. It's in How to read this, not on the first screen, so the toggle doesn't compete with the briefing.
- **The window chip says "Last 24h" in Compact Today,** because the as-of line under it already gives the date. Book and Alerts have no such line and keep the date.

## Polish: trust fixes (2026-11-03)

- **A price row and the company file read one list.** `filedForSession` gives the material filings between two closes, and both the chart's dots and the row use it. The row used to say "no filing behind it" while the chart dotted filings on that session: Equitas on 30 Oct had results and a board change filed after the 29 Oct close.
- **An audit over all 66 recorded briefings found more of the same class,** all at default alert settings: 55 price rows said "No filing in this window" when routine filings existed; 5 said it with material filings on that session (Equitas 30 Oct; L&T 28 Oct and in the 72h window on 30 Oct; Bajaj Finance 21 Oct and in the 72h window on 22 Oct); 5 "Last filing" lines were the heaviest of that day, not the last; 48 card filings and 64 hidden filings were missing from the company file, because the timeline deduped across all days while the briefing dedupes per window; 112 Book counts disagreed with the file for the same reason; 45 rows showed a close from before the filing beside it. All fixed. `trust.test.ts` holds these over every recording at two alert settings.
- **The claim got narrower, not just corrected.** "No filing" became "No material filing between the 29 Oct and 30 Oct closes", which is what FINN checked. "Last filing" became "Filed 29 Oct". With no timeline loaded, a price row makes no claim about filings at all.
- **Timing, never cause.** A close that came before the filing is labelled "before this filing". Nothing says a filing moved a price, and How to read this says so.
- **Every figure carries its labels.** A move names its close. Results name YoY, the quarter and the basis, also on a collapsed row. The quarter comes from the printed label by rules; a label that isn't a date gets no period rather than a guess. Consolidated is now stated as well as standalone.
- **Known and left:** when a company files two results documents, the headline figure sits on the higher-scored filing on the card and on the one it was read from in the file (58 cases, same numbers, same day). The row's Filing link now opens the document the figures came from.
- **Cost:** the first screen went over two targets set for Compact: 103 words (target 100) and 17 numbers (16). The labels were the point, so they stay.

## Polish: plain language (2026-11-03)

- **Investors read what it means; how it was made moves to one footnote.** Model names, fallback reasons, token talk and the README left investor screens. They live in "How this was built": a sheet from How to read this, and a collapsed section at the foot of each research page. A verdict now says "A judgement from the quotes above, each found on its page", which is what the reader needs; which model judged it is one tap down.
- **Thin filings say what they are, from their class.** "Investor Presentation" reads "Results slides from the company". The class already said so. A rule adds no fact, and a test runs over every recorded filing for numbers that weren't in the original. Recorded notes are mapped at display time; the recordings stay as written.
- **Budget won back:** 95 words (target 100) and 16 numbers (16), from 103 and 17, on the real build at 390x844 and 375x667. A collapsed #1 now gives only the event; the full reason is in the opened row.
- **"Since the 29 Oct close" replaces "between the 29 and 30 Oct closes".** Shorter, and still exactly what was checked: a price row only exists when nothing material was filed in the window, so nothing material follows the move either.

## Polish: results cards lead with their source (2026-11-03)

- **When a company files two results documents the same day, the card now leads with the one the figures were read from.** They used to swap headlines between card and company file (58 cases): the figures sat on the higher-scored filing on the card and on their source in the file. The new lead keeps the old lead's score, so no card moved in any recorded briefing; 23 leads changed document. Fixed at the source rather than making the file copy the card's error.

## Polish: ranking (2026-11-03)

- **Approved as proposed, from a before and after on eight days.** On 27 Oct, Sterling's CFO swap led and HDFC Bank's MD & CEO change sat at #3. HDFC Bank now leads, then L&T's results and Reliance's Jio listing.
- **Five changes:** a top change below CEO, MD or chair scores 7 less. Among filing events a large company gets +6 and a mid-size one +3. Other major filings count per kind of event, so one swap filed twice is one event. The flat +6 for a move becomes a scale where price counts twice what volume does, up to 10 on a filing and 25 alone. A filing can't pull a row below its move alone, so a results deck can't bury 24× volume.
- **Size doesn't lift a move with no filing.** Without this, Infosys's smaller move passed KPIT's bigger one because Infosys is larger.
- **The cost, accepted:** a #1 row with a number on fewer briefings, 35 of 62 against 38. On 27 Oct it has none. So a #1 with no number never cuts its sentence, and its reason line names who changed, from the filing's own disclosure. Where the row's sentence is already a verified summary, the sentence is the fact and the reason line keeps the event, rather than printing it twice.
- **A rank line can't claim what the data doesn't show.** `ranking.test.ts` checks every phrase against the data on all 66 briefings at two alert settings, and after a dismiss. A phrase with no check fails. Confirmed by making one line lie: the test failed.
- **Two bugs the windows view found before commit.** "Deputy Managing Director" matched the MD rule, so a deputy's exit took #1 on several days; deputies and vice chairs no longer count as the top role. And "the biggest event with figures to show" appeared on rows with no figures and when nothing outranked them.
- **Left as flagged:** on 17 and 18 Oct, 7-day window, HDFC Bank's Deputy MD exit edges Polycab's results for #1 by about a point. On 29 Oct, 7-day window, Equitas passes Info Edge by 0.3. Tuning weights to win individual days would be fitting to the recording.

## Polish: sector on every company file (2026-11-03)

- **Holdings with no filing in the window had no sector.** The sheet read it from the card. A new additive `sectors` field on each digest fixes it for every entry point, and older data without the field still renders.

## Polish: a stalled request can't hang a screen (2026-11-03)

- **Reproduced: the scorecard's skeleton stayed up forever when a request never answered.** BEL's file itself is fine: it loaded on a deep link, from the Research tab, on rapid back and forward, and on simulated slow 3G. The static build's fetches had no time limit, while the API path had one. Today's briefing had the same gap.
- **Every recorded file now has a 15-second limit,** covering a body that stalls after the headers. The scorecard says "Still loading" at 5 seconds, then stops with what happened and Try again. Today's existing error state gets the same limit. Prices and the company timeline still degrade silently, as designed.
- **A failure no longer blames the data.** Offline or a bad response used to read "No research for BEL yet", which says the work was never done. Only a 404 says that now.
- **Untested on a real network:** whether a real phone stall matches this. The stall here is a request held open in headless Chrome.

## Polish: block A, correctness found while planning (2026-11-03)

- **Fixed before any visual work, because a formatter can't catch a number that was read wrongly.** All of these passed the verifier, which proves a figure is printed on the page, not that it's the right row or column. The errors are listed in `EVAL.md`.
- **Equitas's figures are withheld, not corrected.** The page's text has every figure on its own line. ₹218 cr can be proved by hand, but rebuilding a table from loose numbers is the failure that caused this. The share of figures alone on a line is 0 to 33% on the other 14 tables and 100% here, so the rule sits at 80%. It runs before the model, so an unreadable page costs no call.
- **Withheld now means withheld in the data too.** A low-confidence view used to carry its figures to the browser and rely on the UI to hide them. They no longer reach the data file, so Copy as note and Explain this number can't surface them later.
- **HUL's revenue is summed by code and has to prove itself.** Parts plus other income must equal the printed total income line in all three columns, or the card goes low confidence. This fires on HUL only.
- **"Revised" has to earn the word.** It needs a later call and a period stated in the quote. Two different figures on one call read "Two statements on this call differ". A different figure with no period reads "no period stated". Three of the five labelled revisions keep the word: Coforge's FY27 EBIT and Dixon's IT hardware and telecom.
- **A general consistency check was added as a second net:** PAT can't exceed PBT, implied tax must be 10% to 35%, and a current figure can't repeat another column of its row. It catches Equitas on its own and Sterling Tools, which was already low, and changes no other card. Failing it withholds rather than corrects, because a real tax credit can fail it too.
- **Rank order didn't change on any of the 66 briefings.** Equitas stays #2 on the default screen and #1 on the 29 Oct ones. Its row always led with the price move: the wrong figure only ever appeared in the results table.
- **The audit is now a script, `audit_results.py`,** so the count can be reproduced. 104 of 104 figures match on the 9 cards that show any. It sets row labels by hand, reads the text layer and needs the local PDFs, so it stays out of CI. Recorded corrections are pinned in `test_results_recorded.py`, which does run in CI.
- **Left as is, for a decision:** Reliance's and L&T's PAT is the printed line before the share of associates. Reliance would read +33.8% rather than +32.1%. It matches its label, so the audit counts it as correct.
- **Left as is, not resolved by FINN:** BEL's p.21 closing passage also gives order inflow over ₹20,000 cr against ₹55,000 cr guided a call earlier. That statement never joined the order inflow row, so the row shows ₹55,000 cr with no later statement and no flag.

## Polish: blocks B and C, one formatter and a contrast check (2026-11-03)

- **Every number and date now goes through `fig.ts`.** There were about 80 call sites and 11 implementations, and they disagreed: 17% beside 8.8%, ₹872.7 beside ₹197.84.
- **The golden was written first, so the move could be measured.** It renders every screen over all 66 briefings and 5 scorecards with no DOM library, with toggles closed and open, and hashes the numbers a reader or screen reader meets. On 82,273 tokens across 336 screens, the move changed 1,500 tokens, all under the two rules approved: a price under ₹1,000 always has two decimals, and a margin always has one. Nothing else changed.
- **Whole-rupee prices are part of that rule.** ₹298 is now ₹298.00, 708 of the 1,500. The plan's example only showed ₹872.7 to ₹872.70.
- **Colour now takes its sign from the same function as the text.** A move that rounds to 0.0% is neutral rather than green or red. This hits 6 recorded sessions, including Bajaj Finance on 30 Oct, and the golden can't see it because it hashes numbers, not colours. Book's up and down tally still counts the raw move, so "0.0%" can count as up.
- **`crore` stays "up to one decimal".** The plan's table said "else 1", but a fixed decimal would turn 12 into 12.0, which is a third change nobody approved.
- **Months read Sep, not en-IN's Sept,** to agree with "Sep 2026 qtr". No recorded date hits this, but September filings on a live run would.
- **A guard fails on a raw format outside `fig.ts`.** CSS positions, SVG coordinates and one rule written in words are named exceptions, and an exception that stops matching fails too. Confirmed by adding `toFixed` and a raw ₹ to Book.
- **Server strings get their own grammar test,** since the guard can't see them. It passes on every recording. Reading the code for it found two gaps recordings don't exercise: a loss wrote a hyphen (PAT ₹-12 cr) and a lakh-crore target grouped the Western way (₹100,000 cr). Both are fixed in the backend. Demo data is unchanged.
- **The contrast test covers every pair, in both themes, from source.** The three known light-mode failures are fixed with a small change, not block G's palette: green moves about 3% darker (#15803d to #147c3b), which also shifts every green figure slightly, and the Met pill gets its own text token (#137438).
- **The matrix found a fourth failure, and my plan had been wrong.** The plan said every dark pair passed, but I hadn't checked tiles. `ink-2` on the strongest green Book strip tile is 4.25 in dark mode, so the tile's number is now `ink`. Detailed mode only.
- **Radius and easing tokens are named but unused,** so they add nothing to the page until blocks G and I. The existing 180 and 220 ms sheet timings stay until block I.
- **Limits.** The golden proves a figure kept its format, not that it's right; that's the audit. The matrix checks tokens at the tile's strongest tint, and it doesn't cover opacity-dimmed disabled buttons.

## Polish: block D, the Guidance Walk (2026-11-03)

- **Two cleanups first.** Book's tally now rounds as the moves on screen do, so a holding showing 0.0% is flat; 30 Oct reads 10 up, 7 down, 1 flat (Bajaj Finance at +0.02%). Dates printed in filings go through `fig.printedDates` and read "30 Oct". The year stays when it differs from the filing's year, because "effective 1 Apr" filed in October reads as a date gone by. Verbatim quotes keep the filing's own wording.
- **The "1 flat" took Today's first screen to 17 numbers, so a number went.** The Book line drops its date on days the as-of line above already gives it ("Book close: 10 up, 7 down, 1 flat"). A weekend or holiday still names its close. Measured at 390x844: 16 numbers. Words net one more than before.
- **Nine walks, chosen by rule, not by list.** A row is a walk if every step has a figure read from a verified quote and it either ended in a delivered figure or was revised and isn't due. That gives exactly 1 revised and delivered, 5 held and delivered, 3 revised and open, and leaves out BEL's FY27 EBITDA conflict, Asian Paints' 18-20% band, Coforge's cash-flow row and every milestone. Tests pin the nine and the exclusions. No model calls.
- **Kaynes' Q3 FY26 figure is recovered by rule.** The model read no figure from "we'll cross about INR4,000 crores minimum". The rule fires only if the quote names the period due and holds exactly one figure in the promise's unit. It fires on Kaynes and nothing else.
- **The "+" and "about" on a step come from the words beside the figure, not the recorded label.** "We maintain the EBITDA margin of 27% only" was recorded as 27%+. Five steps read more strictly in a walk than in their scorecard row: BEL EBITDA Q3 (27%), BEL capex Q3 (₹1,000 cr), Coforge FY26 Q3 (14%), Coforge FY27 Q4 FY26 (15.5%) and Q2 FY27 (16%). The figures that drive the arithmetic don't change, and the rows keep their recorded text.
- **Arithmetic only.** Margins in points, amounts in percent of the target, both from code. Steps are held or revised, never raised or cut, and a test runs every walk against a list of intent words. There's no score, and each row keeps the verdict it had, scored against the first promise.
- **"Missed both" sits beside the pill "Partially", on purpose.** Kaynes is below 100% of each statement, which is arithmetic. The verdict rule still reads Partially at 80% or more of the first promise, so the row says that under the steps: "The verdict is against the first promise: Partially means at least 80% of it."
- **A stepped line only where a target changed.** Kaynes and the three open walks. A target that held is one sentence ("Held on 3 calls: 15%+. Delivered 16.2%, +1.2 pts") with its steps a tap away, because three identical levels and a dot say less than the sentence. The planned thumb scrub is dropped: three or four steps don't need one, and each has its own chips.
- **A delivered figure says where it came from.** "Annual report FY26" with its page, or "Stated on Q4 FY26 call" with the speaker, whenever it comes from management. BEL's ₹900 cr capex is management's recollection ("I think we had"), and its quote shows that.
- **The scale doesn't start at zero, and the chart doesn't say so.** Every level prints its figure, the same as the company chart. The scale spans at least a tenth of the largest figure, so 15.5% to 16% doesn't look like a cliff. The line is ink, so no colour reads as a verdict.
- **Every later statement on a scorecard names its speaker.** BEL's FY27 conflict is Damodar Bhattad on p.5 and Manoj Jain on p.21. All later statements in the recordings have a name, so "Speaker not recorded" is a fallback nothing hits today. Speakers come from the recording. On the nine walks and the BEL conflict they were checked against the transcripts' own labels; Coforge's p.7 and p.8 have no label on the page and sit inside Saurabh Goel's prepared remarks, which start on p.6.
- **To fit the Research home, company rows lost their verdict counts.** A 16-number screen can't hold the front door and 13 verdict counts. Rows now say "6 checkable", and the counts are one tap down on the scorecard. The blurb also lost "over the last four quarters". Measured at 390x844: 13 numbers, 100 words with tab labels.
- **A walk link opens its row.** `#research/KAYNES/PQ1FY26-1` from the front door. The page moves only if the line wouldn't otherwise be on screen, so at 390x844 Kaynes keeps its header: the line ends at 526 px and the delivered step at 665 px, with the tab bar at 787. At 375x667 it scrolls to the row, and the company name goes off screen.
- **Limits.** The re-verification proves a quote is on its page, not that the row grouped the right statements together. "Held" compares the figure, not the wording: BEL's "27% only" and "more than 27%" both count as 27. Coforge's first FY26 statement is conditional ("if we manage to hit it this year"), and the Q3 call calls 14% "guidance for FY2026". A hand-kept label map names QRSAM on BEL's order inflow, because another row in that scorecard includes it; a test holds it to the quote.

## Polish: Guidance Walk, after review (2026-11-03)

- **"Missed both" is gone, which reverses block D.** Kaynes reads "80.6% of the first promise, 90.7% of the last statement". "Missed" is a verdict word, and it sat beside a Partially pill, so the row was arguing with itself. The figures say it. The note under the steps stays: "Partially means at least 80% of it".
- **The chart now says "Axis doesn't start at zero", which reverses "the chart doesn't say so".** The drop looked steeper than its 19%. Printing every level wasn't enough on its own.
- **An opened walk's title carries the company,** "KAYNES · Consolidated revenue, FY26", because at 375x667 the row opens with the header off screen. At 390x844 the title wraps to two lines. The delivered step now ends at 705 px, tab bar at 787.
- **The three group lines on Research home share one weight.** To keep them from competing, the Kaynes name line drops to regular. The figures line stays semibold.
- **"Over" follows the speaker's word, narrowly.** No walk quote says "over" about a figure. Coforge's "over any further EBIT improvement" isn't about the 14%. Dixon's Q4 FY26 quote says "more than INR4,000 crores", so that revised step reads "over ₹4,000 cr". "More than" on the held BEL steps keeps "+", so "Held on 3 calls: 15%+" stands. A literal "over" about a figure would read "over" on any step.

## Polish: block E1, a gold set to label blind (2026-11-03)

- **Two files, so the review isn't anchored.** The plan's single CSV of candidate labels would have shown FINN's answer beside each filing. `gold_blind.csv` shows no label and `gold_key.csv` stays apart. The blind file uses NSE's own subject line, never FINN's rewritten headline or a model's summary, because those carry FINN's reading. Its order is shuffled. Categories come from the glossary with made-up examples, so no example is a row in the sample.
- **Sampling is by FINN's label, on purpose.** It's the only way to see the thin labels at all: capex has 1 filing and credit rating 3. The cost is that a raw agreement figure won't estimate accuracy on all filings. The key records each label's size for weighting.
- **47 of 60 rows are "summary only", more than the plan implied.** The excerpts use only the 74 PDFs already on disk, as instructed. Those PDFs cluster where FINN needed to read the filing, so most sampled rows have none. On those rows the reviewer and the rules read the same line.
- **Nothing is scored until the labels are in.** There's no scoring script yet, and no agreement figure exists, on purpose.
- **Postal ballot found while checking the categories.** The glossary has it, a recorded HDFC Bank filing is one, and FINN's rules file it under `agm_egm`. It isn't changed now: changing the classifier before the labels would move what's being measured.
- **The verifier's statistics reproduce from the recordings:** 166 shown, 51 dropped, 17 of them "quote not found", and 38 of 39 filing reads.
- **Later the same day: the 47 summary-only rows got their PDFs.** On those rows the reviewer and the rules would have read the same line, so labels there would have measured little. Fetched at one request every 3 seconds, cached and not committed. 58 of 60 rows now have an excerpt, with the same ids and order. The other 2 have no extractable text. The key wasn't touched.

## Polish: Detailed is the default (2026-11-03)

- **A new visitor now sees Detailed, which reverses "Compact is the default".** A reviewer opening the link once should meet the results table, the synthesis and the book strip, with no tap needed to find out how much FINN knows. A saved choice still wins.
- **The choice moved onto Today,** as a Compact | Detailed control under the as-of line, and stays in How to read this. Burying it was how the depth stayed hidden.
- **The budgets now apply to Compact only.** Compact is 16 numbers and 104 words on the count used this session, which includes tab labels; the control added 2 of those words. The block-level figure of 95 words used an earlier count, so compare like with like. Detailed has no budget and isn't trying to meet one: 185 words and 53 numbers at 390x844, 146 and 42 at 375x667.
- **Cost:** Compact no longer quite fits at 375x667. The last line sits just under the tab bar.
- **Plan changed on 3 Nov: the deadline is today.** Block E stops at the gold set unless the labels come in. Blocks F, G apart from a monogram badge, H, I and J aren't built. The tag `submission-candidate` marks the app before the last small additions, each of which is its own commit.

## Polish: last small additions (2026-11-03)

Each is its own commit after the tag `submission-candidate`, so any can be dropped alone.

- **Monogram badges, and nothing else from the visual direction.** On Today rows, Book rows and the company file header. Row heights and positions are identical with and without them, measured on Today in both views and on Book. The first-screen cost is 3 words of badge letters. On the budget's count, without tab labels or dot separators, Compact is now 100 words and 16 numbers, so nothing was trimmed. Monograms over logos for the reason in the plan: a logo layer would be the only third-party request on a site that says nothing is live.
- **A 2-minute tour in the (i) sheet and the README.** Each step opens something the app already has. A company file has no link of its own, so in the README those steps say "Book, then the ticker". The sheet opens them directly.
- **Link previews use generated assets.** The share image is drawn by a committed script, with no artwork or company names. It says "A recorded demo", so a preview can't suggest a live product. The absolute image URLs assume the current Vercel address.

## Polish: how the gold set will be scored (2026-11-03)

Fixed before any label was filled in, so the rules can't bend to the result. No model calls. `cannot_tell` rows are excluded and counted. Counts, per-category agreement and every disagreement with both labels are shown, and no category under 20 items gets a percentage. Postal ballot rows are reported separately, because FINN's rules never assign that label. The result says plainly that 60 filings is a small sample drawn from FINN's own labels, and that agreement is not accuracy across all filings.

## Polish: monogram badges removed (2026-11-03)

- **Monogram badges were tried and removed because they did not look good, which reverses the entry above.** The layout is text-first: rows lead with the ticker in type. The share image and the tour never mentioned them. Compact's first screen is back to 97 words and 16 numbers at 390x844 and 375x667, on the budget's count. The golden diff is empty.

## Polish: the gold set wasn't labelled (2026-11-03)

- **A blind 60-filing gold set was prepared but not labelled in time, so no classifier accuracy number is reported.** This overrides the scoring plan above, which never ran. The files stay in `data/eval/`, with FINN's labels held back in a separate key. The app makes no accuracy claim. What stands is in `EVAL.md`: the results audit of 104 of 104 figures, read from the PDF text layer; the verifier's statistics, which prove a quote or number is on the page and not that it's the right column; the Equitas, HUL and BEL corrections; and the price rows and Book counts fixed against the company file. Ranking weights couldn't be evaluated, because there's no labelled preference data.

## Polish: dark by default (2026-11-03)

- **Dark is the default and light is one tap away.** A new visitor sees dark whatever the phone's own setting, which replaces following the OS. A saved choice wins, and the app works with storage blocked. The switch is an icon button beside (i), showing a moon or a sun for the active theme, plus Dark | Light in the (i) sheet.
- **An inline script in `index.html` sets the theme before first paint,** so a reader who chose light gets no dark flash. The `<html>` tag carries dark, so dark needs no script at all. A test holds the script's key and colour to `theme.ts`.
- **The share image stays light.** It's a preview on someone else's page, not the app. The icon was already dark.

