# Brief coverage

Every requirement in the brief, where it lives, and how far it got.

| Requirement | Status | Where, and the plain reason |
|---|---|---|
| Mobile-first prototype and link | Met | https://finn-olive.vercel.app, a static replay.  |
| Portfolio of 15-20, research on 3-5 | Met | `data/portfolio.json`: 18 holdings. Research: BEL, Kaynes, Coforge, Dixon, Asian Paints |
| Three data sources | Met | Yahoo end-of-day prices, NSE announcements (BSE returned 403), transcripts and annual reports indexed from screener.in. Recorded on the public link, live with `./run.sh` |
| Windowed digest | Met | Today: 24h, 3 days or 7 days, plus an as-of date. Routine filings collapse into a count |
| Configurable alerts | Partly | Alerts tab: volume and price thresholds, and event types. They fire on recorded days. There is no real-time notification |
| Results card | Partly | Revenue, EBITDA, PBT, PAT, QoQ and YoY, by code. 9 of 17 cards show figures; the rest are withheld on purpose (6 low confidence, 2 no table read) |
| Management-change card | Partly | Who, role, date, exit reason and profile come only from the filing. Web enrichment wasn't built; LinkedIn means logging in. A search link sits beside each person, not checked by FINN |
| Pull: guidance, narrative vs numbers | Met | Research tab: a scorecard with page citations |
| Pull: financial snapshot | Partly | Revenue, EBITDA, PAT and margins for one year from the annual report, no key ratios |
| Pull: business snapshot, trajectory, balance sheet, cash quality, bull vs bear | Not built | One lens verified end to end was chosen over several that aren't |
| Promised vs delivered worked example | Met | 5 companies across five calls, verdicts by code, Guidance Walk on 9 promises. Asian Paints has no checkable promise |
| Primary sources only | Met | Transcripts and annual reports only, each claim with a quote and page |
| Any-ticker generalisation | Partly | Locally, not on the public link. The engine fetches live NSE data via ./run.sh TICKER and works where screener.in lists transcripts (tested on TCS and Titan; ITC is refused cleanly because none are listed). The test covered the document index, one transcript and one cheap-model read |
| Interaction model | Met | Briefing first, chat second: Compact and Detailed views, Ask FINN opens a company file. No free-form chat or voice, by choice |
| Model routing and cost | Met | Rules, then cheap, then strong model; recorded outputs replayed. $0 on free tiers; the ledger undercounts Google's calls. See `docs/COST.md` |
| Submission | Partly | Link, repo and `COVER_NOTE.md` are ready. Share links in `docs/BUILD_HISTORY.md` are still to add |
