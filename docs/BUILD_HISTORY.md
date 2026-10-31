# Build history

FINN was built in five Claude Code sessions over 33 hours of elapsed time (30 Oct 19:29 to 1 Nov 04:59 IST, times from the session transcripts and git log). The pattern in every session: I set the goal and the constraints, the agent proposed a plan with a cut line, I approved or changed it, and each working piece was committed before the next began.

Share links are mine to add. Placeholders are marked `TODO`.

| # | Session (IST) | Goal | Outcome | Share link |
|---|---|---|---|---|
| 1 | 30 Oct 19:29 to 31 Oct 03:47 | Set up the repo and rules, plan from the brief and glossary, build the briefing shell, then a provider-agnostic LLM layer | Repo, `.gitignore` and `CLAUDE.md` set up. Phase 1 briefing: NSE announcements, rules-based ranking, one card per company, hidden-filings row. When no paid key was available, the LLM layer became provider-agnostic with Gemini's free tier as default, a recorded/mock mode, rate limits and a cost ledger. A live smoke test found the strong model overloaded; SDK retries and timeouts were bounded and the default moved to `gemini-3.6-flash`. Commits through `fix: bound Gemini SDK retries` | TODO |
| 2 | 31 Oct 03:49 to 1 Nov 00:22 | Get a working public link; guard live LLM calls before any key goes on a public host | Guards verified: public demo defaults to mock, daily and per-visitor caps checked, tests added for the global cap and the mode default. Hugging Face Docker Spaces turned out to need a paid plan; free hosts compared and a static Vercel replay chosen instead. Static build of every day and window, alert settings in the browser, `./run.sh`, CI fixed (a pydantic pin conflict), live site checked at 375px at finn-olive.vercel.app | TODO |
| 3 | 1 Nov 00:34 to 03:07 | Push mode that reads like an investor's briefing, not a feed of filings | Rules-first classifier with four misfiles fixed, cheap-model reads of ambiguous filings checked by a verifier, a "why it ranks here" line on every card, end-of-day price and volume alerts with editable thresholds, a quarterly-results card with figures verified against the page and arithmetic done in code, and a management-change card built from the filing. 93 free-tier calls, $0 | TODO |
| 4 | 1 Nov 03:13 to 04:48 | Pull mode: promised vs delivered from annual reports and transcripts only | Document index from screener.in, earnings-call dating from the transcript text, claim verifier, strong-model fallback chain. BEL, Asian Paints, Kaynes, Coforge and Dixon recorded, each row read against its quote; post-judge rules added from those reviews. `./run.sh research TICKER` for any ticker. Daily strong-model quota ran out partway; Dixon's judge step ran on the last fallback model | TODO |
| 5 | 1 Nov 04:51 onward | Shipping: documents only, no new features, no strong-model calls | Unseen-ticker smoke test (TCS and Titan pass, ITC refused because screener lists no transcripts; found a verifier bug, documented, not fixed). README with screenshots and diagram, `docs/DESIGN.md`, `docs/COST.md`, this file, the cover note, and a clean-clone CI run | TODO |

If there are other conversations from the build (for example planning chats outside Claude Code), add them as further rows.

The transcripts are on the build machine under `~/.claude/projects/` and are not committed to this repository.
