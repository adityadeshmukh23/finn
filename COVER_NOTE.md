**To:** assessment@enam.com
**Subject:** ENAM - IIT screening - 2027

Hello,

I built FINN, a mobile-first investor agent.

- Live (open on a phone): [LIVE LINK]
- Repo: [REPO LINK]
- Build history: [BUILD HISTORY LINKS]

**What I built.** Briefing first, chat second. Today ranks what changed across a portfolio and collapses routine filings into a count you can open. Detailed, the default, shows each company's reason and figures; Compact shows the top three. Ask FINN opens a company file; Research sets management's promises against delivery, with a page on every claim.

**Key decisions.**
- The public link is a recorded replay as of 30 Oct; the engine fetches live NSE data and works on any ticker via ./run.sh TICKER (tested on TCS and Titan). No key to leak, no cold start.
- The model extracts; code computes every number and numeric verdict. A verifier checks every claim against its page: that proves it's there, not the right column.
- Rules, then a cheap model, then a strong one, all free tier: $0, though my ledger undercounts Google's calls.

**What I measured and fixed.** Building Compact cut the first screen from about 52 to about 24 text elements at 390x844. My own audit found wrong figures on the Equitas and HUL cards, and 55 price cards wrongly saying nothing was filed. All fixed, with tests. Now 104 of 104 figures match, read from the PDF text layer. Results figures show for 9 of 17 cards; the rest are withheld on purpose.

**Left out.**
- Web bios: LinkedIn means logging in, so bios come from the filing plus a search link.
- Push notifications and a live backend: a static demo can't break mid-review.
- Cash quality: one verified lens beats several unverified.
- Tap-to-explain figures: out of time.
- Classifier accuracy: a blind 60-filing gold set is prepared but unlabelled, so no number.
- Company logos: they'd be the site's only third-party request.

**Weak spots.**
- Asian Paints has no checkable promise: it guides in words.
- Free tiers were flaky, so research is pre-recorded.
- "Not found" can be a search miss.
- Ranking weights are hand-set and untested.
- Mobile PDF page links aren't tested everywhere.

**Next.** Real push, more lenses on the same verified data, and a company report card in the spirit of Simply Wall St, built only from verified facts (results confirmed, promises met, filings) with no composite score.

Thanks,
Aditya Deshmukh

---

*Draft notes, not part of the email:*

- Fill `[LIVE LINK]` (the deployed site is https://finn-olive.vercel.app), `[REPO LINK]` (remote is https://github.com/adityadeshmukh23/finn; confirm it is public or shared with ENAM) and `[BUILD HISTORY LINKS]` (one per row in `docs/BUILD_HISTORY.md`).
- The brief asks for a deployed link, the repository, the AI build history and a short writeup, all in one email.
