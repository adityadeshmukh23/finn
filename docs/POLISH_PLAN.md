# FINN polish plan

**Approved 3 Nov 2026, in this order: A, then B and C, D, E, F, G, H and I, J.** K is below the line. K5 (logos) is not built: monograms only. Block A gains A4, a general consistency check on every results card, if it fits in about 20 minutes.

This is the text of the review page as approved, kept as written on that day. Status of each block lives in `DECISIONS.md` and `END_NOTES.md`.

Planning only: commit df9564b, no code changed. Every figure below comes from the recordings, the source PDFs or a measurement taken this session. Your phone and friend notes were still template text in the request, so nothing here relies on them.

## Read this first

**A wrong number is live.** Equitas shows **PAT ₹184 cr, +660.6% YoY** for the Sep 2026 quarter. That ₹184 cr is the June quarter's profit. Page 3 of the filing gives PBT 28,738.39 less tax 6,934.42 = 21,803.97 lakh, so the quarter is **₹218 cr, +803.4% YoY, +18.8% QoQ**. The OCR scrambled the column order, and the verifier only checks that a number is on the page, so it passed. This shows in the results table on 5 recorded briefings and in the Equitas company file from 29 Oct onward. Equitas is the #2 row on the default screen and a likely tap in your demo.

Three more things found while checking the data:

- **HUL's revenue is only "Sale of products".** FINN shows ₹18,037 cr, +14.8% YoY. The three lines under "Revenue from operations" total ₹18,226 cr, which is +14.5% YoY and +5.1% QoQ (shown: +5.2%).
- **BEL's FY27 EBITDA row says "Revised to 21%–23%". That label is unsafe.** Both statements are on the same Q1 FY27 call: p.5 keeps 28%, and in the closing remarks on p.21 the speaker says the outlook is unchanged while giving 21%–23%. This is a conflict on one call, and FINN shouldn't call it a revision.
- **Formatting already disagrees with itself.** On the same line: "EBITDA margin 17%" beside "PAT margin 8.8%". In Book: ₹872.7 beside ₹197.84.

**One change to your order:** I put these fixes (block A, about 1 hour) ahead of the formatter. A formatter can't catch a number that was read wrongly. Everything after block A follows your order.

**The Walk's honest size:** 111 recorded promises yield 9 usable walks. Only one goes promise → revision → delivered: Kaynes revenue. That one is strong enough to anchor the demo.

## Ranked plan

One row is one commit, and every commit can merge alone. Data regeneration stays in its own commit so it can be dropped alone. [finger] means it needs a real device to judge.

| # | Commit | Hrs | Demo risk | Files | Judge |
|---|---|---|---|---|---|
| **A. Correctness found today · 1.0 h · Tue** |  |  |  |  |  |
| A1 | A results page with no row structure (one token per line, like Equitas) goes low confidence: figures withheld, no model call | .4 | Low. Equitas table disappears; rank rules already handle it | `results.py`, `test_results.py`, recording, then data commit |  |
| A2 | Revenue printed only as parts is summed by code (HUL), as research already does for Asian Paints | .3 | Low. One card's figures change | `results.py`, recording, tests, data commit |  |
| A3 | "Revised" needs a later call and a stated period. Same-call differences read "Two statements on this call differ" | .3 | Low. Wording only | `pvd.py` or `Research.tsx`, tests |  |
| **B, C. Formatter and tokens · 2.5 h · Tue** |  |  |  |  |  |
| B1 | Figures golden: render every screen over all 66 briefings and 5 scorecards, hash the numeric tokens. No behaviour change | .5 | None | `__tests__/figures.golden.test.ts` |  |
| B2 | `fig.ts` with unit tests, unused so far | .5 | None | `fig.ts`, `fig.test.ts` |  |
| B3 | Route all sites through it. The golden diff must show only the listed changes: margins and prices under ₹1,000 | .5 | Medium. Touches every screen; golden holds it | All components, `market.ts`, `figure.ts`, `format.ts` |  |
| B4 | Guard test: a raw format call outside `fig.ts` fails. Confirm by adding one | .25 | None | `__tests__/no-raw-figures.test.ts` |  |
| C1 | Tokens plus AA matrix test; fix the 3 failing pairs. Appearance otherwise unchanged | .75 | Low | `index.css`, `Research.tsx`, `__tests__/contrast.test.ts` |  |
| **D. Guidance Walk · 2.5 h · Wed morning** |  |  |  |  |  |
| D1 | Walk builder: steps from recorded rows, targets parsed by rule, figure recovered from a verified quote by rule, delivered vs first and vs last computed by code. No model calls | 1.25 | None. Additive data | `research/walk.py`, `build_static.py`, tests, data commit |  |
| D2 | Walk in the expanded scorecard row: stepped SVG, quote chip and page link at each step | 1.0 | Low | `GuidanceWalk.tsx`, `Research.tsx`, `api.ts` | [finger] |
| D3 | Front door on Research home: 1 revised and delivered, 5 held and delivered, 3 revised and open | .25 | Low | `ResearchHome.tsx` |  |
| **E. Measured quality · 2.0 h, plus 30–45 min of your review · Wed** |  |  |  |  |  |
| E1 | Sample 60 filings with a fixed seed, candidate labels, CSV for you. No accuracy number exists yet | .5 | None | `scripts/eval_gold.py`, `data/eval/gold.csv` | You review |
| E2 | Score the gold set, audit results cards against the printed figures, compute verifier statistics | .75 | None | `scripts/eval.py`, `demo/eval.json`, tests |  |
| E3 | `docs/EVAL.md` and "How much to trust this" behind the (i) sheet | .75 | Low | `TrustSheet.tsx`, `HowToRead.tsx`, docs |  |
| **F. Explain this number · 1.25 h · Wed afternoon** |  |  |  |  |  |
| F1 | Ship the EBITDA inputs and the 20-day volume baseline as additive fields | .25 | None | `results.py`, `build_static.py`, data commit |  |
| F2 | Tap a figure in the results table or company file: sheet with arithmetic, page and check. A test recomputes every shown % over every recording | 1.0 | Low | `ExplainSheet.tsx`, `ResultsTable.tsx`, `explain.ts` | [finger] PDF jump |
| **G. Visual direction · 2.75 h · Wed evening to Thu morning** |  |  |  |  |  |
| G1 | Palette: light base, one accent, dark elevation | .5 | Low. Token swap, AA test guards it | `index.css` | [finger] |
| G2 | Monogram badge: stable hash, contrast tested | .25 | None | `Badge.tsx`, `badge.ts`, test |  |
| G3 | Row anatomy on Today. First-screen counts re-measured | .75 | Medium. The first screen; swipe must survive | `BriefRow.tsx`, `Today.tsx`, `portfolio.json` short names | [finger] |
| G4 | Same row on Book and Research, with sparklines on one shared scale | .5 | Low | `Book.tsx`, `ResearchHome.tsx`, `Sparkline.tsx` |  |
| G5 | Company file header, big last close, range chips | .75 | Low. Chart logic stays tested | `CompanySheet.tsx`, `CompanyChart.tsx` | [finger] |
| **H, I. Checks and motion · 1.5 h · Thu morning** |  |  |  |  |  |
| H1 | Microcopy test over all recordings; skeletons match the new layouts | .4 | Low | `__tests__/copy.test.ts`, skeletons |  |
| H2 | Performance check script: 4× CPU, slow 4G, 375 px | .35 | None | `scripts/perf.mjs` | [finger] scroll |
| I1 | Pressed states, number settle, chart draw, row expand. CSS only | .75 | Low. Figures in the golden stay identical | `index.css`, 3 components | [finger] |
| **J. Small feature · 0.5 h · Thu before midday** |  |  |  |  |  |
| J1 | Copy as note | .5 | Low | `note.ts`, `BriefRow.tsx`, `CompanySheet.tsx` | [finger] iOS clipboard |
| **14.0 h. The line falls here.** Below it, only if ahead of plan:** |  |  |  |  |  |
| K1 | My book in rupees | 1.5 | Low | `Book.tsx`, `book.ts` | [finger] |
| K2 | Due next (promise calendar) | 1.0 | Low | `ResearchHome.tsx` |  |
| K3 | Alert backtest line | .75 | Low | `Alerts.tsx`, `market.ts` |  |
| K4 | Sheet follows the finger (the one motion needing JS, about 0.4 KB) | .5 | Medium. History and scroll conflicts | `Sheet.tsx` | [finger] |
| K5 | Logo layer behind a flag. I recommend not building it | 1.0 | Medium. See below | `Badge.tsx`, docs, test | [finger] |

### If time gets tight

Cut in this order: K items, J1, I1, H2, then G4's sparklines, then G5's chips. **Always keep** A, B, C, D, E and F. If G3 looks wrong on your phone at Thursday 10:00, revert it: the palette and badge changes still ship on the old rows.

### Do not do

- Digit roll-ups or count-ups on any figure. An in-between number is a false number.
- A credibility score, or a rate of management honesty. Samples are 0 to 6 checkable promises per company.
- Rank weighting by position size this week. It would invalidate the checks in `ranking.test.ts` two days before the deadline.
- New recordings or any strong-model call.
- Chart libraries, web fonts, animation libraries, image files.
- Area fills under price lines: the axis doesn't start at zero.
- Red and green on sparklines or chart lines.
- "Listen for", voice, or more research lenses before the freeze.
- Touching `vercel.json`, `sw.js` or `check-sw.mjs`. That also rules out adding a CSP header.

### Every commit

- The eight width-and-theme combinations pass.
- The CI steps pass from a clean clone before each push.
- Figures golden unchanged unless the commit message lists the change.
- `check:size` under 130 KB. Now 100.5 KB; this plan adds about 8 KB, reaching about 109 KB.
- The first-screen word and number counts are checked after G3 and I1.
- `DECISIONS.md` and `END_NOTES.md` updated at each block; you push and merge.

### Bundle estimate, gzip

- Formatter: about 0, it replaces 11 implementations
- Walk 2.5 KB, trust sheet 1.2, explain 1.2
- Badge, sparkline and chips 1 KB
- Motion and tokens 0.8 KB, note 0.5 KB
- Walk and evaluation data load as files, outside the bundle

## Mockups

The before and after mockups (Today, company file, Book, Guidance Walk, monogram against logos) are on the private review page and aren't copied here: they are images. "Now" was a real screenshot of df9564b; "Proposed" was drawn at real width from the same recordings.

## Part 1: premium feel with a correctness guard

### Formatter

**Counted:** about 80 call sites across 11 separate implementations: 3 percent formats with different zero rules, 4 rupee formats with 2 rounding rules, 2 margin formats, a multiple, a dollar, and 4 raw date calls. Three more live in the backend (`results.py` sign and crore, `pvd.py` `fmt_num`) and reach the screen as headlines, targets and delivered text.

| Function in fig.ts | Rule | Change from today |
|---|---|---|
| `pctChange` | 1 decimal, + or U+2212, no sign when it rounds to zero. Returns text and sign, so colour can't disagree | Table colours 0 green and Research writes +0.0%. No recorded value hits this today |
| `margin` | Always 1 decimal | 17% becomes 17.0% |
| `multiple` | Whole at 10× and over, else 1 decimal | None |
| `price` | Under ₹1,000 always 2 decimals. Rows round at ₹1,000 and over; the file header always shows 2 | ₹872.7 becomes ₹872.70 |
| `crore` | Indian grouping; 0 decimals at 100 and over, else 1; missing is –; growth off a loss is n.m. | None |
| `period`, `basis`, `day`, `clock` | "Sep 2026 qtr", "consolidated", "30 Oct", IST only | Moved, unchanged |

**Three guards.** Golden: figures rendered with `renderToStaticMarkup` (already a dependency, so no DOM library) stay identical across visual commits. Static: the test fails on `toFixed`, `toLocale*`, `Intl`, a raw ₹, × or `%` in a template outside `fig.ts`, with one named exception for SVG coordinates. Server strings: a grammar test runs over every recorded headline and target, because client code can't format those. None of these guards catches a wrong read like Equitas; that's what A1 and the results audit are for.

### Tokens and contrast

**Your suspicion is confirmed, and there are two more.** In light mode today:

- Green on raised: **4.29:1** (the results table)
- Met pill on surface: **4.27:1**
- Met filter chip on page: **3.94:1**

Every dark pair and every other text pair I checked passes. Under the proposed palette, every text pair passes: lowest is green on raised at 4.76. Tinted pills are the catch: at a 12% tint the new green still fails on page (4.32) and raised (4.07), and red fails on raised (4.33). So pills drop to an 8% tint or take a darker text token, and the test decides.

| Role | Light | Dark |
|---|---|---|
| Page, e0 | #f7f8fa | #0d1015 |
| Surface, e1 | #ffffff | #161a21 |
| Raised, e2 | #eef1f5 | #1f242d |
| Ink 1, 2, 3 | #10151c #465162 #566072 | #eef0f3 #b0b8c4 #9aa3b1 |
| Accent | #1b56d6 | #7ea6ff |
| Up, down | #0a7a48 #c0271d | #3ecf8e #ff7b72 |
| Flag (amber) | #8a5a00 | #e6c068 |

- **Type:** Display 34/38 (new, company close only), Figure 28/32, Title 17/22, Body 15/22, Meta 13/18; tabular numerals everywhere. Five sizes, up from four, so `DESIGN.md` changes.
- **Spacing:** 4, 8, 12, 16, 20, 24, 32. **Radii:** badge 11, card 16, sheet 24, chips full.
- **Elevation:** soft shadow in light; in dark, lighter surfaces with a hairline and no shadow.
- **Motion:** 120 ms press, 180 ms small, 240 ms sheet. Enter `cubic-bezier(.2,.8,.2,1)`, exit `(.4,0,1,1)`, spring with CSS `linear()`.
- **Accent is blue on purpose:** green is reserved for sign, so a Groww-style green accent would break the colour rule. Badge hues avoid red, green and amber for the same reason.

### Five motion moments, all CSS

| Moment | What moves | Guard | Plan |
|---|---|---|---|
| Number settle | The file's close and #1's figure fade up 6 px over 180 ms | Exact value from the first frame, no in-between digits, so screen readers and reduced motion lose nothing. Never in tables, verdicts or quotes | I1 |
| Chart draw | Line draws once on open, 420 ms, via `pathLength` | Same path as the static chart; no redraw on chips or scrubbing; static under reduced motion | I1 |
| Row expand | `grid-template-rows` 0fr to 1fr, 180 ms | A test checks the figure's position is the same open and closed | I1 |
| Pressed state | Row tint, button scale .97, 120 ms | No layout change; transform only | I1 |
| Sheet spring and drag | Spring via `linear()`; drag needs about 0.4 KB of JS | Back and history behaviour unchanged, `sheetHistory.test` stays green | K4 |

I dropped gauge-fill on scorecard rows. The Walk shows the same gap better, and a partly filled bar invites a score reading.

### Microcopy rules, tested over every recording

- No live words: ago, now, just, today's price, refresh.
- No advice: buy, sell, target price, should, recommend, undervalued.
- No cause near a move: because, due to, on the back of, driven by, unless inside a verbatim quote.
- Every % on a row has a basis or date within that row.
- Plurals agree, no "Please", no doubled spaces, no raw model or file names on investor screens.

### Performance check

`scripts/perf.mjs` uses Chrome's debugging protocol and Node's built-in WebSocket, so no new dependency. At 375 px with 4× CPU and slow 4G it records first paint and layout shift, on Today and on opening a file. Proposed budgets: first contentful paint under 1.8 s, shift under 0.02. Headless scroll numbers aren't trustworthy, so scroll smoothness is judged on your phone.

## Part 1B: logos

**Recommendation: ship monograms only.** The bytes aren't the problem, the layer adds about 0.3 KB. The risk is that it adds the only third-party request to a site whose pitch is that nothing is live. It also brings a licence question, and a hand-kept domain table where one wrong row puts one company's logo beside another's figures, which no test can catch. The gain is recognition you already get from the company name beside the badge.

| Source | What its own pages say | Check yourself |
|---|---|---|
| Brandfetch Logo API | Free tier 1M requests a month (soft), client ID on each request, no attribution, hotlinking required, caching needs an arrangement, Referer must carry the origin | Current terms; whether a hiring submission fits; NSE ticker lookup coverage; whether blocked referrers break Vercel previews |
| Logo.dev | Free tier 500K a month (hard cap); commercial projects on it keep a link back; personal projects exempt; storing results allowed on all plans | Whether this submission counts as commercial; whether a token in client code is allowed (its pricing page doesn't say) |
| Clearbit Logo API | Sunset 1 Dec 2025 | Not an option |
| Favicon services, company sites, Wikimedia | Low resolution, or per-company terms and no single host | Not recommended |

All of these need your check of trademark use too. I couldn't verify the full terms, only these pages.

**If you enable it anyway (K5):**

- **Mechanics:** `VITE_LOGO_HOST` unset means off, including in CI. The monogram always renders; an absolutely placed `img` sits on top with opacity 0 until load, removed on error or after 1.5 s. No layout shift is possible.
- **What a visitor's browser sends the host:** IP address, user agent, the site's origin, and which companies were on screen, up to 18 requests.
- **Wording:** "Filings, prices and figures are recorded and don't change. Logos, if shown, load from [host]; no figure comes from it." Use the same text in How to read this, How this was built and the README's recorded-vs-live section. The ledger line about AI calls and keys stays true.
- **Guards:** `check:sw` is untouched. A new test fails if the built output names a logo host while the flag is off. A headless test blocks the host and verifies every badge shows its monogram with zero shift and identical figures.

### Row anatomy and budgets

Badge, name and descriptor, figure with its basis, optional sparkline; the same component on Today, Book and Research. Hierarchy: #1 gets the large figure and the one filled button; every other row is one size. Short names go in `portfolio.json` as an additive field ("Equitas SFB"), because "Equitas Small Finance Bank" would be cut on a row. The budgets hold because the badge replaces the ticker's job. Everything is inline SVG and CSS with no image files.

## Part 2: features

### (d) Guidance Walk: what the recordings support

Of 111 promise rows, 28 have later statements. Only 5 carry a "revised" label, and 9 later statements have "no figure read". "Withdrawn" never occurs: a search of all the cached transcripts and reports found no genuine case, so that state is dropped.

| Group | Promise | Steps | Delivered and arithmetic |
|---|---|---|---|
| **Revised and delivered: 1** |  |  |  |
| Full walk | Kaynes FY26 revenue | ₹4,500 cr+ (Q1 FY26 p.6) → about ₹4,000 cr minimum (Q3 FY26 p.8) | ₹3,626.35 cr (annual report p.239). 80.6% of first, 90.7% of last. Needs a rule to read the figure from the verified quote; today it's "no figure read" |
| **Held and delivered: 5, a flat line that ends in a figure** |  |  |  |
| Flat | BEL EBITDA margin FY26 | 27%+, held on 3 calls | 29.2%, +2.2 pts |
| Flat | BEL revenue growth FY26 | 15%+, held on 3 calls | 16.2%, +1.2 pts |
| Flat | BEL order inflow FY26 | ₹27,000 cr+, held on 3 calls | ₹30,045 cr, 111% |
| Flat | BEL capex FY26 | ₹1,000 cr+, then a plain ₹1,000 cr on Q3 | ₹900 cr, 90%; management's own recollection, so labelled as stated on a call |
| Flat | Coforge FY26 EBIT margin | 14%+, held on 2 calls | 14.4%, +0.4 pts |
| **Revised and still open: 3, stop at "not yet due"** |  |  |  |
| Open | Coforge FY27 consolidated EBIT | 15.5%+ → 15.5%+ → raised to 16%+ (Q2 FY27 p.2) | None yet |
| Open | Dixon IT hardware FY27 | ₹3,500–4,000 cr → over ₹4,000 cr (Q4 FY26 p.9) | None yet |
| Open | Dixon telecom FY27 | ₹7,500–8,000 cr → ₹6,700–7,000 cr (Q1 FY27 p.20) | None yet |
| **Excluded** |  |  |  |
| Out | BEL EBITDA margin FY27 | Candidate you named. Conflict on one call, no delivered figure. It stays in the scorecard with the A3 wording, with both quotes | The same closing passage also gives order inflow over ₹20,000 cr against ₹55,000 cr guided a call earlier. Not resolved by FINN |
| Out | Coforge FCF to PAT | Labelled revised (75–80% → 70–80%), but it's a passing description of guidance with no period | No due date |
| Out | "No figure read" rows, except Kaynes | 8 rows. Most are milestones with dates. Coforge's "robust growth" row carries a margin quote that belongs to another row | Mislabelled or figure-less |
| Out | Asian Paints 18–20% | Restated 3 times, never with a year | Nothing to check against |

**Closest honest version:** those 9 walks, grouped as above. It covers 4 companies. Code computes every gap, margins in points and amounts in percent of target. The existing verdict stays scored against the first promise, with no new verdict and no score. Later, if time allows, date walks could join across rows (Dixon's Inventec plant moved Q1 FY27 → Q3 FY27 → Q4 FY27), but that needs hand-linked rows, so it's out for now.

**Effort 2.5 h. Bundle about 2.5 KB. Risk low:** additive file, no model calls. **Wording:** report arithmetic ("80.6% of the first promise") and never intent words like "missed its word". CI re-verifies new quotes against the committed page text.

### (e) Measured quality

| Part | What the data supports | Honest limits |
|---|---|---|
| Classifier, about 60 filings | 229 filings across 13 labels. Take every filing in thin labels (capex 1, credit rating 3, AGM 3, fund raise 6, dividend 7), sample the rest | **Pledging, bonus or split, and insider trades have no filings, so "every category" isn't possible.** Filing PDFs are on disk for 74 of 229; 0 for meetings, dividend, ratings, AGM; few for concalls and unclassified. The rest need polite fetches at 1 per 3 s or a "summary only" flag in the CSV. Candidate labels anchor your review; the doc says so. Per-category counts are tiny, so show counts and ranges, no percentage below 20 items |
| Results cards | 10 confident companies, 89 figures read. My line-by-line pass this session: **85 match, 4 don't** (Equitas current PAT; HUL revenue in 3 columns). One more is printed but missing (Equitas prior-quarter PAT). 7 other companies show no figures by design | Preliminary, read from PDF text. Re-run after block A; list every mismatch and fix in `EVAL.md`, including these. EBITDA is derived, so check its inputs |
| Verifier | Research: 166 claims shown, 51 dropped, 23.5% of those considered; 17 of the drops are "quote not found on the page". Filing reads: 38 of 39 pass | State this plainly: the verifier proves a number or quote is on the page. It doesn't prove the right column or the right meaning. Equitas passed it |
| Ranking weights | **Can't be evaluated here.** There's no labelled preference or investor behaviour. Hand-set, then checked by reading 62 briefings; the tests prove the explanations are true, not that the order is best | Say exactly that on the sheet |

**Effort 2 h plus your review. Risk low; bundle about 1.2 KB.** Showing a 4-in-89 mismatch that you found and fixed is more convincing than a clean claim. Put the sheet behind (i), with nothing on the first screen.

### (c) Explain this number

**Supported today:** results rows ship current, previous, year-ago, page and link, so "29,250 vs 22,146 → +32.1%" works without new data. **Needs additive fields:** EBITDA's four inputs (already in the recordings) and the 20-day volume baseline. **Prices** have no page; they say "Yahoo Finance close, recorded", plus the formula. **UI:** tap a figure inside the table or company file. Today's row figure stays part of the row tap, so the budget is untouched. It goes ahead of Listen for, which stays out. **Effort 1.25 h, about 1.2 KB.** Check on a phone: the `#page=N` jump may be ignored by mobile PDF viewers, so the sheet also prints the page number.

### (a) My book in rupees

**Supported:** all 18 holdings, 20 sessions, closes. Day change = quantity × (close − previous close), by code. The largest one-day move in the window is 12.2%, so unadjusted closes show no split artefact. **UI:** a line at the top of Book opens a sheet with one quantity per holding, stored on the device. Nothing on Today. **Effort 1.5 h, about 1 KB, risk low.** **Wording:** "Hypothetical book on recorded closes. Not your holdings." "Day change", never profit or loss. Skip rank weighting. **Below the line.** iOS zooms on inputs under 16 px, so check on a device.

### (f) Due next

56 recorded promises are not yet due. Group them by quarter: "Q3 FY27: 9 promises", each with quote and page. It's a checklist for the next call, and a generic AI finance app has no verified promises to list. **Effort 1 h, about 0.5 KB, risk low.** **Wording:** "Management said", dated to its call. Never "expected". Lives on Research, as a count until opened.

### (b) Copy as note

**Supported fully,** from the same formatter. One tap writes plain text: company, figure and basis, what was filed, source links, and "Recorded data as of 30 Oct, FINN". A test confirms every number in a note is on its card. **UI:** inside the opened row and at the file's foot. **Effort .5 h, about 0.5 KB, risk low.** Clipboard must run inside the tap handler; check on iOS.

### (f) Alert backtest

Under the steppers in Alerts: "At 2× and ±4%, this fired N times on M holdings in 20 recorded sessions", with dates. It's a pure function over the bundled sessions and it answers the brief's "I decide what unusual means". **Effort .75 h, about 0.3 KB, risk low.** **Wording:** says "fired", in the past tense, with no claim about what followed.

## Demo recording, about 80 seconds

Record after the freeze, on your phone, in light mode, with the 30 Oct default date. Say "recorded" once, early.

- 0–10 s, Today. "This is a recorded briefing from 30 October. Eighteen holdings, nine need a look, eleven filings filtered. That's the end of the list." Pause on the last line.
- 10–22 s, open Reliance's row. "It leads with the number and its label. Here's why it ranks first." Tap +32.1% in the table: "Tap any figure for the sum and the page."
- 22–38 s, Equitas. Back, open its file. "Down 6.3% on 42 times volume. Capped bars print the real multiple. FINN says what was filed and when, never why a price moved." Scroll to results: "This PDF's table is scrambled, so FINN withholds the figures rather than guess."
- 38–62 s, Research, then Kaynes. "This is the part I care about most." Open the Walk. "Guided ₹4,500 crore. Later about ₹4,000. Delivered ₹3,626. Code does the arithmetic: 80.6% of the first promise, 90.7% of the last." Tap p.8, show the transcript page. "Every step opens its page."
- 62–74 s, (i), How much to trust this. "Measured, with sample sizes: what it got right on a hand-checked set, and the mismatches I found and fixed."
- 74–80 s, back to Today, dark mode optional. "Every number is verified or withheld, and you can stop looking when the list ends."

Step 3 depends on A1 and step 5 on E. If E slips, end at step 4.

## Manual checks on a real phone

| After | You | Friends |
|---|---|---|
| A | Equitas file shows "figures withheld" with a working page link. HUL revenue reads 18,226. BEL's FY27 row no longer says Revised | None |
| B, C | Walk Today, an opened row, a file and a scorecard: no number looks different except margins and prices under ₹1,000. Results table legible outdoors in light mode | None |
| D | Scrub the Walk with a thumb; tap each page link, does it land on the page? Long quote at 375 px; back returns to the scorecard | "What happened to Kaynes' promise?" in their own words, within 20 seconds, from a cold open of the Walk |
| E | Review the CSV. Read the trust sheet aloud: any line overclaiming? | "How much would you trust FINN, and why?" after reading it |
| F | Tap every figure type; PDF jump on iOS Safari and Android Chrome; sheet over sheet, back closes one at a time | "Where did this number come from?" Time to answer |
| G | Swipe to dismiss still works from the badge and from the figure. Figure doesn't shift on open. Badges look tasteful in both themes. System font on your actual phone | 5-second test on Today: what does this app do, what would you tap first? Does it feel like an investing app? Does anything look live? Would anyone think it's advice? |
| H, I | Scroll smoothness on your phone on low battery. With reduced motion on, nothing moves and all values are present. Any motion annoying on the second viewing? Cut it | Did anything feel slow or fussy? |
| J, K | Paste a note into WhatsApp and Notes: are the links live, is it readable? If built: enter quantities, no zoom jump, values survive a reload | Would you send this note to someone? |
| Freeze | Full demo run on the deployed preview over mobile data, in a fresh private tab; then airplane mode for the error states | One person who hasn't seen it, no coaching, 2 minutes |
