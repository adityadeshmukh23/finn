# Polish audit (phase 1, no code changed)

Branch: `polish` (cut from `main` at 7444acb). Audited 1 Nov 2026 against the built static site, served locally from `web/dist` and spot-checked on https://finn-olive.vercel.app (same bundle, `index-HXA_0Be2.js`).

Method: 390, 375 and 430 px viewports, light and dark, mouse-driven touch (drag for swipe), JS measurement of tap targets and overflow, every flow walked: briefing, window, date, results card, management card, price card, hidden filings, alert settings, ledger, Ask FINN, research list, research scorecard (expanded row), empty day. No screenshots arrived with the request, so everything below comes from the app itself. The `frontend-design` skill is not installed in this session; Phase 2 would use `dataviz` for the strip and bars and the judgement written down here.

## 1. What is good (keep it)

- **The research row.** Promised, delivered, verdict pill, then one tap to the verbatim quote, speaker, page link and "found by searching later calls". This is the best screen in the product and the one the brief says it values most.
- **Receipts everywhere.** Page-verified results table with QoQ/YoY, "Summary checked against p.N", "n.m." instead of a backwards percentage, low confidence shows no numbers, claims "dropped by the verifier" are listed.
- **The hidden-filings row.** Counting what was filtered, grouped by reason, inspectable. A real product idea.
- **Hygiene.** No horizontal overflow at 375/390/430. 96 KB transferred, DOM ready in about 0.8 s. Indian digit grouping (3,32,861). Skeleton, empty and error states exist. Dark mode is competent. Safe-area insets handled. Hash routing makes back work.
- **Architecture** is the strongest axis by a distance: rules, cheap model, strong model, verifier, recordings, fallbacks, CI guards, $0.

## 2. Verdict, bluntly

Scores are my judgement, out of 5, against what the brief says it grades.

| Axis | Score | Why |
|---|---|---|
| Architecture / judgment | 4.5 | Rules-first, verified extraction, honest failure, tested. Almost all of it lives in the docs, not in the product. |
| Product sense | 3 | Briefing-first is right. But the "Ask" half is a dead end, the best feature is at the bottom of the scroll, and ranking ignores how much a name matters to the book. |
| Creativity | 2.5 | The interesting ideas are under the hood. The surface is a conventional filtered feed with one gesture. |
| Mobile-first feel | 2.5 | Fits at 375. Does not feel designed for a thumb: chrome on top, no bottom navigation, 27 of 34 tap targets under 44 px, one gesture. |
| Density and design / "no AI slop" | 3 | Copy is mostly good and number-first when it can be. Hierarchy is flat, the palette is beige and black pills, and some sentences repeat verbatim. |

**The one-sentence version:** it is a rigorous engine behind a competent but generic feed, and the reviewer will feel the engine only if they dig for it.

## 3. Where it feels like a template (measured, not vibes)

1. **A desktop dashboard squeezed onto a phone.** The top of the home screen is an admin bar (title, "$0.00 spent", "Alerts" outline pills), a three-line developer note ("`./run.sh research TICKER` (see README)"), a segmented filter and a native date input, then a stats line, then two status badges. **Card 1 starts at 382 px of 812 (47%) at 375 wide.** The first screen contains one card and no thumb-reachable control except "Ask FINN".
2. **A feed of identical cards.** Nine white rounded rectangles with the same anatomy (category chip, time, ticker and name, market line, headline, why, rank line, links, black pill). Rank 1 and rank 9 look the same. The rank number, the product's central idea, is 12 px grey text at the bottom of the card.
3. **Colour carries no information.** Every high-tier card has the same orange dot, whether it is results, legal, management or price. The "hot" orange is also used for a **+0.9%** stock move ("Stock 3.4× volume, price +0.9%"), so alarm colour is applied to a rise. Green and red appear only inside the results table.
4. **The first screen's #1 card has no numbers.** Sun Pharma's results are low confidence ("figures not shown"), so the hero of the app is a grey box. Reliance, directly below, is the best card in the product.
5. **Repeated boilerplate.** "No HOMEFIRST filing in this window. Check for news, block deals or a sector move." appears four times on the default screen. "1 duplicates dropped" is also a grammar slip.
6. **Briefing first, chat second is not felt.** The briefing half is. The second half is absent: **"Ask FINN" is on every card, and on 49 of the 50 cards across all 22 days (24h windows) it opens an apology sheet** (only Asian Paints is both in the portfolio and in the research set; BEL, Kaynes, Coforge and Dixon are not holdings). With the 7-day window it is 2 of 173. The most prominent affordance mostly fails, and the failure message is a shell command.
7. **The signature feature is buried.** "Promised vs delivered" sits after the hidden row, at scroll position ~3,000 of 3,538 px. There is no navigation to it. It looks like a plain list.
8. **Nothing is thumb-reachable.** Window, date, alerts and ledger are all in the top 130 px. "← Briefing" is top-left. No bottom bar, no pull, no bottom sheet gestures.
9. **The cost story is invisible.** The ledger sheet in the public build says "$0.00" and "Run FINN locally to see the live ledger". The real numbers (1.19 M input and 230 k output tokens, 145 live calls, 190 of 229 filings never reaching a model) are only in `docs/COST.md`. Cost efficiency is a graded criterion and the product shows none of it.

## 4. Specific defects and honesty nits (each is small; together they are the polish gap)

| # | What | Where | Fix size |
|---|---|---|---|
| 1 | Tap targets: 27 of 34 under 44 px; "Filing ↗", "+1 more", "p.12 ↗" are 14–17 px tall; Ask FINN 28 px; window tabs 28 px; header pills 30 px | `BriefCard.tsx:110-125`, `App.tsx:170-221` | S |
| 2 | Dismiss is swipe-only: no button, no hint, not keyboard or screen-reader reachable | `BriefCard.tsx:45-65` | S |
| 3 | Relative times ("6h ago", "49m ago") on a recorded replay read as live. The badge says "Demo data", the card says "49m ago" | `format.ts` `when()` | S |
| 4 | Header says "Briefing as of 27 Oct" while the badge says "Demo data as of 30 Oct, 8:29 pm" | `App.tsx:174`, `SourceBadge` | S |
| 5 | Filing text leaks into UI: "effective **26 th** October, 2026" | `People.tsx` (effective printed as extracted) | S |
| 6 | Price card with no filing says "check for news" when FINN holds the answer: Equitas on 30 Oct is **−6.3% on 42× volume, one day after the MD and CEO resigned (−12.2% on 49× on 29 Oct)**, both in our own data | `market.ts` card text; needs a lookback | M |
| 7 | Ranking ignores importance to the book: on 27 Oct Sterling Tools' CFO swap (small cap) ranks #1 above HDFC Bank's MD and CEO exit (large cap). `size` is in the data and unused | `digest.py` weights | M |
| 8 | Ranking ignores magnitude when a filing exists: Deepak Nitrite, **24× volume**, ranks #9 (its filing is a results deck, and a threshold adds a flat +6) while Home First at 3.5× with no filing is #5 | `market.ts` bonus | M |
| 9 | Low-confidence results can take the hero slot (Sun Pharma #1) | ranking tie-break | S |
| 10 | Research index headline "Met 0 of 1 checkable promises" for Kaynes hides that the one promise was **partially** met (80.6% of target) | `Research` index copy, `App.tsx:297` | S |
| 11 | The replay note is developer-facing and 4–5 lines tall on every load | `App.tsx:197-204` | S |
| 12 | Sheets: no entrance motion, no drag-to-close, no focus trap, no scroll lock | `Sheet.tsx` | S |
| 13 | No error boundary. A render error blanks the app. I saw this happen once: this browser still held the previous caching service worker, loaded the old `index-CQvNS2wJ.js` and logged `TypeError: Cannot read properties of undefined (reading 'length')`; the kill switch then healed it (0 workers, 0 caches, current bundle `index-HXA_0Be2.js`, clean console). Good evidence the kill switch works; also a reason for a boundary | `main.tsx` | S |
| 14 | `Inter` is named in the font stack but never loaded (`document.fonts` is empty), so the type is the platform default | `index.css:4` | S |
| 15 | Empty day says "A quiet window" for Sunday 11 Oct. Weekends and NSE holidays are computable | `App.tsx:249-265` | S |

## 5. Design language: "Ledger"

One idea: **a finite morning ledger with receipts.** Paper and ink; numbers are the hero; every figure carries its source.

**Type.** One family (system stack today; optionally one variable Inter subset under 30 KB, `font-display: swap`). Tabular numerals everywhere. Four sizes only: *Figure* 28/32 semibold (the one number a row is about), *Title* 17/22, *Body* 15/22, *Meta* 12/16. Nothing below 12 px except the legal footnote line. Sentence case; no ALL-CAPS chips.

**Colour.** Keep the warm paper (`#f6f5f2`) and near-black ink; they are already right. Make colour *mean* something: green and red only for the sign of a number; amber only for "unverified or low confidence"; one ink-coloured "rank spine" on the left edge of each row whose thickness shows rank (a 4 px spine on #1, hairline by #9). Category is a text label, not a coloured dot. No gradients, no purple, no glass.

**Density.** Rows, not cards. A row is 72–104 px: kicker (ticker, event), one figure line, one evidence line. Only the top three rows start expanded. Everything else opens in a bottom sheet. 8 to 10 rows fit in two screens.

**Motion.** Four moves, all CSS, all under 250 ms: sheet rises with ease-out; a cleared row collapses its height; a saved row nudges and pins; the book strip tiles fade in once, staggered by 15 ms. No count-up numbers, no confetti, no spinners where a skeleton will do. Respect `prefers-reduced-motion`.

**Iconography.** A set of 12 inline SVG icons at 1.5 px stroke (home, grid, file-search, bell, play, pause, check, bookmark, x, external-link, chevron, info). No emoji, no text arrows ("↗" becomes an icon).

**Copy.** Lead with the number. Say what the data is, never tell the investor to go and look elsewhere. No "Please", no "Check for news". "Equitas −6.3% on 42× volume. The MD and CEO resigned yesterday." not "No EQUITASBNK filing in this window".

**Thumb zone.** Navigation and primary actions live in the bottom 40%. A bottom tab bar: **Today · Book · Research · Alerts**. Top of the screen is for reading only. Every control 44 px minimum.

## 6. Interaction models for the home screen

| | A. Triage deck | B. Book first, ranked rows, sheets (recommended) | C. Copilot home |
|---|---|---|---|
| What | One full-screen card at a time, swipe right to keep, left to clear, up to ask | A one-line synthesis and a 18-tile book strip on top, ranked rows below, depth in bottom sheets, swipe to triage | A chat that opens with a spoken-style summary; cards arrive as messages |
| First 10 seconds | Shows one thing only | What changed (sentence), what matters (strip + top 3), what to do (tap, swipe) | A paragraph of text |
| Strengths | Very distinctive, finite, one-handed | Scannable, position-aware, dense, finite via the "briefing is done" state | Looks like "an agent" |
| Weaknesses | No comparison or scanning; "Tinder for filings" gimmick risk; 9 items fine, 30 not | More to build than a restyle | Free-text answers need a model the static site does not have; fake canned replies would be dishonest; contradicts the "briefing first" thesis |
| Effort | L | M-L | L, and risky |

**Recommendation: B**, with A's best idea (finite, clearable, with an end state) and one voice add-on ("Brief me", read aloud). The point of view in one line: **FINN's job is to let you stop looking.** Success is time-to-done, and "done" is a screen the app is proud of: "9 handled. 11 filtered for you. Nothing else is waiting."

Wireframe (current vs proposed, real 30 Oct values) is in the chat. The synthesis sentence is templated from card data by rules, no model, and every clause links to the row it came from.

## 7. Candidate features

Effort: S 1–2 h, M 3–4 h, L 5 h+. "Impact" is my 1–10 judgement of how much it changes what a reviewer remembers; points per hour is just impact divided by hours. Model calls and cost are $0 on all of them unless stated: nothing here needs a runtime model, and the static site could not call one anyway.

### F1. Company file sheet: Ask FINN never dead-ends  (impact 9, ~3 h)
- **What.** Ask FINN (and tapping a ticker or a book tile) opens a sheet with everything FINN verifiably holds about that company: this filing's verified quote and page; results figures if confident; every filing from the company across the 22 recorded days as a timeline; the 20-session close and volume multiple as an inline-SVG sparkline with filing markers; research summary and link if recorded; otherwise one honest line, and the command in a collapsed "How to research this" disclosure.
- **Investor value.** The question after any alert is "what else has happened here?". It also fixes defect 6 (Equitas gets its own context).
- **Reviewer value.** Removes the biggest fracture in the product and delivers "company timeline combining filings, price and volume" with no new modelling.
- **Data.** Needs one additive file from `build_static.py` (`demo/company/<SYM>.json` or one `timeline.json`, tens of KB). Prices already in `market.json`.
- **Risk.** Low: additive; if the file is missing the sheet shows what it has.
- **Files.** `backend/scripts/build_static.py`, new test, `web/src/components/CompanySheet.tsx`, `web/src/api.ts`, `App.tsx`, `BriefCard.tsx`, and the regenerated `web/public/demo/` committed (CI checks freshness).

### F2. Today hero: one-line synthesis and the book strip  (impact 9, ~3.5 h)
- **What.** A rules-templated sentence ("Equitas fell again, −6.3% on 42× volume, a day after its CEO resigned. Reliance PAT +32.1% YoY.") and an 18-tile strip of the holdings, shaded by the day's move, a dot where there is a filing. Tapping a tile opens F1. Replaces the stats line and the "Nothing from 4 holdings" line.
- **Reviewer value.** It answers "what changed, what matters" in the first 10 seconds and shows the mock portfolio at all (today nothing on screen lists the 18 holdings).
- **Risk.** Low-medium: it changes the top of the home screen. Synthesis is a pure function; unit-test it. Never invent: each clause must come from a card.
- **Files.** new `web/src/synthesis.ts` and `BookStrip.tsx`, `App.tsx`; add `vitest` as a dev dependency and run it in CI.

### F3. Triage and a "briefing is done" state  (impact 6, ~2.5 h)
- **What.** Swipe right to save, left to clear, plus visible buttons for both (fixes defect 2). Progress "4 of 9 handled". At zero: "9 handled, 11 filtered. Nothing else is waiting." A Saved list lives under Today. Stored in `localStorage` (as dismissals are now).
- **Reviewer value.** The point of view made tangible: a briefing you finish.
- **Risk.** Low. Keep it per-filing id so it survives window changes.
- **Files.** `BriefCard.tsx`, `App.tsx`, small `triage.ts`.

### F4. "Explain this number" sheet  (impact 7, ~3 h)
- **What.** Any figure is tappable. Sheet shows: value, comparators, the arithmetic ("29,250 vs 22,146 a year ago → +32.1%", computed in the browser from fields we already ship), the page where it is printed with a deep link, and the confidence reason. In research it shows the quote, speaker, page and how the verdict was set.
- **Reviewer value.** "Code does all arithmetic" becomes visible and checkable. Strongest answer to "can I trust this?".
- **Risk.** Low. EBITDA components (PBT, finance costs, D&A, other income) are not in the shipped JSON today; a base version shows formula and comparators, a stretch ships the four inputs from `results.py`.
- **Files.** `web/src/components/ExplainSheet.tsx`, `ResultsTable.tsx`, `Research.tsx`; optionally `backend/finn/results.py` and a rebuild.

### F5. Alert tuner with a live backtest  (impact 5, ~2 h)
- **What.** In Alerts, moving the steppers shows "At 2× and ±4%, this would have fired 9 times on 6 holdings in the last 22 sessions" and the dates. Computed client-side from `market.json` with the existing `market.ts` functions.
- **Reviewer value.** "I decide what unusual means" gets feedback instead of a bare stepper. Best points-per-hour of the product features.
- **Files.** `AlertsSheet.tsx`, `market.ts`.

### F6. Visible build ledger  (impact 6, ~1.5 h)
- **What.** Replace the empty "$0.00" sheet in replay with the real aggregates from the build ledger: the routing funnel (229 filings → 190 by rules alone → 39 to the cheap model → 14 strong-model calls), calls by model and outcome, tokens in and out, "$0 on free tiers", and the caveat that our ledger undercounts Google's.
- **Reviewer value.** Cost efficiency is graded; today it is a markdown file.
- **Data.** A small committed `data/snapshots/ledger.json` exported from the gitignored sqlite (aggregates only, no keys, no prompts), copied by `build_static.py` so CI's freshness check still passes. Do not put it in `web/public/demo` directly: `build_static` wipes that folder.
- **Files.** new `backend/scripts/export_ledger.py`, `build_static.py`, `LedgerSheet.tsx`.

### F7. "Brief me": a 45-second spoken briefing  (impact 6, ~3 h)
- **What.** A play button in the Today header reads the top five rows with the browser's built-in speech synthesis, scrolling to and highlighting each row. Text is templated from the same card data, numbers spoken properly ("rupees 29,250 crore, up 32 percent year on year"), opens with "As of 30 October" so it never sounds live. Feature-detected and hidden where unsupported.
- **Reviewer value.** The brief names voice. This is hands-free, free, deterministic, and honest.
- **Risk.** Low, isolated. Voice quality varies by device; iOS needs a user gesture, which a button gives. Ship behind `?lab=1` first.
- **Files.** new `web/src/speak.ts`, `BriefPlayer.tsx`, `App.tsx`.

### F8. Book-aware ranking  (impact 7, ~3 h)
- **What.** Fix defects 7, 8, 9: weight events by position size, scale a threshold bonus by magnitude on cards with filings (24× volume must not sit at #9), and stop low-confidence results taking the hero. Weights come from a `weight` field per holding in `data/portfolio.json` (a mock portfolio is the investor's own input, not outside knowledge) with a size-based default, adjustable on the Book tab and stored locally. Re-rank in the browser as `applyAlerts` already does, so no demo data churns.
- **Reviewer value.** "A CFO swap at a 1% position should not outrank the CEO exit at a 12% position." That is judgement, visible in the order.
- **Risk.** Medium: ranking changes what everyone sees. Unit tests on a fixture of the 27 and 30 Oct days; the "why #N" line must stay true.
- **Files.** `rank.ts`, `market.ts`, `alerts.ts`, `data/portfolio.json`, tests.

### F9. Results scoreboard  (impact 5, ~3 h)
- **What.** "Results so far: 11 of 18 reported": a sortable grid of revenue and PAT YoY, margins and QoQ, with confidence marks; low-confidence shown as "see page"; and "yet to report" listing the rest, computed from the portfolio.
- **Reviewer value.** What a PM wants during results season; the cards spread it over a scroll.
- **Files.** `Scoreboard.tsx`, `App.tsx`.

### F10. Promise bars and a guidance diff  (impact 6, ~4 h)
- **What.** Research home with a segmented bar per company (met, partially, missed, vague, not found) as counts, not a score (1 to 6 promises each makes a single "credibility" number an overclaim). A "guidance moves" feed shows a revision as before and after verbatim quotes with the changed figure highlighted (Kaynes "₹4,500 cr+" to "about ₹4,000 cr minimum"), all from recorded rows.
- **Reviewer value.** Gives the star feature a front door and a second, differentiated view ("what changed between calls").
- **Files.** `ResearchHome.tsx`, `diff.ts` plus tests, `Research.tsx`.

### F11 (needs your go-ahead). Research three more holdings  (impact 8, ~6 h, mostly wall-clock and review)
- **What.** The pipeline already does any NSE ticker. Cards by holding across the 22 days: **Polycab 8, Infosys 5, Reliance 4**, Naukri 4, Maruti 4. Recording Polycab, Infosys and Reliance moves Ask FINN's hit-rate from **1 of 50 cards to roughly 18 of 50 (36%)**. Infosys and Polycab give numeric guidance, which suits the lens (DESIGN already notes Asian Paints is thin).
- **Cost and risk.** Free tier: about 6 cheap and 2 to 3 strong calls per company, subject to the daily quotas that bit us before; every row needs the same read-against-quotes review as before. No demo risk (recordings are additive), but a bad row would hurt credibility, so budget the review.

### Ranked by impact per hour

| Rank | Feature | Impact | Hours | Per hour |
|---|---|---|---|---|
| 1 | F6 Visible build ledger | 6 | 1.5 | 4.0 |
| 2 | F1 Company file sheet | 9 | 3 | 3.0 |
| 3 | F2 Today hero | 9 | 3.5 | 2.6 |
| 4 | F5 Alert tuner | 5 | 2 | 2.5 |
| 5 | F3 Triage and done state | 6 | 2.5 | 2.4 |
| 6 | F4 Explain this number | 7 | 3 | 2.3 |
| 6 | F8 Book-aware ranking | 7 | 3 | 2.3 |
| 8 | F7 Brief me | 6 | 3 | 2.0 |
| 9 | F9 Results scoreboard | 5 | 3 | 1.7 |
| 10 | F10 Promise bars and diff | 6 | 4 | 1.5 |
| 11 | F11 Research three more holdings | 8 | 6 | 1.3 |

Ranking by points per hour alone would front-load small things. The recommended plan adds a prerequisite the table does not score, the design foundation, and orders by what completes the point of view.

## 8. Recommended plan

**The 8-hour plan (ship this):**
1. **Foundation, ~3 h.** Tokens and the four-size type scale; compact number-first rows (top three expanded); 44 px targets; bottom tab bar (Today, Book, Research, Alerts) with Research and Book as real destinations; replay note collapsed to one badge with details in a sheet; absolute times; copy cleanup (defects 1, 3, 4, 5, 10, 11, 12, 14, 15); error boundary (13); sheet motion.
2. **F1 Company file sheet, ~2.5 h.** Including the price-card lookback.
3. **F2 Today hero, ~1.5 h** for the synthesis line and the strip (book weights come later with F8).
4. **F6 Visible build ledger, ~1 h.**

If time slips, cut in this order: F6, then the strip's dots, then sheet motion. The foundation and F1 are the product.

**Stretch, in this order:** F3 triage and done state (2.5 h) → F5 alert tuner (2 h) → F4 explain this number (3 h) → F8 book-aware ranking (3 h) → F7 Brief me (3 h, ship behind `?lab=1`) → F10 promise bars and diff (4 h) → F9 scoreboard (3 h) → F11 research three more holdings (needs your OK).

The first three stretch items finish the story: you *finish* the briefing, you *tune* what counts as unusual, you can *check* any number.

## 9. Do not do

- **Free-text chat on the static site.** No key and no backend; canned replies dressed as chat would be dishonest. A local-only chat through the existing gate is the only honest version and the reviewer will not see it.
- **Any-ticker in the browser.** NSE needs cookies and may refuse cloud IPs; the local `./run.sh` path already answers the brief.
- **Hosted API or Render for the public link.** Cold start and unverified NSE access put the link at risk.
- **A service worker or offline mode.** We just removed one on purpose.
- **Live-looking anything.** No pulsing live dot, no ticking clock, no "just now", no fake refresh.
- **Single "credibility score" or buy/sell/target language.** Tiny samples; and the glossary and brief ask for filtering, not advice.
- **Outside-knowledge enrichment** (news, broker notes, web bios, LinkedIn). Breaks the primary-source rule.
- **Heavy libraries.** No chart library (inline SVG), no animation library, no UI kit, no framework swap. Keep the JS bundle under about 130 KB gzipped (it is about 86 KB).
- **A rewrite of the ranker or classifier.** Client-side adjustments only; the recorded data and its CI freshness check stay as they are.
- **Touching `vercel.json`, `public/sw.js`, `check-sw.mjs`.**
- **Committing anything from `data/cache` (PDFs, sqlite, `.env`).** The CI guard stays.

## 10. Protecting the working demo

- **Branch and previews.** Everything on `polish`; `main` and the production link are untouched until you merge. Test each push on the Vercel branch preview on your phone.
- **One feature per commit.** Each independently revertable. Data changes are **additive**: new files only, no field renamed or removed, so a web-only revert still reads the current data and old web code still reads the new data.
- **Regenerate data in its own commit** (`python -m scripts.build_static`) so CI's `git diff --exit-code web/public/demo` stays green and a bad data commit can be dropped alone.
- **CI stays as is** and gains: `npm test` (vitest) for the pure functions I add (synthesis, ranking with weights, explain arithmetic, guidance diff), and a bundle-size ceiling check. I run every CI step from a clean clone (`git clone` to a temp dir, no `.env`) before each push, as before.
- **Phone-width check before every commit** at 375, 390 and 430, light and dark: no horizontal overflow, console clean, tap targets measured with the same script as this audit.
- **Graceful degradation.** Every new data fetch has a `.catch` that shows what is already loaded. New root-level error boundary: a render error shows a one-line "Something went wrong. Reload." and a link to the raw briefing instead of a blank page.
- **Labs flag.** Experimental items (Brief me, scoreboard) ship behind `?lab=1` and are off by default, so the default link only shows what has been reviewed.
- **Honesty gates.** Every sentence the synthesis can produce is a template filled from a card's own fields, and every clause links to its row. Recorded time is shown as a time, never "ago".

## 11. What I need from you

1. Direction: go with **B** (Today / Book / Research / Alerts, compact rows, sheets) as the home model?
2. Plan: the 8-hour plan as written, or swap an item?
3. Stretch: which two or three after the plan? My order is F3, F5, F4.
4. F11: OK to spend free-tier quota on recording Polycab, Infosys and Reliance research? If yes, tell me when your daily quota is fresh.
5. Naming: "Today" or "Briefing" for the home tab?
