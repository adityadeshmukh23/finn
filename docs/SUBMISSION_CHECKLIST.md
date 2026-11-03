# Submission checklist

The brief asks for four things, in this order: the mobile prototype link, the GitHub repository, the AI build history, and a short writeup in the covering email. The email below follows that order, with the writeup as its body.

## The email

**To:** assessment@enam.com
**Subject:** ENAM - IIT screening - 2027

Hello,

I built FINN, a mobile-first investor agent.

- Live (open on a phone): [LIVE LINK]
- Repo: [REPO LINK]
- Build history: [BUILD HISTORY LINKS]

**What I built.** Briefing first, chat second. Today ranks what changed across a portfolio and collapses routine filings into a count you can open. Detailed, the default, shows each company's reason and figures; Compact shows the top three. Ask FINN opens a company file; Research sets management's promises against delivery, with a page on every claim.

**Key decisions.**
- The public link is a recorded replay as of 30 Oct. The engine fetches live NSE data via ./run.sh TICKER and works where screener.in lists transcripts (tested on TCS and Titan; ITC is refused cleanly because none are listed). No key to leak, no cold start.
- The model extracts; code computes every number and numeric verdict. A verifier checks every claim against its page: that proves it's there, not the right column.
- Rules, then a cheap model, then a strong one, all free tier: $0, though my ledger undercounts Google's calls.

**What I measured and fixed.** Building Compact cut the first screen from about 52 to about 24 text elements at 390x844. My audit found wrong figures on the Equitas and HUL cards, and 55 price cards wrongly saying nothing was filed. All fixed, with tests. Now 104 of 104 figures match, read from the PDF text layer. Results figures show for 9 of 17 cards; the rest are withheld on purpose.

**Left out.**
- Web bios: LinkedIn means logging in, so bios come from the filing plus a search link.
- Push notifications and a live backend: a static demo can't break mid-review.
- Cash quality: one verified lens beats several unverified.
- Tap-to-explain figures: out of time.
- Classifier accuracy: a blind 60-filing gold set is prepared but unlabelled, so no number.
- Company logos: a third-party request.

**Weak spots.**
- Asian Paints has no checkable promise: it guides in words.
- Free tiers were flaky, so research is pre-recorded.
- "Not found" can be a search miss.
- Ranking weights are hand-set and untested.
- Mobile PDF page links aren't tested everywhere.

**Next.** Real push, more lenses, and a company report card in the spirit of Simply Wall St, built only from verified facts (results confirmed, promises met, filings) with no composite score.

Thanks,
Aditya Deshmukh

Before sending, make this email match `COVER_NOTE.md` if that file has changed since this copy. The email is the body of the cover note, without the draft notes.

## By hand, before sending

- [ ] Repo is public (or shared with ENAM). Open it logged out.
- [ ] Push `main` and tag it, then confirm CI is green on the tag.
- [ ] Open the production site in a private window, then on a phone. Check the briefing, Ask FINN, Research and the (i) sheet.
- [ ] Open every link in the email while logged out of GitHub, Vercel and the chat tools. Fill each `[LINK]` in `docs/BUILD_HISTORY.md` with a link that opens logged out, or remove that row's link and say "on request".
- [ ] Replace `[LIVE LINK]`, `[REPO LINK]` and `[BUILD HISTORY LINKS]` in the email.
- [ ] Delete the "Draft notes" section at the foot of `COVER_NOTE.md`.
- [ ] Read `docs/BUILD_HISTORY.md` against `docs/BUILD_HISTORY_SOURCES.md` once.
- [ ] After sending, delete your GitHub token.

## CI

`.github/workflows/ci.yml` runs on every push: backend tests, demo-data freshness, the tracked-secrets guard, the web build with `check:sw` and `check:demo`, then web tests and `check:size`. Confirm it is green on the tag before you send.
