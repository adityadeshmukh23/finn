# Build history

FINN is a mobile-first investor agent: a ranked briefing of what changed across a portfolio, and research that sets management's promises against delivery, with a page cited on every claim. I built it from 30 Oct to 3 Nov 2026 in Claude Code (Opus 5.5 and Sonnet 5.5), with Gemini's free tier for the in-app model calls and a general-purpose Claude chat for planning and drafting prompts. The chat produced plans; I reviewed each one and decided what went into Claude Code.

## How I worked with the tools

1. **Plan first, approve, then code.** Each phase began with a plan and a cut line that I approved or changed. The polish plan was approved as blocks A to J, with K below the line (`docs/POLISH_PLAN.md`, commit `42c4f4d`, no code changed). The plan proposed putting the correctness block ahead of the formatter I had ordered first, because a formatter can't catch a number that was read wrongly; I approved the change.
2. **Verify, don't trust.** A verifier checks that every research claim's quote or number is on the cited page: 166 claims shown, 51 dropped. I then audited every results figure against the filing PDFs: 104 of 104 match. That audit reads the PDF text layer, not the page image, so it can't catch a misread in the text itself. I also broke things on purpose to see the tests fail: a ranking line made to lie (`ranking.test.ts` failed), a poisoned build (`check:sw` failed), and known errors fed to the audit script (it flagged all 3 of HUL's old revenue figures).
3. **Code computes, the model extracts.** The model copies figures and quotes; code does every growth rate, margin, volume multiple and verdict. When Equitas's text layer scrambled its columns, code could prove the right profit from two printed sums, and FINN withheld the figures rather than rebuild the table.
4. **Rules first, then a cheap model, then a strong one.** Regex rules classified all 229 recorded filings; the cheap model read the 39 that rules couldn't place; the strong model, with a fallback chain, judged milestones. Total model spend while building: $0.00 (`docs/COST.md`).
5. **Cut scope on purpose.** Left out: web bios (LinkedIn means logging in), real push and a live backend, cash quality and the other research lenses, tap-to-explain figures, company logos, and a classifier accuracy number. The cover note gives the reason for each.

## Build sessions

This table groups the work by phase, from the git log, and hashes are commits in this repository. Transcripts 01 to 09 are attached in order; the rest are available on request.

| # | Session | Goal | What shipped | A decision or course correction |
|---|---|---|---|---|
| 1 | Setup, plan and LLM provider change, 30 Oct | Read the brief, set rules, run without a paid key | Repo, `CLAUDE.md` rules, phase 1 briefing (`598aeff`, `93504af`); provider-agnostic LLM layer, Gemini free tier as the default, mock and recorded modes, cost ledger (`5e0f0bc`) | Ranking by rules, not a model: 133 filings in a 7-day window placed with zero model calls. Opening the hidden-filings row caught HDFC Bank's MD change misfiled as routine; it is now a test case. A smoke test found the strong model overloaded, so retries and timeouts were bounded and the strong slot got a different default (`4a88588`) |
| 2 | Deploy and static replay, 31 Oct to 1 Nov | A link a reviewer can open | Static Vercel replay of every day and window, one-command local run, CI (`971c9e2`, `7a6e618`, `e3c94c6`) | Hugging Face Docker Spaces needed a paid plan. I chose a static recorded demo over a free host that sleeps for a minute: no key to leak, nothing to cold-start |
| 3 | Push mode, 1 Nov | The Push half of the brief | Rules-first classifier with verified cheap-model reads, a "why it ranks here" line, price and volume alerts, results card, management-change card (`1688761` to `a232400`) | Figures are verified against the page or not shown; arithmetic stays in code |
| 4 | Pull mode, 1 Nov | Promised vs delivered from primary sources | Document index from screener.in, claim verifier, strong-model fallback chain, 5 companies recorded, `./run.sh research TICKER` (`72df168`, `2b92a3a`, `674b1d8`) | A late or missed milestone needs evidence that says when (`674b1d8`); Asian Paints is reported as having no checkable promise |
| 5 | Polish audit, 1 to 3 Nov | Make it feel finished on a phone | Ledger design, bottom tabs, company file (`6ec292f`, `9414e6d`); Compact first screen (`5e2d878`); trust fixes (`854f77c`); new ranking (`bd04d0a`) | Removed the caching service worker after the live site rendered blank (`7444acb`); Compact cut the first screen from about 52 to about 24 text elements |
| 6 | Correctness block, 3 Nov | Fix wrong numbers before any visual work | Equitas withheld, HUL revenue summed and proved, "Revised" must earn the word, a consistency check, an audit script (`e2e29b9`, `3b25e7e`, `880031a`, `376b6c8`, `fa7301a`) | Found while planning (`42c4f4d`): Equitas showed the wrong quarter's profit. I approved putting these fixes first |
| 7 | Formatter and tokens, 3 Nov | One place for every number; accessible colour | `fig.ts`, a figures golden over all 66 briefings and 5 scorecards, a test that fails on a raw number format, an AA contrast matrix (`ff725ff`, `1c3896f`, `b2667c1`, `26137d6`, `cc8c523`) | The matrix found a failure my plan had missed: a tile's number in dark mode measured 4.25, so it now uses the stronger ink |
| 8 | Guidance Walk, 3 Nov | Show a promise change over time | Nine walks chosen by rule with no model calls, the stepped line in the scorecard row, a Research home front door (`60998f8`, `b897359`, `c62b5cc`) | 111 recorded promises give only 9 usable walks, so the front door says the split: 1 revised and delivered, 5 held and delivered, 3 revised and open |
| 9 | Final polish and documents, 3 Nov | Submission-ready | Dark by default, cover note, brief coverage table, a CI check for missing research files (`40e3cf3`, `388a837`, `c9b2413`, `134aaf2`) | Removed monogram badges that did not look good (`7943aa9`); recorded that the gold set wasn't labelled, so no accuracy is claimed (`2f9149c`) |

Transcripts are attached as finn_build_history.zip, numbered in date order; they cover the work by phase and do not map one to one onto the table's rows. Further logs are available on request.

## Moments where I steered

- **Static recorded demo over a live backend.** The free Docker host needed a paid plan; the remaining free option sleeps for about a minute, which a reviewer opening the link would hit (`DECISIONS.md`, 31 Oct).
- **55 price cards said "No filing in this window" when filings existed.** An audit over all 66 briefings found the class of bug; it was fixed and I added `trust.test.ts` so it fails if it returns.
- **Equitas showed June's profit as the September quarter's.** The verifier passed it, because the number was on the page. FINN now withholds the figures, with a rule for pages with no row structure (`e2e29b9`).
- **A service worker could blank the site.** I chose removal over tuning it, shipped a kill switch for browsers that had it, and made CI fail on a caching worker (`7444acb`).
- **Reversed the ranking so a CEO exit outranks a CFO appointment.** On 27 Oct a CFO swap led and an MD and CEO change sat at #3. Every explanation line is now tested against the data (`bd04d0a`).
- **"Revised" had to be earned.** BEL's single call stated 28% and 21% to 23%; FINN now says "Two statements on this call differ" with both quotes (`880031a`).
- **Removed the monogram badges.** They did not look good, so the layout stayed text-first (`7943aa9`).
- **Reported no classifier accuracy.** The 60-filing gold set wasn't labelled in time, so the app and the cover note make no accuracy claim (`2f9149c`).

## Where to find the conversations

The nine phases above are in order. Links to each conversation:

1. Setup, plan and LLM provider change: `01-setup-and-llm-provider.md`
2. Deploy and static replay: `02-deploy-and-static-replay.md`
3. Push mode: `03-push-mode.md`
4. Pull mode: `04-pull-mode.md`
5. Polish audit: `07-polish-audit-and-ux.md`
6. Correctness block: `08-plan-correctness-and-formatter.md`
7. Formatter and tokens: `08-plan-correctness-and-formatter.md`
8. Guidance Walk: `09-guidance-walk-and-final-polish.md`
9. Final polish and documents: `09-guidance-walk-and-final-polish.md`

Full logs are available on request.

## Known limits

The public link is a recorded replay as of 30 Oct, not a live backend. The verifier proves a quote or number is on the cited page, not that it is the right column; the 104-of-104 audit reads the PDF text layer and its row labels are set by hand for 9 cards. Results figures show for 9 of 17 cards and the rest are withheld on purpose. Asian Paints has no checkable promise, "not found" can be a search miss, ranking weights are hand-set and unevaluated, and no classifier accuracy is reported. My cost ledger undercounts Google's calls.
