import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchDigest, fetchLedger, type Card, type Digest } from './api'
import { BriefCard } from './components/BriefCard'
import { HiddenRow } from './components/HiddenRow'
import { LedgerSheet } from './components/LedgerSheet'
import { Sheet } from './components/Sheet'
import { clock, todayIST, usd } from './format'

const WINDOWS = [
  { hours: 24, label: '24h' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
]
const DISMISSED_KEY = 'finn.dismissed'

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}
function saveDismissed(s: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s].slice(-500)))
  } catch { /* storage unavailable: dismissals last for this session only */ }
}

function SourceBadge({ d }: { d: Digest }) {
  const s = d.source
  const fresh = s.source === 'live' || s.source === 'cache'
  const label = fresh ? 'NSE' : s.source === 'unavailable' ? 'No data' : 'Snapshot'
  return (
    <div className="text-xs">
      <span className={`inline-flex items-center gap-1.5 font-medium ${fresh ? 'text-good' : 'text-warn'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${fresh ? 'bg-good' : 'bg-warn'}`} />
        {label}
        {s.as_of && <span className="font-normal text-ink-3">· data as of {clock(s.as_of)}</span>}
      </span>
      {s.message && <p className="mt-1 leading-snug text-ink-3">{s.message}</p>}
    </div>
  )
}

function Skeleton() {
  return (
    <ul className="space-y-3" aria-label="Loading briefing">
      {[0, 1, 2].map((i) => (
        <li key={i} className="space-y-2.5 rounded-2xl border border-line bg-surface p-4">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-3 w-3/4" />
        </li>
      ))}
    </ul>
  )
}

export default function App() {
  const [hours, setHours] = useState(24)
  const [asOf, setAsOf] = useState<string | null>(null)
  const [data, setData] = useState<Digest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [undo, setUndo] = useState<string | null>(null)
  const [ask, setAsk] = useState<Card | null>(null)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [spent, setSpent] = useState<number | null>(null)

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      setData(await fetchDigest(hours, asOf, refresh))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [hours, asOf])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchLedger().then((l) => setSpent(l.spent_usd)).catch(() => setSpent(null)) }, [ledgerOpen])

  const refTime = useMemo(() => (data ? new Date(data.window.end) : new Date()), [data])
  const cards = (data?.cards ?? []).filter((c) => !dismissed.has(c.lead.id))
  const dismissedHere = (data?.cards.length ?? 0) - cards.length

  const dismiss = (id: string) => {
    const next = new Set(dismissed).add(id)
    setDismissed(next)
    saveDismissed(next)
    setUndo(id)
    setTimeout(() => setUndo((u) => (u === id ? null : u)), 4000)
  }
  const restore = (ids: string[]) => {
    const next = new Set(dismissed)
    ids.forEach((i) => next.delete(i))
    setDismissed(next)
    saveDismissed(next)
    setUndo(null)
  }

  const windowLabel = WINDOWS.find((w) => w.hours === hours)?.label ?? `${hours}h`

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">FINN</h1>
          <p className="text-xs text-ink-3">
            {asOf ? `Briefing as of ${new Date(asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Your portfolio briefing'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLedgerOpen(true)}
                  className="tabular rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2"
                  aria-label="Open cost ledger">
            {spent === null ? 'Cost' : `${usd(spent)} spent`}
          </button>
          <button onClick={() => load(true)} disabled={refreshing || loading || !!asOf}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2 disabled:opacity-40"
                  aria-label="Refresh from NSE" title={asOf ? 'Past briefings are fixed' : 'Fetch the latest filings'}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <div role="tablist" aria-label="Time window" className="flex rounded-full bg-raised p-0.5">
          {WINDOWS.map((w) => (
            <button key={w.hours} role="tab" aria-selected={hours === w.hours} onClick={() => setHours(w.hours)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${hours === w.hours ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
              {w.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-3">
          As of
          <input type="date" value={asOf ?? todayIST()} max={todayIST()}
                 onChange={(e) => setAsOf(!e.target.value || e.target.value === todayIST() ? null : e.target.value)}
                 className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink" />
        </label>
      </div>

      <main className="mt-5 space-y-4">
        {loading && <Skeleton />}

        {!loading && error && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[15px] font-semibold text-ink">Couldn't load the briefing</p>
            <p className="mt-1 text-[13px] text-ink-2">{error}</p>
            <button onClick={() => load()} className="mt-3 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-bg">Try again</button>
          </div>
        )}

        {!loading && data && (
          <>
            <section>
              <p className="text-[15px] text-ink">
                <span className="tabular text-2xl font-bold">{cards.length}</span>{' '}
                {cards.length === 1 ? 'company needs' : 'companies need'} a look
              </p>
              <p className="tabular mt-0.5 text-[13px] text-ink-2">
                {data.counts.total} filings in the last {windowLabel} · {data.counts.hidden} routine hidden
                {data.counts.duplicates_dropped > 0 && ` · ${data.counts.duplicates_dropped} duplicates dropped`}
              </p>
              <div className="mt-2"><SourceBadge d={data} /></div>
            </section>

            {cards.length === 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-[15px] font-semibold text-ink">
                  {data.counts.total === 0 ? `No filings in the last ${windowLabel}` : 'Nothing material'}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-ink-2">
                  {data.counts.total === 0
                    ? 'A quiet window. Widen it, or pick an earlier date to see a busy day.'
                    : 'Everything filed in this window was routine. It is listed below if you want to check.'}
                </p>
                {hours < 168 && (
                  <button onClick={() => setHours(168)} className="mt-3 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-bg">Show 7 days</button>
                )}
              </div>
            )}

            <ul className="space-y-3">
              {cards.map((c, i) => (
                <BriefCard key={c.lead.id} card={c} rank={i + 1} refTime={refTime}
                           onDismiss={() => dismiss(c.lead.id)} onAsk={() => setAsk(c)} />
              ))}
            </ul>

            {dismissedHere > 0 && (
              <button onClick={() => restore(data.cards.map((c) => c.lead.id))} className="text-xs text-ink-3 underline underline-offset-4">
                {dismissedHere} dismissed · show again
              </button>
            )}

            <HiddenRow groups={data.hidden} total={data.counts.hidden} refTime={refTime} />

            {data.quiet.length > 0 && (
              <p className="px-1 text-xs leading-relaxed text-ink-3">
                No filings from {data.quiet.length} holdings: {data.quiet.join(', ')}
              </p>
            )}
          </>
        )}
      </main>

      {undo && (
        <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-full bg-ink px-4 py-2 text-xs text-bg shadow-lg">
            Dismissed
            <button onClick={() => restore([undo])} className="font-semibold text-accent">Undo</button>
          </div>
        </div>
      )}

      {ask && (
        <Sheet title={`Ask FINN · ${ask.symbol}`} onClose={() => setAsk(null)}>
          <p className="text-[13px] leading-snug text-ink-2">
            Research on {ask.company} will be grounded only in its annual reports and concall transcripts,
            with a page citation on every claim. The first lens is <span className="font-semibold text-ink">promised vs delivered</span>:
            what management guided over the last four quarters against what they reported.
          </p>
          <p className="mt-3 rounded-xl bg-raised p-3 text-[13px] text-ink-2">Not built yet. Research arrives in the next build phase.</p>
        </Sheet>
      )}
      {ledgerOpen && <LedgerSheet onClose={() => setLedgerOpen(false)} />}
    </div>
  )
}
