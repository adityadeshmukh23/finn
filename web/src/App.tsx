import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyAlerts, DEFAULT_PREFS, loadPrefs, savePrefs, type AlertPrefs } from './alerts'
import { fetchDigest, fetchLedger, fetchManifest, fetchMarket, fetchResearchIndex, STATIC, type Card, type Digest, type Manifest, type ResearchEntry } from './api'
import { AlertsSheet } from './components/AlertsSheet'
import { BriefCard } from './components/BriefCard'
import { HiddenRow } from './components/HiddenRow'
import { LedgerSheet } from './components/LedgerSheet'
import { Research } from './components/Research'
import { Sheet } from './components/Sheet'
import { clock, todayIST, usd } from './format'
import type { Market } from './market'

const WINDOWS = [
  { hours: 24, label: '24h' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
]
const DISMISSED_KEY = 'finn.dismissed'
const researchFromHash = () => decodeURIComponent(window.location.hash.match(/^#research\/([A-Za-z0-9&_-]+)$/)?.[1] ?? '').toUpperCase() || null

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
  const label = fresh ? 'NSE' : s.source === 'unavailable' ? 'No data' : STATIC ? 'Demo data' : 'Snapshot'
  return (
    <div className="text-xs">
      <span className={`inline-flex items-center gap-1.5 font-medium ${fresh ? 'text-good' : 'text-warn'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${fresh ? 'bg-good' : 'bg-warn'}`} />
        {label}
        {s.as_of && <span className="font-normal text-ink-3">{STATIC ? ' as of ' : '· data as of '}{clock(s.as_of)}</span>}
      </span>
      {s.message && <p className="mt-1 leading-snug text-ink-3">{s.message}</p>}
    </div>
  )
}

function PriceBadge({ m }: { m: Market | null }) {
  if (!m) return <p className="mt-1 text-xs text-ink-3">Prices unavailable: price and volume alerts are off.</p>
  const fresh = m.source === 'live' || m.source === 'cache'
  const day = m.through ? new Date(m.through).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '?'
  return (
    <p className="mt-1 text-xs text-ink-3">
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${fresh ? 'bg-good' : 'bg-warn'}`} />
      Prices to {day} close · Yahoo Finance{m.message ? ` · ${m.message}` : ''}
    </p>
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
  const [prefs, setPrefs] = useState<AlertPrefs>(loadPrefs)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [market, setMarket] = useState<Market | null>(null)
  const [researchSym, setResearchSym] = useState<string | null>(researchFromHash)
  const [researched, setResearched] = useState<ResearchEntry[]>([])

  useEffect(() => { fetchResearchIndex().then(setResearched) }, [])
  useEffect(() => {
    const onHash = () => setResearchSym(researchFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const openResearch = (sym: string) => { window.location.hash = `research/${sym}` }
  const closeResearch = () => {
    if (window.history.length > 1 && researchFromHash()) window.history.back()
    else { window.location.hash = ''; setResearchSym(null) }
  }
  const askFinn = (c: Card) => (researched.some((r) => r.symbol === c.symbol) ? openResearch(c.symbol) : setAsk(c))

  useEffect(() => { if (STATIC) fetchManifest().then(setManifest).catch(() => setManifest(null)) }, [])
  const latestDay = STATIC ? manifest?.to ?? null : todayIST()

  // Only the latest request may update the screen; a slower earlier one (another window or date) is dropped.
  const latest = useRef(0)
  const load = useCallback(async (refresh = false) => {
    const seq = ++latest.current
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [d, m] = await Promise.all([fetchDigest(hours, asOf, refresh), fetchMarket(asOf)])
      if (seq === latest.current) {
        setData(d)
        setMarket(m)
      }
    } catch (e) {
      if (seq === latest.current) setError((e as Error).message)
    } finally {
      if (seq === latest.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [hours, asOf])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (STATIC) { setSpent(0); return }
    fetchLedger().then((l) => setSpent(l.spent_usd)).catch(() => setSpent(null))
  }, [ledgerOpen])

  const view = useMemo(() => (data ? applyAlerts(data, prefs, market) : null), [data, prefs, market])
  const changePrefs = (p: AlertPrefs) => { setPrefs(p); savePrefs(p) }
  const customised = prefs.minTier !== 'medium' || prefs.muted.length > 0
    || prefs.volX !== DEFAULT_PREFS.volX || prefs.movePct !== DEFAULT_PREFS.movePct
  const refTime = useMemo(() => (data ? new Date(data.window.end) : new Date()), [data])
  const cards = (view?.cards ?? []).filter((c) => !dismissed.has(c.lead.id))
  const dismissedHere = (view?.cards.length ?? 0) - cards.length

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

  if (researchSym) return <Research symbol={researchSym} onBack={closeResearch} />

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
          <button onClick={() => setAlertsOpen(true)} aria-label="Alert settings"
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${customised ? 'border-ink text-ink' : 'border-line text-ink-2'}`}>
            Alerts{customised ? ' ·' : ''}
          </button>
          {!STATIC && (
            <button onClick={() => load(true)} disabled={refreshing || loading || !!asOf}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2 disabled:opacity-40"
                    aria-label="Refresh from NSE" title={asOf ? 'Past briefings are fixed' : 'Fetch the latest filings'}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
      </header>

      {STATIC && (
        <p className="mt-2 rounded-xl bg-raised px-3 py-2 text-xs leading-snug text-ink-2">
          <span className="font-semibold text-ink">Replay mode.</span> Recorded NSE filings
          {manifest && <> for {manifest.holdings} holdings, {manifest.from} to {manifest.to}</>}
          {researched.length > 0 && <>, and recorded research for {researched.length} {researched.length === 1 ? 'company' : 'companies'}</>}.
          Live fetching and any-ticker briefings and research run locally (see README).
        </p>
      )}

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
          <input type="date" value={asOf ?? latestDay ?? ''} max={latestDay ?? undefined} min={STATIC ? manifest?.from : undefined}
                 onChange={(e) => setAsOf(!e.target.value || e.target.value === latestDay ? null : e.target.value)}
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

        {!loading && data && view && (
          <>
            <section>
              <p className="text-[15px] text-ink">
                <span className="tabular text-2xl font-bold">{cards.length}</span>{' '}
                {cards.length === 1 ? 'company needs' : 'companies need'} a look
              </p>
              <p className="tabular mt-0.5 text-[13px] text-ink-2">
                {data.counts.total} filings in the last {windowLabel}
                {cards.some((c) => c.market) && ` · ${cards.filter((c) => c.market).length} price/volume alerts`} · {view.counts.hidden} hidden
                {data.counts.duplicates_dropped > 0 && ` · ${data.counts.duplicates_dropped} duplicates dropped`}
              </p>
              <div className="mt-2"><SourceBadge d={data} /><PriceBadge m={market} /></div>
            </section>

            {cards.length === 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-[15px] font-semibold text-ink">
                  {data.counts.total === 0 ? `No filings in the last ${windowLabel}` : customised ? 'Nothing passes your alert settings' : 'Nothing material'}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-ink-2">
                  {data.counts.total === 0
                    ? 'A quiet window. Widen it, or pick an earlier date to see a busy day.'
                    : customised
                      ? 'Everything in this window is muted or below your threshold. It is listed below.'
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
                           onDismiss={() => dismiss(c.lead.id)} onAsk={() => askFinn(c)} />
              ))}
            </ul>

            {dismissedHere > 0 && (
              <button onClick={() => restore(view.cards.map((c) => c.lead.id))} className="text-xs text-ink-3 underline underline-offset-4">
                {dismissedHere} dismissed · show again
              </button>
            )}

            <HiddenRow groups={view.hidden} total={view.counts.hidden} refTime={refTime} />

            {researched.length > 0 && (
              <section className="rounded-2xl border border-line bg-surface">
                <div className="px-4 pt-4">
                  <h2 className="text-[15px] font-semibold text-ink">Promised vs delivered</h2>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
                    Management's guidance over the last four quarters, against what it reported. Transcripts and annual reports only.
                  </p>
                </div>
                <ul className="mt-2">
                  {researched.map((r) => (
                    <li key={r.symbol} className="border-t border-line">
                      <button onClick={() => openResearch(r.symbol)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                        <span className="min-w-0">
                          <span className="text-[13px] font-semibold text-ink">{r.symbol}</span>
                          <span className="text-[13px] text-ink-3"> · {r.name || r.symbol}</span>
                          <span className="block text-xs text-ink-2">{r.headline}{r.counts.missed > 0 ? ` · ${r.counts.missed} missed` : ''}</span>
                        </span>
                        <span className="text-ink-3" aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {view.quiet.length > 0 && (
              <p className="px-1 text-xs leading-relaxed text-ink-3">
                Nothing from {view.quiet.length} holdings (no filings, no price or volume alert): {view.quiet.join(', ')}
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
            Research on {ask.company} is grounded only in its earnings-call transcripts and annual report, with a page
            citation on every claim: <span className="font-semibold text-ink">promised vs delivered</span> over the last four quarters.
          </p>
          <p className="mt-3 rounded-xl bg-raised p-3 text-[13px] leading-snug text-ink-2">
            {STATIC
              ? <>Not recorded for {ask.symbol} in this demo. Recorded: {researched.map((r) => r.symbol).join(', ') || 'none'}. Any NSE ticker works locally.</>
              : <>Not generated for {ask.symbol} yet. Run <code className="text-ink">python -m scripts.research {ask.symbol}</code> in backend/ (takes a few minutes, free-tier models).</>}
          </p>
          {researched.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {researched.map((r) => (
                <button key={r.symbol} onClick={() => { setAsk(null); openResearch(r.symbol) }}
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2">{r.symbol}</button>
              ))}
            </div>
          )}
        </Sheet>
      )}
      {ledgerOpen && <LedgerSheet onClose={() => setLedgerOpen(false)} />}
      {alertsOpen && <AlertsSheet prefs={prefs} onChange={changePrefs} onClose={() => setAlertsOpen(false)} />}
    </div>
  )
}
