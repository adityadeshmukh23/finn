# Cost

**Total model spend while building FINN: $0.00.** Both model slots run on Gemini's free tier. The public site makes no model calls at all.

Figures below come from the build machine's cost ledger (`data/cache/finn.sqlite`, gitignored), 30 Oct 22:08 to 1 Nov 04:45 2026. The same ledger feeds the in-app cost sheet when FINN runs locally; the public replay shows $0.00 because it makes no calls.

## Model routing

Rules first, then a cheap model, then a stronger model only where reasoning is needed. Slots, models, prices and limits are set in `.env` and mapped to tasks in `backend/finn/models.py`.

| Step | Who does it | Slot | Why |
|---|---|---|---|
| Classify and rank 229 filings | Regex rules | none | NSE already tags category and summary; free and deterministic |
| Read a filing the rules can't place, or that needs a summary (39 of 229) | `gemini-3.5-flash-lite` | cheap | Bulk extraction with a verbatim quote, checked by code |
| Results table, management-change details | `gemini-3.5-flash-lite` | cheap | Copies figures; code verifies and does all arithmetic |
| Read each earnings call and the annual report | `gemini-3.5-flash-lite` | cheap | A transcript is about 15k tokens; read whole, once |
| Group restatements, judge milestones | `gemini-3.8-flash`, then 3.7, then 3.6 | strong | The only step that needs reasoning; falls back when overloaded or out of quota |
| Every numeric verdict, growth, margin, volume multiple | Code | none | A model never does arithmetic that reaches a card |

## Calls by model and outcome

Every model call goes through one gate that logs a row per attempt. **Live** means the provider answered. **Blocked** means no usable answer: a provider 429, 503 or 504, a timeout, or our own rate, quota or budget guard stopping the call first. **Replayed** means a recorded output was served and no API call was made.

| Model | Slot | Live | Blocked | Replayed | Input tokens | Output tokens | Cost |
|---|---|---:|---:|---:|---:|---:|---:|
| gemini-3.5-flash-lite | cheap | 131 | 26 | 202 | 814,111 | 96,059 | $0.00 |
| gemini-3.8-flash | strong | 6 | 7 | 12 | 166,906 | 67,320 | $0.00 |
| gemini-3.7-flash | strong | 2 | 5 | 7 | 58,918 | 17,212 | $0.00 |
| gemini-3.6-flash | strong | 6 | 2 | 8 | 145,901 | 49,325 | $0.00 |
| **Total** | | **145** | **40** | **229** | **1,185,836** | **229,916** | **$0.00** |

Output tokens include the model's thinking tokens. The strong slot's 14 live calls carry 371,725 input and 133,857 output tokens, which is why it is kept to judgement only.

Cheap-slot live calls by task: filing classification 43, filing summaries 16, results tables 18, management changes 16, earnings-call reads 30, annual-report reads 8. Strong-slot: 14 verdict calls for the research set, reruns included.

Why the numbers look this way:

- **Rules took the bulk.** 190 of 229 filings never reached a model.
- **Caching did the rest.** Of 414 gate calls, 229 (55%) were replays of recorded outputs, 145 (35%) were live, 40 (10%) were blocked. Re-running after a rules change cost no model calls. A filing or transcript is read once, ever.
- **One block is not one failure of FINN.** The strong-slot blocks are the fallback chain doing its job: a 503 or 504 on 3.8 or 3.7 handed the request to the next model, and the run that finally answered is what got recorded.

## Caveats

- **Our ledger undercounts Google's.** The SDK retries 503s itself and attempts that time out count against the quota on Google's side. On 1 Nov Google stopped `gemini-3.8-flash` at its 20-a-day limit while our ledger showed 11 calls to it. Treat per-model counts as a lower bound. Research runs use `LLM_RETRIES=0` for this reason.
- **Blocked rows don't say why.** The ledger has no reason column; the reason is in the `_meta` of the recording that finally answered, and in the run's log.
- **Not in this ledger:** the unseen-ticker smoke test, which writes to a throwaway ledger so it can't touch the shipped one. Two runs of two cheap-model calls each (TCS and Titan) used 55,272 input and 7,565 output tokens in total.
- **"Free" has terms.** Google may use free-tier inputs to improve its products. FINN sends only public exchange filings and transcripts. Free-tier limits are per project and not published per model; the defaults in `.env.example` (cheap 10 requests a minute and 500 a day, strong 5 and 20) are conservative, and the real ones are in AI Studio.
- **Paid swap.** Setting a slot's provider and prices in `.env` makes the ledger cost it and the $5 hard cap apply. No paid model was used, so no paid price has been measured.

## For the cover note

| Slot | Model | Task | Live ok / failed | Tokens in / out | Cost |
|---|---|---|---|---|---:|
| Rules | none | Rank 229 filings | n/a | none | $0 |
| Cheap | gemini-3.5-flash-lite | Filing, results, management and call reads | 131 / 26 | 814k / 96k | $0 |
| Strong | gemini-3.8, 3.7, 3.6-flash | Group restatements, judge milestones | 14 / 14 | 372k / 134k | $0 |
| Public site | none | Replay only | 0 | none | $0 |

Ledger undercounts Google's own count, so read these as lower bounds.
