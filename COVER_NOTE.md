**To:** assessment@enam.com
**Subject:** ENAM - IIT screening - 2027

Hello,

I built FINN, a mobile-first investor agent.

- Live (open on a phone): [LIVE LINK]
- Repo: [REPO LINK]
- Build history: [BUILD HISTORY LINKS]

**What it is.** The home screen is a ranked briefing, not a chatbox: one card per company for a window and as-of date I pick, with routine filings collapsed into a count I can open. Results cards show revenue, EBITDA, PBT and PAT with QoQ and YoY; management changes show who, role, date and background; price and volume alerts have editable thresholds. "Ask FINN" opens promised vs delivered: what management guided across five earnings calls against what it reported, from transcripts and annual reports only, with a page citation on every claim.

**Key decisions.**
- Rules rank and place filings. The cheap model reads only the 39 of 229 the rules can't place or that need a summary.
- Code does all arithmetic and sets every numeric verdict. The model only copies figures and quotes. A verifier drops any quote not on its cited page and any number not in its quote. If the documents don't say, FINN says so.
- The public site is a static replay of recorded data: no key to leak, no cold start. It can't fetch live filings; `./run.sh` can, for any NSE ticker.

**Left out.** Cash quality, balance sheet, trajectory, bull vs bear, web bios for new executives (LinkedIn means logging in) and push notifications. One lens verified end to end beats four that aren't.

**Weak spots.**
- Asian Paints has no checkable promise: its management guides in words, so its scorecard has no verdict.
- Gemini's free tier was flaky (503s, daily quotas), so research is recorded ahead of time behind a fallback chain.
- "Not found" can be a search miss, not proof of absence.
- No live backend behind the public link.
- A verifier bug found late: figures like "0.5%" are wrongly dropped. It fails closed and is documented. [delete if fixed]

**Cost.** $0. Both model slots ran on Gemini's free tier: 145 live calls, 1.2M input and 230k output tokens (lower bounds; our ledger undercounts Google's). The public site makes no model calls.

**Next.** Fix the verifier bug, add financial-snapshot and trajectory lenses on the same verified data, block-deal data so a volume spike can say why, and a hosted API with real push.

Thanks,
Aditya Deshmukh

---

*Draft notes, not part of the email:*

- Fill `[LIVE LINK]` (the deployed site is https://finn-olive.vercel.app), `[REPO LINK]` (remote is https://github.com/adityadeshmukh23/finn; confirm it is public or shared with ENAM) and `[BUILD HISTORY LINKS]` (one per row in `docs/BUILD_HISTORY.md`).
- The email body above is under 400 words.
- The brief asks for a deployed link, the repository, the AI build history and a short writeup, all in one email.
