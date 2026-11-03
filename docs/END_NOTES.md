# What COVER_NOTE.md needs changed

A running list. `COVER_NOTE.md` has not been edited. README.md, DESIGN.md and DECISIONS.md match the app as of block D, the Guidance Walk, and block E1, which changes no screen.

## Exact changes

| Now it says | It should say | Why |
|---|---|---|
| "The home screen is a ranked briefing, not a chatbox: one card per company for a window and as-of date I pick, with routine filings collapsed into a count I can open." | "The first screen is a ranked answer, not a chatbox: the top three companies with one number each, the rest one tap away, for a window and as-of date I pick, with routine filings collapsed into a count I can open." | The first screen changed |
| "Results cards show revenue, EBITDA, PBT and PAT with QoQ and YoY" | "Opening a row shows revenue, EBITDA, PBT and PAT with QoQ and YoY" | The table is now one tap down |
| "\"Ask FINN\" opens promised vs delivered: what management guided across five earnings calls against what it reported, from transcripts and annual reports only, with a page citation on every claim." | "\"Ask FINN\" opens the company file: price, volume, every filing, and promised vs delivered where recorded: what management guided across five earnings calls against what it reported, from transcripts and annual reports only, with a page citation on every claim." | Ask FINN no longer goes straight to research |
| "block-deal data so a volume spike can say why" | "block-deal data to put a volume spike in context" | FINN doesn't say why a stock moved, and the note shouldn't promise it |

The body, from "What it is" up to the sign-off, is 365 words today and 385 after these four changes, against the limit of 400. That leaves room for about 15 more words, so the optional lines below don't both fit, and the first one needs trimming.

## Still to decide when the note is edited

- **Key decisions, optional:** "Ranking weighs seniority, company size, kinds of event and the size of the move; a test checks every rank explanation against the data." Add it only if the word limit allows.
- **Key decisions, optional:** "First-time readers get one number per company; every figure stays one tap from its page."
- **"Rules rank and place filings":** still accurate, keep it.
- **"A verifier bug found late":** still accurate, so keep it unless the bug gets fixed.
- **"A verifier bug found late":** block A adds a stronger story: an audit against the PDFs found 4 wrong figures of 89 on two cards (Equitas, HUL), since fixed, and 104 of 104 match now. Optional, if words allow: "I audited results against the PDFs, found 4 wrong figures of 89, fixed the cause and published the list." That's 19 words, 4 over the room left, so it replaces something or gets cut. Say the figures only as they stand in `EVAL.md` on the day.
- **Don't name the analyst on Kaynes' Q4 FY26 call.** Decided 3 Nov: not in the app, the notes or the docs.
- **Blocks B and C need no change to the note.** Optional, if words allow: "One formatter, and a test that fails on a raw number format." That's 11 words, and it competes with the audit line above, which says more.
- **Guidance Walk, optional, if words allow:** "Kaynes guided ₹4,500 crore, later about ₹4,000, and delivered ₹3,626: code reports 80.6% of the first promise, 90.7% of the last statement, with every step's page." That's 26 words, more than the room left, so it replaces something. It says more than the audit line for a reader who opens the Research tab, and less for one who asks how far to trust the figures. Don't write "cut" or "walked back" in the note either: the app reports arithmetic only.
- **"Nine walks":** say it only with the split, 1 revised and delivered, 5 held and delivered, 3 revised and open. Only one of the nine goes promise, revision, delivered.
- **"Promised vs delivered":** still accurate. The note doesn't mention the company rows' verdict counts, so their move to the scorecard changes nothing here.
- **No classifier accuracy in the note yet.** The gold set is sampled and unlabelled. Don't write a figure until `docs/EVAL.md` has one, and quote it with its sample size and its limits: the sample is drawn from FINN's own labels, and 47 of 60 rows were judged from the subject line.
- **Later blocks:** the evaluation page, the ledger, Listen for and any new recordings will each add a line here when they land.
