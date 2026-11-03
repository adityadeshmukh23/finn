# What COVER_NOTE.md needs changed

A running list. `COVER_NOTE.md` has not been edited. README.md, DESIGN.md and DECISIONS.md match the app at the tag `submission-candidate`: Detailed by default, the Guidance Walk, and the gold set awaiting labels.

## Exact changes

| Now it says | It should say | Why |
|---|---|---|
| "\"Ask FINN\" opens promised vs delivered: what management guided across five earnings calls against what it reported, from transcripts and annual reports only, with a page citation on every claim." | "\"Ask FINN\" opens the company file: price, volume, every filing, and promised vs delivered where recorded: what management guided across five earnings calls against what it reported, from transcripts and annual reports only, with a page citation on every claim." | Ask FINN no longer goes straight to research |
| "block-deal data so a volume spike can say why" | "block-deal data to put a volume spike in context" | FINN doesn't say why a stock moved, and the note shouldn't promise it |

Detailed is the default again, so the note's lines about the home screen ("one card per company") and about results cards are accurate as they stand. They no longer need changing. The body, from "What it is" up to the sign-off, was 365 words before the first change above, against the limit of 400. The first change adds about 13 words and the second is one word longer, so about 20 words remain.

## Still to decide when the note is edited

- **Key decisions, optional:** "Ranking weighs seniority, company size, kinds of event and the size of the move; a test checks every rank explanation against the data." Add it only if the word limit allows.
- **"Rules rank and place filings":** still accurate, keep it.
- **"A verifier bug found late":** still accurate, so keep it unless the bug gets fixed.
- **"A verifier bug found late":** block A adds a stronger story: an audit against the PDFs found 4 wrong figures of 89 on two cards (Equitas, HUL), since fixed, and 104 of 104 match now. Optional, if words allow: "I audited results against the PDFs, found 4 wrong figures of 89, fixed the cause and published the list." That's 19 words, so it uses nearly all the room left. Say the figures only as they stand in `EVAL.md` on the day.
- **Don't name the analyst on Kaynes' Q4 FY26 call.** Decided 3 Nov: not in the app, the notes or the docs.
- **Blocks B and C need no change to the note.** Optional, if words allow: "One formatter, and a test that fails on a raw number format." That's 11 words, and it competes with the audit line above, which says more.
- **Guidance Walk, optional, if words allow:** "Kaynes guided ₹4,500 crore, later about ₹4,000, and delivered ₹3,626: code reports 80.6% of the first promise, 90.7% of the last statement, with every step's page." That's 26 words, more than the room left, so it replaces something. It says more than the audit line for a reader who opens the Research tab, and less for one who asks how far to trust the figures. Don't write "cut" or "walked back" in the note either: the app reports arithmetic only.
- **"Nine walks":** say it only with the split, 1 revised and delivered, 5 held and delivered, 3 revised and open. Only one of the nine goes promise, revision, delivered.
- **"Promised vs delivered":** still accurate. The note doesn't mention the company rows' verdict counts, so their move to the scorecard changes nothing here.
- **No classifier accuracy in the note yet.** The gold set is sampled and unlabelled. Don't write a figure until `docs/EVAL.md` has one, and quote it with its sample size and its limits: the sample is drawn from FINN's own labels.
- **Later blocks:** the evaluation page, the ledger, Listen for and any new recordings will each add a line here when they land.
