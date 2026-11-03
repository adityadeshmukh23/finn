# Brief coverage

Every requirement in the brief, where it lives, and how far it got.

| Requirement | Status | Where, and the plain reason |
|---|---|---|
| Mobile-first prototype and link | Met | https://finn-olive.vercel.app, a static replay. Checked at 320 to 430 px |
| Portfolio of 15-20, research on 3-5 | Met | `data/portfolio.json`: 18 holdings. Research: BEL, Kaynes, Coforge, Dixon, Asian Paints |
| Price and volume | Met | Yahoo Finance end-of-day. Recorded on the public link, live with `./run.sh` |
| Announcements | Met | NSE only; BSE returned 403. Recorded 9 to 30 Oct on the public link |
| Fundamentals | Met | Transcripts and annual reports, with screener.in as an index of links |
| Windowed digest | Met | Today: 24h, 3 days or 7 days, plus an as-of date. Routine filings collapse into a count you can open |
| Configurable alerts | Partly | Alerts tab: volume and price thresholds, and event types. They fire on recorded days. There is no real-time notification |
| Results card | Partly | Revenue, EBITDA, PBT and PAT, QoQ and YoY, by code. 9 of 17 cards show figures. The rest are withheld on purpose: 6 low confidence, 2 with no table read. See `docs/EVAL.md` |
| Management-change card | Partly | Who, role, date, exit reason and profile come only from the filing. Web enrichment wasn't built; LinkedIn means logging in. A search link sits beside each person, not checked by FINN |
| Other announcements | Met | One line and a "why it ranks here" reason, or collapsed by rules |
| Pull: guidance, narrative vs numbers | Met | Research tab: a scorecard, with page citations and a verifier |
| Pull: financial snapshot | Partly | Revenue, EBITDA, PAT and margins for one year from the annual report, no key ratios |
| Pull: business snapshot, trajectory, balance sheet, cash quality, bull vs bear | Not built | One lens verified end to end was chosen over several that aren't |
| Promised vs delivered worked example | Met | 5 companies across five calls. Code sets numeric verdicts. Guidance Walk on 9 promises. Asian Paints has no checkable promise |
| Primary sources only | Met | Research uses transcripts and annual reports only. Every claim carries a quote and page |
| Any-ticker generalisation | Partly | Works locally, not on the public link: `./run.sh TICKER`. A smoke test passed on TCS and Titan (document index, one transcript, one cheap-model read). ITC is refused, as screener.in lists no transcripts |
| Interaction model | Met | Briefing first, chat second: Compact and Detailed views, and Ask FINN opens a company file. There's no free-form chat or voice, by choice |
| Model routing and cost | Met | Rules, then a cheap model, then a strong one, set in `backend/finn/models.py`. Recorded outputs are replayed. $0 on free tiers; the ledger undercounts Google's calls. See `docs/COST.md` |
| Submission | Partly | Link, repo and `COVER_NOTE.md` are ready. Share links in `docs/BUILD_HISTORY.md` are still to add |
