# What COVER_NOTE.md needs changed

A running list. `COVER_NOTE.md` has not been edited. README.md, DESIGN.md and DECISIONS.md match the app as of blocks B and C, the formatter and contrast check.

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
- **Later blocks:** Guidance Walk, the evaluation page, the ledger, Listen for and any new recordings will each add a line here when they land.
