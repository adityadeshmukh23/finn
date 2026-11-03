# Sources for BUILD_HISTORY.md

Where each claim in `docs/BUILD_HISTORY.md` can be checked. Find a commit with `git show <hash>` or `git log --date=short --format='%h %ad %s'`. Two claims are statements about process and have no repo source; they are marked **mine**.

## Opening

| Claim | Where |
|---|---|
| 30 Oct to 3 Nov 2026 | First commit `598aeff` (2026-10-30); last commit `3104873` (2026-11-03) |
| Mobile-first, ranked briefing, research with a page on every claim | `COVER_NOTE.md`, `CLAUDE.md` |
| Claude Code in Opus 5.5 and Sonnet 5.5; a general-purpose Claude chat for planning and prompts; I reviewed and decided on the plans | **Mine.** Not recorded in the repo |
| Gemini free tier for in-app calls | `docs/COST.md` (top); `5e0f0bc` |

## Principles

| Claim | Where |
|---|---|
| Polish plan approved as A to J, K below the line; commit `42c4f4d` changed no code | `docs/POLISH_PLAN.md` (first paragraphs); `git show --stat 42c4f4d` |
| The plan proposed the correctness block ahead of the formatter; a formatter can't catch a misread number | `docs/POLISH_PLAN.md`, "One change to your order"; `docs/DECISIONS.md`, "Polish: block A" |
| 166 claims shown, 51 dropped | `docs/EVAL.md`, "The verifier" |
| 104 of 104 figures match, from the PDF text layer, not the image | `docs/EVAL.md`, first table and "What these checks can't show"; `fa7301a` |
| Ranking line made to lie, `ranking.test.ts` failed | `docs/DECISIONS.md`, "Polish: ranking" |
| Poisoned build, `check:sw` failed | `docs/DECISIONS.md`, "No service worker; a kill switch" (CI bullet); `7444acb` |
| Audit script flagged all 3 of HUL's old revenue figures | `docs/EVAL.md`, under the first table |
| Equitas columns scrambled; two printed sums prove the profit; FINN withholds | `docs/EVAL.md`, "Why ₹218 cr for Equitas is right"; `e2e29b9` |
| Code does every growth rate, margin, volume multiple and verdict | `CLAUDE.md` (Engineering rules); `docs/COST.md` routing table, last row |
| Rules classified all 229 filings; cheap model read 39; strong model judged milestones | `docs/COST.md`, routing table |
| $0.00 total model spend | `docs/COST.md`, first line |
| Left out: web bios, real push and live backend, cash quality and other lenses, tap-to-explain, logos, classifier accuracy | `COVER_NOTE.md`, "Left out"; `docs/BRIEF_COVERAGE.md` |

## Session table

| Row | Claim | Where |
|---|---|---|
| 1 | Repo, rules, phase 1 briefing; `598aeff`, `93504af` | `git show --stat` on each |
| 1 | 133 filings in a 7-day window placed with zero model calls; hidden-filings row caught HDFC Bank's MD change misfiled as routine, now a test case | `docs/DECISIONS.md`, "Phase 1" (second and fourth bullets) |
| 1 | Provider-agnostic layer, Gemini default, mock and recorded modes, ledger; `5e0f0bc` | `docs/DECISIONS.md`, "LLM layer"; commit message |
| 1 | Strong model overloaded; retries and timeouts bounded; new default; `4a88588` | `docs/DECISIONS.md`, "Live smoke test and Gemini timeouts"; commit message |
| 2 | `971c9e2`, `7a6e618`, `e3c94c6`: static replay, one-command run, CI | Commit messages; `docs/DECISIONS.md`, "Public demo is static on Vercel" |
| 2 | Hugging Face Docker Spaces needed a paid plan; free host sleeps about a minute; static chosen; no key to leak | `docs/DECISIONS.md`, "Public demo is static on Vercel", first two bullets |
| 3 | `1688761` to `a232400`: classifier, why-line, alerts, results card, management-change card | `git log --date=short` for 2026-11-01 |
| 3 | Figures verified against the page or not shown; arithmetic in code | `docs/DECISIONS.md`, "Push mode 4: ... verified figures or none" |
| 4 | Document index, verifier, fallback chain, 5 companies recorded, `./run.sh research TICKER`; `72df168`, `2b92a3a`, `674b1d8` | Commit messages; `README.md`; `COVER_NOTE.md` (research set) |
| 4 | A late or missed milestone needs evidence that says when | `674b1d8` commit message |
| 4 | Asian Paints has no checkable promise | `COVER_NOTE.md`, "Weak spots"; `docs/BRIEF_COVERAGE.md` |
| 5 | Ledger design, bottom tabs, company file; `6ec292f`, `9414e6d` | Commit messages; `docs/POLISH_AUDIT.md` |
| 5 | Compact first screen `5e2d878`; trust fixes `854f77c`; ranking `bd04d0a` | Commit messages; `docs/DECISIONS.md`, "Polish: trust fixes" and "Polish: ranking" |
| 5 | Service worker removed after a blank live site; `7444acb` | `docs/DECISIONS.md`, "No service worker" |
| 5 | First screen from about 52 to about 24 text elements at 390x844 | `COVER_NOTE.md`, "What I measured and fixed" |
| 6 | Equitas withheld, HUL summed and proved, "Revised" rule, consistency check, audit script; `e2e29b9`, `3b25e7e`, `880031a`, `376b6c8`, `fa7301a` | Commit messages; `docs/EVAL.md` |
| 6 | Found while planning: Equitas showed the wrong quarter's profit | `docs/POLISH_PLAN.md`, "Read this first"; `42c4f4d` |
| 7 | `fig.ts`, golden over 66 briefings and 5 scorecards, raw-format guard, AA matrix; `ff725ff`, `1c3896f`, `b2667c1`, `26137d6`, `cc8c523` | Commit messages; `docs/DECISIONS.md`, "Polish: blocks B and C" |
| 7 | Matrix found a failure the plan missed: 4.25 in dark mode, tile number now `ink` | `docs/DECISIONS.md`, "Polish: blocks B and C" |
| 8 | Nine walks by rule, no model calls; stepped line; Research home front door; `60998f8`, `b897359`, `c62b5cc` | Commit messages; `docs/DECISIONS.md`, "Polish: block D" |
| 8 | 111 promises give 9 usable walks; split 1 revised and delivered, 5 held and delivered, 3 revised and open | `docs/POLISH_PLAN.md`, "The Walk's honest size"; `docs/END_NOTES.md`, "Nine walks" |
| 9 | Dark by default `40e3cf3`; cover note `388a837`; brief coverage `c9b2413`; CI check for missing research files `134aaf2` | Commit messages |
| 9 | Monogram badges removed, did not look good; `7943aa9` | `docs/DECISIONS.md`, "Polish: monogram badges removed" |
| 9 | Gold set not labelled, so no accuracy claimed; `2f9149c` | `docs/DECISIONS.md`, "Polish: the gold set wasn't labelled"; `docs/EVAL.md` |

## Moments where I steered

| Item | Where |
|---|---|
| Static demo over a live backend | `docs/DECISIONS.md`, "Public demo is static on Vercel" |
| 55 price cards said "No filing"; audit of 66 briefings; `trust.test.ts` | `docs/DECISIONS.md`, "Polish: trust fixes"; `docs/EVAL.md`, "Price rows and Book counts" |
| Equitas wrong quarter, verifier passed, rule for pages with no row structure | `docs/EVAL.md`, "Errors found and fixed"; `e2e29b9` |
| Service worker removed, kill switch, CI check | `docs/DECISIONS.md`, "No service worker"; `7444acb` |
| Ranking reversal; 27 Oct CFO swap led and MD and CEO change at #3; explanation lines tested | `docs/DECISIONS.md`, "Polish: ranking"; `bd04d0a` |
| BEL "Revised" vs "Two statements on this call differ" | `docs/EVAL.md`, errors table; `880031a` |
| Monogram badges removed | `7943aa9`; `docs/DECISIONS.md` |
| No classifier accuracy reported | `2f9149c`; `docs/EVAL.md`, "The filing classifier" |

## Conversations and limits

| Claim | Where |
|---|---|
| Nine phases, in order; each names the attached transcript file that covers it | **Mine.** The phase boundaries are my grouping of the commits above by date and theme; the phase-to-file mapping is by date and the commits each log cites. Files 05 and 06 are not named under any phase |
| Known limits paragraph | `COVER_NOTE.md` ("Key decisions", "Weak spots"); `docs/EVAL.md` ("What these checks can't show", "What can't be measured here"); `docs/BRIEF_COVERAGE.md` |
| Public link is a recorded replay as of 30 Oct | `COVER_NOTE.md`, "Key decisions" |
| 9 of 17 cards show figures; the rest withheld | `COVER_NOTE.md`; `docs/EVAL.md` |
| Row labels set by hand for 9 cards | `docs/EVAL.md`, "What these checks can't show" |
| Ledger undercounts Google's calls | `COVER_NOTE.md`, "Key decisions" |
| "Not found" can be a search miss; ranking weights hand-set | `COVER_NOTE.md`, "Weak spots" |

## Check before sending

- The nine rows group commits by phase, by date and theme. If you group them differently, change the table and the link list together.
- Every sentence above that says "I" about a choice (static demo, removal of the service worker, badges) matches a decision recorded in `docs/DECISIONS.md`; the chat-planning claim is the one I could not check.
