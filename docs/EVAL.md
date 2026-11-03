# How FINN was checked

What was measured, what was fixed, and what wasn't measured. **No classifier accuracy number is reported, because the gold set wasn't labelled.**

## Results cards against the filings

Run with `python -m scripts.audit_results` from `backend/`. It needs the filing PDFs in the local cache, which are never committed, so it isn't part of CI.

| | Before block A | After block A |
|---|---|---|
| Figures compared | 89: revenue, PBT, PAT in 3 columns, 10 companies | 104: the same 81 on 9 companies, plus 23 EBITDA figures rebuilt from their printed inputs |
| Match | 85 | 104 |
| Wrong | 4: Equitas current PAT, HUL revenue in 3 columns | 0 |
| Printed but missing | 1: Equitas prior-quarter PAT | 0, because Equitas is now withheld |
| Method | Line by line against the PDF text, by hand | The script, with row labels and column order set by hand for each card |

The two counts aren't the same test: the second is wider and scripted. The script was tested on known errors. It flags all 3 of HUL's old revenue figures, a swapped pair of columns on L&T, and a PAT taken from the wrong row on Reliance.

8 of the 17 recorded cards show no figures, so they aren't in the count. 6 are low confidence (HDFC Bank, Sterling Tools, Maruti, Home First, Sun Pharma, Equitas) and 2 have no table read (Info Edge, Deepak Nitrite). Withholding this many is the cost of the rule, and no accuracy is claimed for those 8.

## Errors found and fixed

All of these had passed the verifier. It proves a number or quote is on the cited page. It doesn't prove the right row, column or meaning.

| Card | What FINN showed | What the filing says | Now | Rule added |
|---|---|---|---|---|
| Equitas, Sep 2026 qtr | PAT ₹184 cr, +660.6% YoY. ₹184 cr is the June quarter's profit | PBT 28,738.39 less tax 6,934.42 = 21,803.97 lakh, so **₹218 cr, +803.4% YoY, +18.8% QoQ** | Figures withheld, with a link to p.3 | A page where 80% or more of the figures sit alone on a line has no rows to trust: no model call, no figures |
| HUL, Sep 2026 qtr | Revenue ₹18,037 cr, +14.8% YoY, +5.2% QoQ. That's "Sale of products" only | Three lines under "Revenue from operations" total **₹18,226 cr, +14.5% YoY, +5.1% QoQ** | Corrected, and the card says it's a sum | Code adds the parts, and the sum must reach the printed total income line in all three columns |
| BEL, FY27 EBITDA margin | "Revised to 21%–23%" | One call says both: p.5 keeps 28%, p.21 gives 21% to 23% | "Two statements on this call differ", with both quotes | "Revised" needs a later call and a period stated in the quote |
| Coforge, FCF to PAT | "Revised to 70%–80%" | A passing mention of guidance, with no period | "No period stated" | Same |

**Why ₹218 cr for Equitas is right, and why FINN still doesn't show it.** The page's text has every figure on its own line, so nothing ties a number to a label. Two sums prove it by hand: 28,738.39 − 6,934.42 = 21,803.97, which is printed, and 21,803.97 + 18,360.69 = 40,164.66, which is printed as the half-year profit. That also shows 18,360.69 is June. FINN withholds rather than rebuild a table from loose numbers.

**A second net.** Every card now also has to pass three checks that don't need the page: PAT can't exceed PBT, implied tax must be 10% to 35%, and a current figure can't repeat another column of its row. On the recorded cards this catches Equitas independently (36.1%) and Sterling Tools (65.9% and 54.4%, already low). It changes no other card's confidence. HUL's error isn't the kind it catches.

## What these checks can't show

- **The audit reads the PDF's text layer, not the page image.** Where the text layer itself misreads a printed figure, the card and the audit can agree and both be wrong.
- **Row labels and column order are set by hand for these 9 cards.** A new filing is covered by the rules above, not by this audit.
- **The tax band is set from 15 cards.** A real one-off, such as a large tax credit, will withhold a correct card. That's the intended direction of failure.
- **HUL's rule was written for HUL's layout.** It fails closed on any other: if the sum can't be proved, the card is withheld.

## The verifier

| Where | Result |
|---|---|
| Research, all 5 recorded companies | 166 claims shown, 51 dropped: 23.5% of those considered. 17 of the drops are "quote not found on the cited page" |
| Filing reads | 38 of 39 pass. The one that fails keeps the rules' label |

**What this shows:** the verifier throws out a lot, and every claim shown has its quote or number on its page. **What it doesn't show:** it proves a quote or number is on the page, not that it's the right column or the right meaning. Equitas passed it, and so did HUL. A drop rate is also not an error rate: some dropped claims were true, and a stricter check would drop more.

## Price rows and Book counts against the company file

An audit over all 66 recorded briefings, at default alert settings, found rows that disagreed with the company file. All are fixed, and `trust.test.ts` holds them over every recording at two alert settings.

| What disagreed | Count |
|---|---|
| Price rows saying "No filing in this window" when routine filings existed | 55 |
| The same claim with material filings on that session | 5 |
| "Last filing" lines that were the heaviest of that day, not the last | 5 |
| Filings on a card, or in the hidden list, missing from the company file | 48 and 64 |
| Book counts disagreeing with the file | 112 |
| Rows showing a close from before the filing beside it | 45 |

## The filing classifier: a gold set prepared, not labelled

**A blind 60-filing gold set was prepared but wasn't labelled in time, so no classifier accuracy number is reported.** `data/eval/gold_blind.csv` holds 60 of the 229 recorded filings, in NSE's own words, in shuffled order, with an empty `my_label` column. FINN's own labels are held back in a separate key file, `data/eval/gold_key.csv`. The sample used a fixed seed and no model calls. `data/eval/categories.md` has the definitions. `python -m scripts.eval_gold` from `backend/` rebuilds the files, and it needs the local PDF cache.

**What it would and wouldn't have shown, if labelled.**

- **Pledging, bonus or split, and insider trades have no filings in the recording,** by FINN's labels and in NSE's own category and subject words, so it couldn't cover them.
- **Postal ballot is in the glossary, but FINN's rules never assign it.** They file ballots under `agm_egm`.
- **Per-category counts are tiny: 10 at most, and 1 for capex.** No percentage should be shown below 20 items.
- **2 of 60 rows say "summary only".** Their PDFs have no text to extract.
- **The sample is drawn from FINN's own labels,** so agreement wouldn't be accuracy across all filings.
- **The window is 22 days across 18 holdings, with one reviewer.**

## What can't be measured here

**Ranking weights.** There's no labelled preference data and no investor behaviour in this project. The weights were hand-set and then checked by reading the briefings. `ranking.test.ts` proves every rank explanation is true of the data, not that the order is the best one.

## Definitions a reader should know

These match their printed rows, so they aren't mismatches, but a reader might expect a different line.

- **PAT is the line before the share of associates and joint ventures** on Reliance (₹29,250 cr, +32.1% YoY; with the share, ₹29,550 cr, +33.8%) and L&T (₹5,915 cr, +26.2%; with the share, ₹5,949 cr, +27.2%).
- **HUL's PAT is the period total**, including discontinued operations: the year-ago 2,694 against 2,791 from continuing operations.
- **Infosys's card is standalone,** and says so.
