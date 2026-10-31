"""Smoke test on NSE tickers FINN was never built around: document index, one transcript, one cheap-model read.

Usage (from backend/): python -m scripts.smoke_unseen [TICKER ...]     (default: TCS ITC TITAN)

Per ticker it checks that screener.in's document index resolves, that a usable earnings-call
transcript can be fetched and dated, and that ONE cheap-model call on it comes back with claims
whose quotes the verifier finds on their cited pages.

Each ticker ends PASS, REFUSED or FAIL. REFUSED is the designed outcome when the source has nothing
to work from (e.g. screener lists no transcript links): FINN says so in plain words and stops.
FAIL is anything else that went wrong. Exit code 1 only if a ticker FAILs.

Nothing it produces touches the repo: data dir, HTTP cache, ledger and recordings all go to a
throwaway temp directory, so shipped recordings and the cost ledger are unchanged. Cheap slot only
(it refuses to route to the strong slot), LLM_RETRIES=0 (one request per call), and screener/BSE
are fetched at the usual one request per 3 s per host.
"""
import os
import sys
import tempfile
from pathlib import Path

# Must be set before finn.config is imported: it reads the environment once, at import.
SCRATCH = Path(tempfile.mkdtemp(prefix="finn-smoke-"))
os.environ["FINN_DATA_DIR"] = str(SCRATCH)
os.environ["LLM_RETRIES"] = "0"
os.environ["LLM_MODE"] = "auto"
os.environ.pop("PUBLIC_DEMO", None)

from finn import db, http, llm, models  # noqa: E402
from finn.config import REPO_ROOT, settings  # noqa: E402
from finn.research import docs, pvd  # noqa: E402

DEFAULT = ["TCS", "ITC", "TITAN"]
TRIES = 4        # transcript rows tried per ticker before giving up


def _already_known() -> set[str]:
    import json
    cfg = json.loads((REPO_ROOT / "data" / "portfolio.json").read_text())
    return {p["symbol"] for p in cfg["portfolio"]} | set(cfg["research"])


def _cheap_only(real_call):
    """Wrap the LLM gate so a purpose routed to the strong slot fails loudly instead of spending its quota."""
    def guarded(purpose, *a, **kw):
        if models.slot_for(purpose).name != "cheap":
            raise RuntimeError(f"smoke test is cheap-model only; '{purpose}' routes to {models.slot_for(purpose).name}")
        return real_call(purpose, *a, **kw)
    return guarded


def smoke(symbol: str) -> tuple[str, list[str]]:
    """(PASS | REFUSED | FAIL, report lines). The last line says which stage stopped and why."""
    out: list[str] = []

    # 1. document index
    try:
        idx = docs.index(symbol)
    except docs.Unavailable as e:
        return "REFUSED", [f"index: {e}"]
    if idx.get("source") == "snapshot":
        return "FAIL", [f"index: served from a snapshot, not live ({idx.get('message')})"]
    out.append(f"index: {len(idx['concalls'])} call rows, {len(idx['annual_reports'])} annual reports"
               f" ({idx.get('name') or 'name unknown'}; {idx['source']})")

    # 2. one usable earnings-call transcript
    doc = pg = None
    skipped = []
    linked = [r for r in idx["concalls"] if r["transcript"]]
    if not linked:
        # Same path the app takes: choose() skips every row and says why. Nothing further is fetched.
        try:
            docs.choose(symbol)
        except docs.Unavailable as e:
            return "REFUSED", out + [f"transcript: screener lists a call row but no transcript link on any of "
                                     f"{len(idx['concalls'])}; the app says: \"{e}\""]
        return "FAIL", out + ["transcript: no links, yet choose() found documents"]
    for row in linked[:TRIES]:
        try:
            text = docs.pages(row["transcript"])
        except http.FetchError as e:
            skipped.append(f"{row['month']}: PDF not fetched ({e})")
            continue
        if sum(len(p) for p in text) < 2000:
            skipped.append(f"{row['month']}: scanned image, no text")
            continue
        if docs.transcript_kind(text) != "earnings":
            skipped.append(f"{row['month']}: not an earnings call")
            continue
        per = docs.transcript_period(text)
        doc = docs.Doc(f"T-{per.label.replace(' ', '')}", "transcript", f"{per.label} earnings call", per.label,
                       row["transcript"], len(text), row["month"])
        pg = text
        break
    out += [f"  skipped {s}" for s in skipped]
    if doc is None:
        return "FAIL", out + [f"transcript: no usable earnings call in the first {min(TRIES, len(linked))} linked rows"]
    out.append(f"transcript: {doc.period}, {doc.pages} pages, listed as {doc.listed_as}")

    # 3. one cheap-model read, then the verifier
    read, res = pvd.read_call(doc, pg)
    tokens = db.conn().execute(
        "SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0) FROM ledger WHERE source='live'").fetchone()
    out.append(f"model: {res.source} {res.model or ''} {res.note}".rstrip()
               + f" · {tokens[0]:,} in / {tokens[1]:,} out tokens so far")
    if read is None:
        kind = {"blocked": "model unavailable (quota, rate limit or provider error), not a FINN fault",
                "mock": "no GEMINI_API_KEY, so nothing was called"}.get(res.source, "model returned no usable output")
        return "FAIL", out + [f"extraction: {kind}: {res.note or res.source}"]
    if res.source != "live":
        return "FAIL", out + [f"extraction: expected a live call, got {res.source}"]

    kept, dropped = 0, []
    for p in read.promises:
        item = p.model_dump() | {"horizon": pvd.canonical(p.horizon)}
        why = pvd._check(item, pg, ("target_low", "target_high"))
        kept, dropped = (kept + 1, dropped) if not why else (kept, dropped + [(p.label, p.page, why)])
    for a in read.reported:
        item = a.model_dump() | {"period": pvd.canonical(a.period)}
        why = pvd._check(item, pg, ("value",))
        kept, dropped = (kept + 1, dropped) if not why else (kept, dropped + [(a.label, a.page, why)])
    total = len(read.promises) + len(read.reported)
    out.append(f"claims: {total} read, {kept} verified on their cited page, {len(dropped)} dropped")
    for label, page, why in dropped[:5]:
        out.append(f"  dropped '{label}' p.{page}: {why}")
    if total == 0:
        return "FAIL", out + ["extraction: the model read no promises or reported figures from the transcript"]
    if kept == 0:
        return "FAIL", out + ["verification: every claim was dropped by the verifier"]
    return "PASS", out


def main() -> int:
    symbols = [s.upper() for s in sys.argv[1:]] or DEFAULT
    assert settings.data_dir == SCRATCH and SCRATCH != REPO_ROOT / "data", "refusing to run against the shipped data dir"
    llm.call = _cheap_only(llm.call)
    known = _already_known() & set(symbols)
    if known:
        print(f"note: {', '.join(sorted(known))} are in the portfolio or research set, so not unseen")
    print(f"scratch data dir {SCRATCH} (recordings, cache and ledger land here, not in the repo)")
    print(f"cheap slot {settings.slots['cheap'].provider}:{settings.slots['cheap'].model}, retries {settings.retries}, "
          f"live {settings.live(settings.slots['cheap'])}\n")
    results: dict[str, int] = {}
    for sym in symbols:
        try:
            ok, lines = smoke(sym)
        except Exception as e:      # a crash is a result too: report it, keep going
            ok, lines = "FAIL", [f"unexpected {type(e).__name__}: {e}"]
        print(f"{ok} {sym}")
        print("\n".join(f"   {line}" for line in lines))
        results[ok] = results.get(ok, 0) + 1
    live = db.conn().execute("SELECT COUNT(*), COALESCE(SUM(cost_usd),0) FROM ledger WHERE source='live'").fetchone()
    tally = ", ".join(f"{n} {k}" for k, n in sorted(results.items()))
    print(f"\n{tally} · {live[0]} live cheap-model call(s), ${live[1]:.2f}")
    return 1 if results.get("FAIL") else 0


if __name__ == "__main__":
    sys.exit(main())
