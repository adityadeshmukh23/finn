# Design

What FINN does, why it's built this way, what it gives up, and where it's weak. The dated, per-phase reasoning is in [DECISIONS.md](DECISIONS.md); this is the summary for a reader who has ten minutes.

## Decisions and trade-offs

**Briefing first, chat second.** An investor's problem is filtering, not asking. So the home screen is a ranked list of what changed, one card per company, with the routine filings collapsed into a count that opens into a grouped, inspectable list. Chat would put the work on the investor: they'd have to know what to ask. The cost: there is no free-form Q&A. "Ask FINN" on a card, a Book row or a fired alert opens the company file: price and volume, verified results and management changes, every filing since the recording starts, and promised vs delivered where recorded. It's a fixed view, not a conversation, and it never dead-ends: a company with no research still has all the rest.

**Rules before the model.** NSE already tags each filing with a category and a one-line summary, so regex rules on those place and rank 229 filings with no model call. The cheap model reads a filing only when the rules flag it as ambiguous (empty "Reg. 30" summaries, vague board outcomes, insolvency filings that don't say who the debtor is) or the card needs a summary (M&A, litigation, equity raises, capex, order wins): 39 of 229. Rules keep the last word: a model read can place an ambiguous filing or demote a medium label it has read, never promote a clear rule label. The trade-off is that rules miss things. We found four misfiles on the 30 Oct snapshot, fixed them as rules with tests, and stopped there.

**Code computes, the model extracts.** The model copies figures and quotes off a page. Code converts units, computes EBITDA, QoQ, YoY, margins and volume multiples, and sets every numeric verdict in research (met, partially, missed). A model never does arithmetic that reaches a card. The cost is plumbing: unit handling, EBITDA only where it means something (not for lenders), "n.m." instead of a percentage off a loss.

**A verifier on every claim.** A quote must be on its cited page and every number must be in its quote (or printed on the page, for annual-report figures). Anything else is dropped, and in research the dropped claims are listed in the app with where and why. Low-confidence results cards show no numbers at all: a wrong number on a briefing card is worse than none. The cost is recall. A strict verifier drops true claims; the tolerances we added for PDF extraction (split words and digits, neighbouring pages, titles under tables) are each tested on the real text that needed them.

**Model routing and the fallback chain.** Three tiers: rules, then a cheap model for bulk extraction, then a stronger model only where reasoning is needed (grouping restatements of a promise, judging milestones). Models, prices and rate limits live in `.env` and `models.py`, nowhere else. The strong slot has an ordered fallback chain (3.8-flash, then 3.7-flash, then 3.6-flash), because free-tier capacity on the strong Flash models swung by the hour: 503s, 504s and daily quotas. Unusable output (cut off or off-schema) hands over like an error. Each recording names the model that answered and the ones it fell back from. If any model step is blocked, the run records nothing and says to re-run; finished steps replay free.

**Everything is recorded.** Every model output is stored by hash of (purpose, model, prompt, schema), or by NSE announcement ID, and committed. A filing or transcript is analysed once, ever. Changing the model or prompt changes the hash, so a stale output is never reused for a different model. CI re-verifies every recorded research claim against the stored text of its page; the PDFs themselves are never committed.

**A static replay deployment.** The public site is a static web app on Vercel that replays briefings pre-generated from a recorded NSE snapshot (22 days, 3 windows). It is not a slideshow: the window, the as-of date and the alert thresholds all work in the browser. Why static: Hugging Face Docker Spaces now need a paid plan; Render's free tier sleeps and takes about a minute to wake, which a grader opening the link would likely hit; and NSE may refuse cloud IPs (unverified). No key exists on any public host, so there is nothing to leak or overspend. What it costs: the public link can't fetch live filings or research a new ticker. Those run locally with `./run.sh`.

**Free-tier choices.** Gemini's free tier for both slots (cheap: `gemini-3.5-flash-lite`; strong: `gemini-3.8-flash` with fallbacks), Vercel's free static hosting, GitHub Actions for CI, Yahoo Finance via yfinance for prices, screener.in as a link index only. Fetching is one request per 3 seconds per host, cached, with no logins, CAPTCHAs or paywalls touched. Total model cost: $0. The ledger and a $5 hard cap would apply the moment a paid model is configured. The privacy trade-off is stated: Google may use free-tier inputs, and we send only public filings and transcripts.

## Design language: Ledger

A finite morning ledger with receipts: paper and ink, numbers are the hero, every figure carries its source.

- **Four type sizes, one family.** Figure 28/32, Title 17/22, Body 15/22, Meta 13/18, in the system stack with tabular numerals. Enforced by tokens in `index.css`; no ad-hoc sizes in components.
- **Colour means something.** Green and red are the sign of a number or of a verdict's gap to a promise. Amber is "low confidence or unverified". Everything else is ink. A rise is never alarm-coloured. "Partially" is neutral, since it is neither.
- **Rows, not cards.** A row is kicker, one line, one evidence line, with the figure in a right-hand column. The rank spine on the left is the ranking made visible: 4 px on #1, a hairline by #6. The top three start open.
- **Thumb zone.** Today, Book, Research, Alerts in a bottom bar. Every control is at least 44 px. The window and date open from a chip in the header: a docked picker cost 44 px of every screen for something rarely changed. Back closes an open sheet and nothing else.
- **A finite briefing.** Today opens with a one-line synthesis and the book strip, and ends by saying what was filtered and that nothing else is waiting.
- **Nothing looks live.** Times are absolute, in IST, never "6h ago". One as-of label sits under the title, and prices say which close they stop at.

## How each announcement type is treated

Rules classify; "reads" means the cheap model reads the filing and the verifier checks it. Score is the event weight used for ranking (up to 5 more for recency, 3 per other high-priority filing from the same company).

| Type | Tier, score | What the investor sees | Model |
|---|---|---|---|
| Quarterly results | high, 90 | Headline lead with the number ("PAT ₹29,250 cr, +32.1% YoY"), then Revenue, EBITDA, PBT, PAT with QoQ and YoY, computed by code, with page link. Low confidence: no numbers, the reason, and the page link | reads |
| Results deck, results press release | medium, 35 to 45 | Folded into the company's results card ("+N more") | none |
| Results newspaper ads | routine | Folded into the results card ("same numbers, already filed") | none |
| Top management change (CEO, CFO, MD, whole-time or executive director, non-independent chair) | high, 95 | Who, role, effective date, reason (exits only) and background, from the filing's own disclosure | reads |
| Board change (directors) | medium, 55 | One line and the filing | none |
| M&A, subsidiary listing | high, 85 | One-line summary marked "checked against p.N" | reads |
| Restructuring (sale, disposal) | medium, 50 | One-line summary | reads |
| Litigation, regulatory order | high, 80 | One-line summary; ambiguous insolvency filings are read to see who the debtor is | reads |
| Promoter pledge | high, 80 | Filing at high priority with a plain "why it matters" line | none |
| Credit rating downgrade / upgrade | high, 75 / medium, 45 | Filing with a "why" line; "no change stated" is hidden | none |
| Fund raise, buyback, equity issuance | high 70 / medium 50 | One-line summary; routine debt issuance is hidden | reads |
| Capex or expansion, order win | medium, 50 / 45 | One-line summary | reads |
| Product or approval news, bonus or split, insider trades | medium, 45 to 50 | Filing at medium priority with a "why" line | none |
| Dividend | medium, 30 | Filing with a "why" line; record dates are hidden | none |
| Concall transcript | medium, 40 | Link, "management's commentary in their words" | none |
| Concall notices and recordings, investor meetings, shareholder meetings and ballots | routine | Hidden, counted | none |
| Trading-window notices, compliance certificates, ESOP grants, intra-group guarantees, auditor appointments, subsidiary housekeeping, senior staff changes | routine | Hidden, counted, grouped by reason | none |
| Unplaceable ("Reg. 30", no NSE summary) | routine | Hidden, labelled "NSE gave no summary" rather than guessed; read by the cheap model when ambiguous | reads |
| Price or volume threshold crossed, no filing | 65 plus up to 20 by how far past | Its own card ("−6.3% on 42× volume; no filing in this window") with an NSE quote link | none |

A card's own "why #N" line says what ranks it where it is, computed in the browser so it stays right when alert settings change the order.

## What I left out, and why

- **Cash quality, balance sheet, trajectory.** These need multi-year statements from the annual report, which means a table-extraction and verification path for each statement across very different PDFs. One lens that is verified end to end beats four that aren't. Promised vs delivered is also the example the brief values most.
- **Bull vs bear.** The strong slot is reserved for it in `models.py`, but it isn't built. A two-sided case is where a model is most tempted to lean on outside knowledge, and every sentence would need the same quote-and-page grounding. The strong quota (20 requests a day on the free tier) was better spent on the verdicts.
- **Web bios for management changes.** The brief suggests LinkedIn, which means logging in or scraping against its terms; the rules here are no logins and no bypassing. The filing's own profile already covers the appointments in the demo. If added, it would be a separate link labelled "outside the filing", never mixed into verified fields.
- **Push notifications.** Real push needs a server, stored subscriptions and a scheduler. The public site is static with no backend, by design. Alerts are configured and evaluated in the browser when you open the app; nothing pings you. Volume and price thresholds work; there is no block-deal feed.
- **Free-form chat and the other research lenses** (business snapshot, financial snapshot). Same reason: depth on one verified workflow over breadth.
- **Embeddings.** A transcript is about 15k tokens, so the cheap model reads each one whole, once. The only retrieval is a rules search of later calls for promises nothing reported settles. Embeddings would add cost and a failure mode for no gain at this size.

## Known weak spots

- **Asian Paints has no checkable promise.** Its management guides in words and with an 18 to 20% PBDIT band that names no year. FINN doesn't turn words into numbers or assign a year management didn't say, so its scorecard shows six "too vague" rows and no verdict. It's in the research set so Ask FINN works from a push card; as a demo of the lens it's thin. A numeric guider such as L&T or Bajaj Finance would show more.
- **Free-tier flakiness.** The strong Flash models returned 503s, 504s and daily-quota 429s throughout the build. The chain and the recordings absorb that, but a fresh research run on the free tier can stop partway and need a re-run later.
- **"Not found" can be a search miss.** The cheap model sometimes misses a reported figure (Coforge's Q4 EBIT was found only after a rule that reads the period from the quote), and the search of later calls is by keyword. Reasons are worded "FINN found no…" for that reason.
- **No live backend on the public site.** It replays the 30 Oct snapshot. Whether NSE answers cloud IPs is unverified.
- **Our ledger undercounts Google's.** The SDK retries 503s itself and timed-out attempts count on Google's side. Google stopped one model at its daily limit while our ledger showed 11 of 20 calls. Treat our counts as a lower bound.
- **A verifier bug found late.** Figures between 0 and 1 with a leading zero ("0.5%") are wrongly dropped, because the number matcher strips the leading zero from the text but not from the figure (`number_in` in `backend/finn/verify.py`). It fails closed (a true claim is dropped, never a false one admitted), and it dropped two true Coforge claims in the shipped research (quotes that read "grew 0.4% QoQ" and "$0.5 million for acquisition-related expenses"; both show in the app as dropped by the verifier). Found by the unseen-ticker smoke test on TCS. Not fixed at the time of writing.
- **PDF tolerances are ours.** Words and numbers split by extraction are matched on letters, digits, "." and "%"; a transcript quote may be re-cited to one neighbouring page if it's verbatim on exactly one. A stricter verifier drops more true claims; a looser one admits paraphrase.
- **Milestone verdicts rest on one quote each.** They're shown with the quote and page, and withheld if the reasoning uses an unsourced number or claims lateness without a date, but they remain a judgement.
- **Source quality limits results cards.** Of 17 holdings with a results filing: 7 high confidence, 3 medium, 5 low (OCR'd or merged-column PDFs), 2 none (a scanned image; no table found). Those fail honestly rather than show a guess.
- **Ranking weights are hand-set** and checked by reading the result, not against labelled data or investor behaviour. There is no precision or recall number for the classifier beyond the test cases.
- **Coverage depends on screener.in.** ITC lists no transcript links, so research is refused for it. Extraction isn't deterministic: two smoke runs on TCS read 18 and then 21 claims.

## Where I'd take it next

1. Fix the leading-zero bug in `number_in`, add a test, and re-verify recordings (no model calls).
2. A second lens on the same verified annual-report data: financial snapshot and multi-year trajectory.
3. Block and bulk-deal data, so a volume spike can say why.
4. A numeric guider (L&T or Bajaj Finance) in the research set, and an annual-report-only mode for companies like ITC with no transcripts.
5. A small labelled set of filings to measure the classifier, and a regression run on recorded reads when prompts change.
6. A hosted API (Render's free tier) for live filings from a public link, with the key still kept off it, and then real web push with a scheduler.
