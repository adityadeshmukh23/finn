# FINN

A mobile-first investor briefing. You open a ranked list of what changed across your portfolio, not a chatbox: one card per company, the routine paperwork collapsed into a count you can inspect, and every number tied to the page it came from.

**Try it on a phone: https://finn-olive.vercel.app** (a static replay of recorded data; see [what's recorded vs live](#whats-recorded-vs-live))

<p>
  <img src="docs/img/01-briefing.jpg" width="250" alt="Briefing: nine companies need a look, ranked cards, data-as-of badge">
  <img src="docs/img/02-results-card.jpg" width="250" alt="Results card: Reliance PAT, revenue, EBITDA with QoQ and YoY, computed by code, page link">
  <img src="docs/img/03-research-bel.jpg" width="250" alt="Promised vs delivered for BEL: 3 of 6 checkable promises met">
</p>

*Screenshots are the static build at 375px wide: briefing, a results card, and BEL's promised-vs-delivered scorecard.*

## Quickstart (Mac)

Needs Python 3.12 and Node 24 (what CI uses). First run installs dependencies; allow a couple of minutes once.

```bash
git clone https://github.com/adityadeshmukh23/finn.git && cd finn
./run.sh                        # live NSE data for the sample portfolio, then open http://localhost:5173
./run.sh TCS TITAN              # same, plus any other NSE tickers in the briefing
./run.sh research TCS           # record promised-vs-delivered research for any NSE ticker, then start the app
```

- No API key is needed to run. Without one, FINN replays the recordings in `data/recordings/` or uses mock output, and says so.
- `./run.sh research TICKER` makes live model calls, so it needs a free `GEMINI_API_KEY` in `.env` (get one at aistudio.google.com/apikey). It takes a few minutes per company and lands in the "Promised vs delivered" list on the home screen. If the free tier is out of quota it records nothing and tells you to re-run later.
- A ticker that screener.in has no earnings-call transcripts for (ITC, for one) is refused with a plain message, not a guess.
- Tests: `cd backend && ../.venv/bin/pytest -q` (151; no key needed).

## What it does

**Push: the briefing.** A windowed digest (24h, 3 days, 7 days, plus an as-of date so it works on quiet days) of every NSE filing across the portfolio.

- Rules classify and rank each filing; no model is involved in ranking. Routine filings collapse into a "hidden" row grouped by reason, with a count and every item inspectable.
- Quarterly results get a table: revenue, EBITDA, PBT, PAT, this quarter vs last quarter and vs a year ago. The cheap model copies figures off the filing; code verifies each figure is printed on the cited page and does all the arithmetic. If it can't, the card shows no numbers and says why.
- Management changes show who, role, effective date, reason (for exits) and background, all from the filing itself.
- End-of-day price and volume alerts (default 2× volume or ±4% in a day), thresholds editable in the app. A move with no filing behind it gets its own card.
- Each card says why it ranks where it does, and has **Ask FINN**, which opens research on that company.

**Pull: promised vs delivered.** For a company, what management guided on its last five earnings calls, against what it then reported.

- Primary sources only: transcripts and the annual report. screener.in is used as an index of links, nothing else.
- Every claim carries a quote, document, period and page. A verifier drops any quote that isn't on its cited page and any number that isn't in its quote. Dropped claims are listed in the app.
- Code sets the verdict on every numeric promise. A stronger model only groups restatements and judges milestones. If the documents don't say, FINN says so.

## Architecture

```mermaid
flowchart LR
  subgraph src["Public sources: polite, cached, snapshotted"]
    NSE["NSE announcements"]
    YF["Yahoo Finance end-of-day"]
    SCR["screener.in document index"]
    PDF["Transcripts + annual reports<br/>BSE / company IR PDFs"]
    SCR --> PDF
  end

  subgraph push["Push"]
    RULES["Rules: classify, score, group"]
    READ["Cheap model reads the filing<br/>only if rules can't place it"]
    VER1["Verifier: quote and numbers<br/>must be in the filing"]
    CALC["Code: QoQ, YoY, margins,<br/>volume multiples"]
    NSE --> RULES --> READ --> VER1
    YF --> CALC
  end

  subgraph pull["Pull"]
    CALLS["Cheap model reads each call<br/>and the annual report"]
    VER2["Verifier: quote on its page,<br/>number in its quote"]
    JUDGE["Strong model: group restatements,<br/>judge milestones"]
    VERD["Code sets numeric verdicts"]
    PDF --> CALLS --> VER2 --> JUDGE --> VERD
  end

  GATE["LLM gate: recording, then mock,<br/>then budget and rate guards,<br/>then provider. Cost ledger"]
  READ -.-> GATE
  CALLS -.-> GATE
  JUDGE -.-> GATE

  REC[("data/recordings<br/>verified outputs, committed")]
  GATE <--> REC

  VER1 --> API["FastAPI (local)"]
  CALC --> API
  VERD --> API
  REC --> STATIC["Static build: every day and window,<br/>pre-generated offline"]
  API --> PWA["React PWA, mobile first"]
  STATIC --> PWA
  PWA --> VERCEL["Vercel: static replay"]
```

Models are set in one place (`.env`, mapped to tasks in `backend/finn/models.py`): a cheap slot for bulk extraction, a strong slot with a fallback chain for judgement. Both default to Gemini's free tier; swapping either slot to Anthropic is an env change.

## What's recorded vs live

| | Public site | `./run.sh` locally |
|---|---|---|
| Briefing | Replay of NSE filings and Yahoo prices from 9 to 30 Oct 2026, labelled "Demo data as of 30 Oct, 8:29 pm" | Live NSE and Yahoo, falling back to the same snapshot with a "data as of" badge |
| Results and management cards | Recorded cheap-model reads of the 30 Oct filings | Same recordings; filings newer than the snapshot get rules only until you run `python -m scripts.read_filings` |
| Research | Recorded for BEL, Kaynes, Coforge, Dixon and Asian Paints | Same, plus anything you record with `./run.sh research TICKER` |
| Model calls | None. No key exists on any public host | Only if you add a key, and only for what isn't already recorded |
| Cost ledger | $0.00, with a note that replay makes no calls | Live ledger: tokens, cost, free-tier limits, $5 hard cap |
| Backend | None. There is no live API behind the public link | FastAPI on :8000 |

The public site cannot fetch live filings or research a new ticker. That is deliberate (no key to leak, nothing that sleeps or hits a cold start), and [docs/DESIGN.md](docs/DESIGN.md) says why.

Unseen tickers: `backend/scripts/smoke_unseen.py` runs the document index, one transcript and one cheap-model read on tickers outside the portfolio and research set. On TCS and Titan it passed; ITC was refused because screener.in lists no transcript links for it. The run writes nothing into the shipped recordings.

## Docs

- [docs/DESIGN.md](docs/DESIGN.md): decisions and trade-offs, what was left out, known weak spots, next steps
- [docs/COST.md](docs/COST.md): model routing, call counts, tokens, cost
- [docs/DECISIONS.md](docs/DECISIONS.md): the running log, with the why behind each choice
- [docs/BUILD_HISTORY.md](docs/BUILD_HISTORY.md): the build sessions
- [docs/DEPLOY.md](docs/DEPLOY.md): Vercel steps

## Refresh the snapshot and demo data

```bash
cd backend && ../.venv/bin/python -m scripts.record_snapshots 21 && ../.venv/bin/python -m scripts.build_static
```

CI (`.github/workflows/ci.yml`) runs the tests, checks the demo data matches the snapshot and ranking code, fails if a PDF, `.env` or sqlite file is tracked, and builds the web app.
