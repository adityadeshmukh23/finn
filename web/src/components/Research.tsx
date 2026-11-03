import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { verdictLine } from '../format'
import { fetchResearch, NotRecorded, type Research as R, type ResearchDoc, type ScoreRow, type Verdict } from '../api'

const LABEL: Record<Verdict, string> = {
  missed: 'Missed',
  partially: 'Partially',
  met: 'Met',
  not_found: 'Not found in the documents',
  too_vague: 'Too vague to judge',
  not_yet_due: 'Not yet due',
}
const SHORT: Record<Verdict, string> = { ...LABEL, not_found: 'Not found', too_vague: 'Too vague' }
const PILL: Record<Verdict, string> = {
  met: 'bg-up/12 text-up',
  partially: 'bg-raised text-ink',
  missed: 'bg-down/12 text-down',
  not_found: 'bg-raised text-ink-2',
  too_vague: 'bg-raised text-ink-2',
  not_yet_due: 'bg-raised text-ink-3',
}
const ORDER: Verdict[] = ['missed', 'partially', 'met', 'not_found', 'too_vague']
const STAGE: Record<string, string> = {
  promise: 'Promise', reported: 'Reported figure', evidence: 'Evidence', verdict: 'Reasoning',
  annual_report: 'Annual-report figure', read: 'Call',
}

const model = (m: string | null | undefined) => (m ?? '').replace(/^[a-z]+:/, '')
const why = (w: string) =>
  /504|deadline|timed out/i.test(w) ? 'timed out' : /503|demand|overload/i.test(w) ? 'overloaded'
    : /quota/i.test(w) ? 'out of quota' : /429|rate/i.test(w) ? 'rate-limited' : 'unavailable'
const inr = (v: number | null) => (v === null ? '–' : v.toLocaleString('en-IN', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 }))

function Pill({ v }: { v: Verdict }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-meta font-semibold ${PILL[v]}`}>{SHORT[v]}</span>
}

function Src({ docs, doc, page, children }: { docs: Record<string, ResearchDoc>; doc: string; page: number | null; children?: React.ReactNode }) {
  const d = docs[doc]
  if (!d) return null
  const title = d.kind === 'annual_report' ? d.title : `${d.period} call`
  return (
    <a href={page ? `${d.url}#page=${page}` : d.url} target="_blank" rel="noopener noreferrer"
       className="inline-flex min-h-11 min-w-11 items-center gap-0.5 whitespace-nowrap text-ink-3 underline underline-offset-4">
      {children ?? <>{title}{page ? ` p.${page}` : ''}</>}<Icon name="external" size={12} />
    </a>
  )
}

function Quote({ text }: { text: string }) {
  return <blockquote className="border-l-2 border-line pl-3 italic text-ink-2">“{text}”</blockquote>
}

function Row({ r, docs }: { r: ScoreRow; docs: Record<string, ResearchDoc> }) {
  const [open, setOpen] = useState(false)
  const d = r.delivered
  const later = r.later ?? r.revisions.map((v) => ({ ...v, change: 'revised' as const }))
  return (
    <li className="border-t border-line py-3 first:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold text-ink">{r.label}</span>
          <Pill v={r.verdict} />
        </div>
        <dl className="mt-1.5 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5 ">
          <dt className="text-ink-3">Promised</dt>
          <dd className="text-ink">
            {r.promised.target || (r.kind === 'milestone' ? 'Milestone' : 'No number')}
            {r.due !== 'unspecified' && <span className="text-ink-2"> by {r.due}</span>}
            <span className="text-ink-3"> · {r.promised.call} call</span>
          </dd>
          {r.verdict !== 'not_yet_due' && r.verdict !== 'too_vague' && (
            <>
              <dt className="text-ink-3">Delivered</dt>
              <dd className={d ? 'text-ink' : 'text-ink-3'}>
                {d && d.text ? <>{d.text}<span className="text-ink-2"> {d.period}</span>
                  <span className="text-ink-3"> · {d.source === 'annual_report' ? (d.how.startsWith('computed') ? 'annual report, computed' : 'annual report') : `${docs[d.doc]?.period ?? ''} call`}</span></>
                  : d ? <>Per the {docs[d.doc]?.period ?? ''} call</> : 'Not found'}
              </dd>
            </>
          )}
        </dl>
        {r.reason && <p className="mt-1 text-ink-2">{r.reason}</p>}
        {r.restated > 0 && !open && (
          <p className="mt-1 text-meta text-ink-3">
            {r.revisions.length > 0 ? `Revised ${r.revisions.length}× on later calls`
              : later.every((x) => x.change === 'restated') ? `Restated on ${r.restated} later ${r.restated === 1 ? 'call' : 'calls'}`
                : `Discussed again on ${r.restated} later ${r.restated === 1 ? 'call' : 'calls'}`}
          </p>
        )}
      </button>

      {open && (
        <div className="mt-2.5 space-y-2.5">
          <Quote text={r.promised.quote} />
          <p className="text-meta text-ink-3">
            {r.promised.speaker && <>{r.promised.speaker}, </>}<Src docs={docs} doc={r.promised.doc} page={r.promised.page} />
          </p>
          {later.map((v) => (
            <div key={`${v.doc}-${v.page}`} className="space-y-1">
              <p className="text-meta font-semibold text-ink-2">
                {v.change === 'revised' ? `Revised to ${v.target}` : v.change === 'restated' ? 'Restated' : 'Said again (no figure read from it)'} on the {v.call} call
              </p>
              <Quote text={v.quote} />
              <p className="text-meta text-ink-3"><Src docs={docs} doc={v.doc} page={v.page} /></p>
            </div>
          ))}
          {later.length > 0 && <p className="text-meta text-ink-3">The verdict is against the first statement.</p>}
          {d && (
            <div className="space-y-1 rounded-xl bg-raised p-2.5">
              <p className="text-meta font-semibold text-ink-2">
                Delivered{d.text ? `: ${d.text} ${d.period}` : ''}{d.label && d.label !== r.label ? ` · ${d.label}` : ''}
              </p>
              {d.quote ? <Quote text={d.quote} />
                : <p className="text-ink-2">{d.how === 'printed' ? 'As printed in the statement of profit and loss.' : `${d.how.charAt(0).toUpperCase()}${d.how.slice(1)}.`}</p>}
              <p className="text-meta text-ink-3">
                {d.how === 'found by searching later calls' && 'Found by searching later calls · '}
                <Src docs={docs} doc={d.doc} page={d.page} />
              </p>
            </div>
          )}
          <p className="text-meta text-ink-3">
            {r.verdict === 'not_yet_due' ? `Due ${r.due}; the latest call is earlier.`
              : r.verdict_by === 'model' ? 'A judgement from the quotes above, each found on its page.'
                : r.verdict === 'too_vague' ? 'No number or date to check it against.'
                  : r.verdict === 'not_found' ? 'FINN found no reported figure in these documents.' : 'Worked out from the figures above.'}
          </p>
        </div>
      )}
    </li>
  )
}

function Financials({ f, docs }: { f: NonNullable<R['financials']>; docs: Record<string, ResearchDoc> }) {
  const g = (k: 'revenue' | 'ebitda' | 'pat') => {
    const { current: c, previous: p } = f.figures[k]
    return c !== null && p !== null && p > 0 ? ((c - p) / p) * 100 : null
  }
  const rev = f.figures.revenue.current
  const margin = (k: 'ebitda' | 'pat') => (f.figures[k].current !== null && rev ? (f.figures[k].current! / rev) * 100 : null)
  const rows: [string, 'revenue' | 'ebitda' | 'pat'][] = [['Revenue', 'revenue'], ['EBITDA', 'ebitda'], ['PAT', 'pat']]
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">{f.fy} at a glance</h2>
        <span className="text-meta"><Src docs={docs} doc={f.doc} page={f.page} /></span>
      </div>
      <table className="mt-2 w-full">
        <thead>
          <tr className="text-meta text-ink-3">
            <th className="pb-1 text-left font-normal">₹ crore, {f.basis}</th>
            <th className="pb-1 text-right font-normal">{f.fy}</th>
            <th className="pb-1 text-right font-normal">{f.prev_fy}</th>
            <th className="pb-1 text-right font-normal">Growth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, k]) => {
            const gr = g(k)
            return (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-medium text-ink-2">{label}</th>
                <td className="py-1.5 text-right font-semibold text-ink">{inr(f.figures[k].current)}</td>
                <td className="py-1.5 text-right text-ink-2">{inr(f.figures[k].previous)}</td>
                <td className={`py-1.5 text-right ${gr === null ? 'text-ink-3' : gr < 0 ? 'text-down' : 'text-up'}`}>
                  {gr === null ? 'n.m.' : `${gr >= 0 ? '+' : '−'}${Math.abs(gr).toFixed(1)}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-meta text-ink-3">
        {margin('ebitda') !== null && <>EBITDA margin {margin('ebitda')!.toFixed(1)}% · </>}
        {margin('pat') !== null && <>PAT margin {margin('pat')!.toFixed(1)}% · </>}
        Figures matched on the page; EBITDA (PBT + finance costs + D&A − other income), growth and margins computed by FINN.
      </p>
    </section>
  )
}

const SLOW_MS = 5000

function Skeleton() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="mt-4 space-y-3" aria-label="Loading research">
      <p role="status" className="min-h-[18px] text-meta text-ink-3">{slow && 'Still loading. This is taking longer than usual.'}</p>
      <div className="skeleton h-5 w-40" />
      <div className="skeleton h-16 w-full" />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
    </div>
  )
}

export function Research({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const [data, setData] = useState<R | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [filter, setFilter] = useState<Verdict | null>(null)
  const [later, setLater] = useState(false)
  const [drops, setDrops] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setError(null)
    fetchResearch(symbol).then((d) => live && setData(d)).catch((e) => live && setError(e as Error))
    window.scrollTo(0, 0)
    return () => { live = false }
  }, [symbol, attempt])

  const docs = useMemo(() => {
    if (!data) return {}
    const all = [...data.docs.calls, ...(data.docs.annual_report ? [data.docs.annual_report] : [])]
    return Object.fromEntries(all.map((d) => [d.id, d]))
  }, [data])

  const judgeCall = data?.models.verdict[0]
  const judge = model(judgeCall?.model)
  const rows = data?.scorecard.rows ?? []
  const due = rows.filter((r) => r.verdict !== 'not_yet_due' && (!filter || r.verdict === filter))
  const notDue = rows.filter((r) => r.verdict === 'not_yet_due')
  const calls = data?.docs.calls ?? []

  return (
    <div>
      <header className="-mt-2 flex items-center justify-between">
        <button onClick={onBack} className="-ml-1 flex min-h-11 items-center gap-1 pr-3 font-medium text-ink-2 hover:text-ink"><Icon name="back" />Back</button>
        <span className="text-meta text-ink-3">Promised vs delivered</span>
      </header>

      {!data && !error && <Skeleton />}
      {error && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
          {error instanceof NotRecorded ? (
            <>
              <p className="font-semibold text-ink">No research for {symbol} yet</p>
              <p className="mt-1 text-ink-2">FINN hasn't read {symbol}'s earnings calls yet.</p>
              <button onClick={onBack} className="mt-3 min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Back</button>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink">Couldn't load {symbol}'s scorecard</p>
              <p className="mt-1 text-ink-2" role="alert">{error.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setAttempt(attempt + 1)} className="min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Try again</button>
                <button onClick={onBack} className="min-h-11 rounded-full border border-line px-4 text-ink-2">Back</button>
              </div>
            </>
          )}
        </div>
      )}

      {data && (
        <main className="mt-2 space-y-4">
          <section>
            <h1 className="text-title font-bold text-ink">{data.name || data.symbol}</h1>
            <p className="text-meta text-ink-3">
              {data.symbol} · {calls.length} earnings calls, {calls[0]?.period} to {calls[calls.length - 1]?.period}
              {data.docs.annual_report && <> · {data.docs.annual_report.title}</>}
            </p>
          </section>

          <section className="rounded-2xl bg-raised p-4">
            <p className="text-title font-bold text-ink">{verdictLine(data.scorecard.counts)}</p>
            {data.scorecard.credibility.line && (
              <p className="mt-1 text-ink-2">{data.scorecard.credibility.line}</p>
            )}
            <p className="mt-2 text-meta text-ink-3">Summarised by FINN from the verdicts below.</p>
          </section>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by verdict">
            {ORDER.filter((v) => data.scorecard.counts[v] > 0).map((v) => (
              <button key={v} onClick={() => setFilter(filter === v ? null : v)} aria-pressed={filter === v}
                      className={`min-h-11 rounded-full px-3 font-semibold ${filter === v ? 'bg-ink text-bg' : PILL[v]}`}>
                {data.scorecard.counts[v]} {SHORT[v].toLowerCase()}
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-line bg-surface px-4 py-1">
            {due.length === 0 ? (
              <p className="py-4 text-ink-2">Nothing due yet: every promise found is for a later period.</p>
            ) : (
              <ul>{due.map((r) => <Row key={r.id} r={r} docs={docs} />)}</ul>
            )}
          </section>

          {notDue.length > 0 && (
            <section className="rounded-2xl border border-dashed border-line">
              <button onClick={() => setLater(!later)} aria-expanded={later} className="flex min-h-14 w-full items-baseline justify-between gap-3 p-4 text-left">
                <span className="font-semibold text-ink">{notDue.length} promises not yet due</span>
                <span className="text-meta text-ink-3">{later ? 'Close' : `Current guidance, ${[...new Set(notDue.map((r) => r.due))].slice(0, 3).join(', ')}`}</span>
              </button>
              {later && <ul className="border-t border-dashed border-line px-4">{notDue.map((r) => <Row key={r.id} r={r} docs={docs} />)}</ul>}
            </section>
          )}

          {data.dropped.length > 0 && (
            <section className="rounded-2xl border border-dashed border-line">
              <button onClick={() => setDrops(!drops)} aria-expanded={drops} className="flex min-h-14 w-full items-baseline justify-between gap-3 p-4 text-left">
                <span className="font-semibold text-ink">
                  {data.dropped.length} {data.dropped.length === 1 ? 'claim' : 'claims'} left out: FINN couldn't confirm {data.dropped.length === 1 ? 'it' : 'them'}
                </span>
                <span className="text-meta text-ink-3">{drops ? 'Close' : 'See why'}</span>
              </button>
              {drops && (
                <ul className="space-y-2.5 border-t border-dashed border-line p-4">
                  {data.dropped.map((x, i) => (
                    <li key={i} className="">
                      <span className="font-semibold text-ink">{x.what}</span>{' '}
                      <span className="text-ink-3">· {STAGE[x.stage] ?? x.stage} · </span>
                      <span className="text-meta"><Src docs={docs} doc={x.doc} page={x.page} /></span>
                      <p className="text-ink-2">{x.why.charAt(0).toUpperCase() + x.why.slice(1)}.</p>
                    </li>
                  ))}
                  <li className="text-meta text-ink-3">
                    A claim appears only if its quote is word for word on the cited page and every figure is in the quote. These weren't.
                  </li>
                </ul>
              )}
            </section>
          )}

          {data.financials && <Financials f={data.financials} docs={docs} />}

          <footer className="space-y-2 px-1 text-meta text-ink-3">
            <p>
              <span className="font-semibold text-ink-2">How verdicts are set.</span> Every numeric verdict is worked out against the first
              stated target: met at or above it; partially within 1 point of a margin target or at least 80% of a growth or amount target;
              otherwise missed. Milestones are a judgement from verbatim quotes.
            </p>
            <p>
              <span className="font-semibold text-ink-2">Sources.</span> Only these documents, listed on screener.in and served by BSE or the
              company: {calls.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Src docs={docs} doc={c.id} page={null}>{c.period}</Src></span>)}
              {data.docs.annual_report && <>, <Src docs={docs} doc={data.docs.annual_report.id} page={null}>{data.docs.annual_report.title}</Src></>}.
              Nothing from outside them.
              {data.docs.skipped.length > 0 && <> Not used: {data.docs.skipped.map((s) => `${s.listed_as} (${s.why})`).join('; ')}.</>}
            </p>
            <p>Recorded {new Date(data.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink-2">How this was built</summary>
              <p>
                Promises and figures were read by {model(data.models.extract_guidance[0]?.model)}.
                {judge && <> Milestones were judged by {judge}.</>}
                {judgeCall && judgeCall.fallbacks.length > 0 && <> {judge} answered because {judgeCall.fallbacks.map((f) => `${model(f.model)} ${why(f.why)}`).join(' and ')}.</>}
                {' '}Verdicts on numbers are computed by code, never by a model.
              </p>
            </details>
          </footer>
        </main>
      )}
    </div>
  )
}
