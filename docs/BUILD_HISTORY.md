# Build history

FINN was built in Claude Code sessions from 30 Oct to 3 Nov 2026. The pattern in every session: I set the goal and the constraints, the agent proposed a plan with a cut line, I approved or changed it, and each working piece was committed before the next began.

Times are IST. For rows 1 to 6 they come from the session transcripts, and two rows that shared a session say so. From row 7 on they're the commit times in the git log, so a session may have started earlier. Share links are mine to add. Placeholders are marked `TODO`.

| # | Session | When (IST) | Outcome | Share link |
|---|---|---|---|---|
| 1 | Setup | 30 Oct, from 19:29 | Repo, `.gitignore` and `CLAUDE.md`. Plan from the brief and glossary. Phase 1 briefing: NSE announcements, rules-based ranking, one card per company, hidden-filings row | TODO |
| 2 | Provider change | Same session, to 31 Oct 03:47 | With no paid key, the LLM layer became provider-agnostic with Gemini's free tier as default, a recorded and mock mode, rate limits and a cost ledger. A smoke test found the strong model overloaded; retries and timeouts were bounded | TODO |
| 3 | Deploy and static demo | 31 Oct 03:49 to 1 Nov 00:22 | Guards on live calls checked. Hugging Face Spaces needed a paid plan, so a static Vercel replay was chosen. Static build of every day and window, `./run.sh`, CI fixed, live site checked at 375px | TODO |
| 4 | Push mode | 1 Nov 00:34 to 03:07 | Rules-first classifier, cheap-model reads checked by a verifier, a "why it ranks here" line, price and volume alerts, a results card with arithmetic in code, a management-change card. 93 free-tier calls, $0 | TODO |
| 5 | Pull mode | 1 Nov 03:13 to 04:48 | Document index from screener.in, claim verifier, strong-model fallback chain. BEL, Asian Paints, Kaynes, Coforge and Dixon recorded and read row by row. `./run.sh research TICKER` | TODO |
| 6 | First documents | 1 Nov, from 04:51 | Unseen-ticker smoke test, README, `docs/DESIGN.md`, `docs/COST.md`, the first cover note, a clean-clone CI run | TODO |
| 7 | Polish audit | 1 Nov, from 16:01 | `docs/POLISH_AUDIT.md`, then the Ledger design, bottom tabs, Book and Alerts tabs, the company file, and the Today hero | TODO |
| 8 | UX audit | 3 Nov, 00:14 to 05:24 | My own look on a phone found the first screen cramped. Compact first screen, How to read this, trust fixes over all 66 briefings, plain language, ranking by seniority, size and kind of event | TODO |
| 9 | Planning | 3 Nov, to 15:28 | `docs/POLISH_PLAN.md`: the block order, the Guidance Walk's real size, and a wrong Equitas figure found while checking the data. No code changed | TODO |
| 10 | Block A | 3 Nov, to 15:50 | Equitas withheld, HUL revenue summed and proved, "Revised" has to earn the word, a consistency check, an audit script: 104 of 104 figures | TODO |
| 11 | Blocks B and C | 3 Nov, to 16:19 | One formatter and a figures golden over every screen, a guard against raw formats, a contrast check over every colour pair | TODO |
| 12 | Block D | 3 Nov, to 17:12 | Guidance Walk: nine walks chosen by rule, the stepped line, the Research home front door, then the gold set's sampling | TODO |
| 13 | Final push | 3 Nov, to 17:43 | Excerpts refreshed for the gold set, Detailed as the default, monogram badges, a 2-minute tour, link previews | TODO |
| 14 | This session | 3 Nov, the last commits | Badges removed, the gold set recorded as unlabelled, the cover note rewritten, this file, a last check of the README | TODO |

If there are other conversations from the build (for example planning chats outside Claude Code), add them as further rows.

The transcripts are on the build machine under `~/.claude/projects/` and are not committed to this repository.
