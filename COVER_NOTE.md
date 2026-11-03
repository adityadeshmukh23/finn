**To:** assessment@enam.com
**Subject:** ENAM - IIT screening - 2027

Hello,

I built FINN, a mobile-first investor agent.

- Live (open on a phone): [LIVE LINK]
- Repo: [REPO LINK]
- Build history: [BUILD HISTORY LINKS]

**What I built.** Briefing first, chat second. Today is a ranked list of what changed across a portfolio, with routine filings collapsed into a count you can open. Detailed is the default and shows each company's reason and figures; Compact shows the top three. Ask FINN opens a company file, and Research sets what management promised on earnings calls against what it delivered, with a page on every claim.

**Key decisions.**
- The public site is a static replay: no key to leak, no cold start, no live data. `./run.sh` runs live for any NSE ticker.
- The model extracts; code computes every number and numeric verdict. A verifier checks every claim against its page, which proves it's there, not that it's the right column.
- Routing goes rules, then a cheap model, then a strong one, all on free tiers. Cost is $0, though my ledger undercounts Google's calls.

**What I measured and fixed.** Building Compact cut the first screen from 52 to 24 text elements. My own audit found wrong figures on the Equitas and HUL results cards, and 55 price cards saying nothing was filed when filings existed. All are fixed and guarded by tests. Now 104 of 104 figures match, read from the PDF text layer.

**Left out.**
- Web bios: LinkedIn means logging in.
- Push notifications and a live backend: a static demo can't break mid-review.
- Cash quality: one lens verified end to end beats several that aren't.
- Tap-to-explain figures: out of time.
- Classifier accuracy: I prepared a blind 60-filing gold set but didn't label it, so I report no number.
- Company logos: a third-party request on a site that says nothing is live.

**Weak spots.**
- Asian Paints has no checkable promise; its management guides in words.
- Free tiers were flaky, so research is recorded ahead of time.
- "Not found" can be a search miss.
- Ranking weights are hand-set, with no preference data to test them.
- I tested with three people, which proves nothing.
- Mobile PDF page links aren't tested on every device.

**Next.** Real push on a hosted API, more lenses on the same verified data, and a company report card in the spirit of Simply Wall St, built only from verified facts (results confirmed, promises met, filings) with no composite score.

Thanks,
Aditya Deshmukh

---

*Draft notes, not part of the email:*

- Fill `[LIVE LINK]` (the deployed site is https://finn-olive.vercel.app), `[REPO LINK]` (remote is https://github.com/adityadeshmukh23/finn; confirm it is public or shared with ENAM) and `[BUILD HISTORY LINKS]` (one per row in `docs/BUILD_HISTORY.md`).
- The brief asks for a deployed link, the repository, the AI build history and a short writeup, all in one email.
