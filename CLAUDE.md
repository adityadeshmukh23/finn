# FINN: ENAM build challenge

Mobile-first financial investment agent with Push (digest + alerts) and Pull (primary-source research).
Brief: docs/BRIEF.pdf. Glossary: docs/GLOSSARY.pdf. Read the brief before planning.
Deadline: Sun 1 Nov 2026. Thin-but-working beats broad-but-broken. A demo that doesn't run is the worst outcome.
Graded on: product sense, judgment, architecture, creativity, cost efficiency. Not completeness.

## Product point of view
Briefing first, chat second. The home screen is a ranked, swipeable briefing, not a chatbox.
Each card: one decision-relevant item, a one-line "why you should care", source link.
Routine filings collapse into a count so the investor sees what was filtered out.
Each card has "Ask FINN", which opens research grounded in that company/document.

## Engineering rules
- LLM extracts and explains. Deterministic code does ALL arithmetic (QoQ, YoY, volume ratios, margins).
- Pull mode uses primary sources only (annual reports, concall transcripts). No outside knowledge.
  Every claim carries a citation (doc, period, page). A verifier pass checks quotes/numbers exist in the cited chunk.
  If sources don't contain the answer, say so.
- Every live data source has a recorded snapshot in data/snapshots/ and falls back silently, with a "data as of" badge.
  Add an "as-of" date control so the demo works on quiet days.
- Must work for any NSE ticker, not just demo tickers. Fail gracefully with clear messages.
- Model routing: rules first, then a cheap model, then a stronger model only where reasoning needs it.
  Models are configured in one place. Cache everything (HTTP, parsed docs, embeddings, LLM outputs by input hash).
- Log tokens and approximate cost per call (cost ledger) and expose it in the app.
- Provide a mock/recorded LLM mode so the app runs without an API key.
- Never fabricate data, quotes or numbers. Surface source failures honestly.
- Fetch politely: rate limits, caching, no bypassing logins/CAPTCHAs/paywalls.
- Secrets only in .env (keep .env.example). Never print keys.

## Quality bar
- No AI slop. Concise copy, lead with the number, designed empty/loading/error states.
- Test at 375px width. Test the numeric code and the citation verifier.

## Workflow
- Plan first, then build in small steps. Ask before big scope.
- After each phase: run tests and the app, commit with a clear message, append key decisions (and the why) to docs/DECISIONS.md.
- Give me a 5-line status at phase end: works / fragile / next.

## Stack
(filled in after planning)
