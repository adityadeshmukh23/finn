import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyAlerts, DEFAULT_PREFS, loadPrefs, savePrefs, type AlertPrefs } from './alerts'
import { fetchDigest, fetchLedger, fetchManifest, fetchMarket, fetchResearchIndex, STATIC, type Card, type Digest, type Manifest, type ResearchEntry } from './api'
import { Alerts } from './components/Alerts'
import { Book } from './components/Book'
import { LedgerSheet } from './components/LedgerSheet'
import { Research } from './components/Research'
import { ResearchHome } from './components/ResearchHome'
import { Sheet } from './components/Sheet'
import { Icon } from './components/Icon'
import { TabBar } from './components/TabBar'
import { Today } from './components/Today'
import { windowLabel, WindowSheet } from './components/WindowSheet'
import { dayMonth, todayIST } from './format'
import type { Market } from './market'
import { parseHash, tabHash, type Route, type Tab } from './route'

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

const routeKey = (r: Route) => `${r.tab}/${r.symbol ?? ''}`

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
  const [windowOpen, setWindowOpen] = useState(false)
  const [spent, setSpent] = useState<number | null>(null)
  const [prefs, setPrefs] = useState<AlertPrefs>(loadPrefs)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [market, setMarket] = useState<Market | null>(null)
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [researched, setResearched] = useState<ResearchEntry[]>([])

  // Each tab keeps its scroll position; the briefing stays mounted so open rows survive a tab switch.
  const scrolls = useRef<Record<string, number>>({})
  const current = useRef(route)
  useEffect(() => {
    history.scrollRestoration = 'manual'
    const onHash = () => {
      scrolls.current[routeKey(current.current)] = window.scrollY
      const next = parseHash(window.location.hash)
      current.current = next
      setRoute(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useLayoutEffect(() => { window.scrollTo(0, scrolls.current[routeKey(route)] ?? 0) }, [route])

  useEffect(() => { fetchResearchIndex().then(setResearched) }, [])
  const openResearch = (sym: string) => { window.location.hash = `research/${sym}` }
  const closeResearch = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.hash = 'research'
  }
  const selectTab = (t: Tab) => {
    if (t === route.tab && !route.symbol) window.scrollTo({ top: 0 })
    else window.location.hash = tabHash(t)
  }
  const askFinn = (c: Card) => (researched.some((r) => r.symbol === c.symbol) ? openResearch(c.symbol) : setAsk(c))

  useEffect(() => { if (STATIC) fetchManifest().then(setManifest).catch(() => setManifest(null)) }, [])
  const latestDay = STATIC ? manifest?.to ?? null : todayIST()
  const day = asOf ?? latestDay

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

  const book = useMemo(() => new Set(Object.keys(data?.names ?? {})), [data])
  const skeleton = <div className="skeleton h-40 w-full" aria-label="Loading" />

  return (
    <>
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-[calc(100px+env(safe-area-inset-bottom)+1.5rem)] pt-[max(1rem,env(safe-area-inset-top))]">
        <div hidden={route.tab !== 'today'}>
          <Today data={data} view={view} market={market} day={day} hours={hours} onHours={setHours}
                 loading={loading} error={error} onReload={load} customised={customised} spent={spent} dismissed={dismissed}
                 onDismiss={dismiss} onRestore={restore} onAsk={askFinn} onLedger={() => setLedgerOpen(true)} />
        </div>
        {route.tab === 'book' && (view ? <Book view={view} market={market} researched={new Set(researched.map((r) => r.symbol))} onResearch={openResearch} /> : skeleton)}
        {route.tab === 'research' && (route.symbol
          ? <Research symbol={route.symbol} onBack={closeResearch} />
          : <ResearchHome entries={researched} book={book} onOpen={openResearch} />)}
        {route.tab === 'alerts' && <Alerts prefs={prefs} onChange={changePrefs} cards={view?.cards ?? []} />}
      </div>

      <TabBar tab={route.tab} onSelect={selectTab} dock={route.tab !== 'research' && (
        <button onClick={() => setWindowOpen(true)} aria-label={`Change window and date. Showing ${windowLabel(hours)}${day ? ` to ${dayMonth(day)}` : ''}`}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left">
          <span className="truncate text-ink-2">Showing <span className="font-semibold text-ink">{windowLabel(hours)}</span>{day && <> to <span className="font-semibold text-ink">{dayMonth(day)}</span></>}</span>
          <span className="flex shrink-0 items-center gap-1 text-meta text-ink-3">Change<Icon name="down" size={14} className="rotate-180" /></span>
        </button>
      )} />

      {undo && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-ink pl-4 pr-1 text-bg shadow-lg">
            Dismissed
            <button onClick={() => restore([undo])} className="min-h-11 min-w-11 px-3 font-semibold">Undo</button>
          </div>
        </div>
      )}

      {ask && (
        <Sheet title={`Ask FINN · ${ask.symbol}`} onClose={() => setAsk(null)}>
          <p className="text-ink-2">
            Research on {ask.company} is grounded only in its earnings-call transcripts and annual report, with a page
            citation on every claim: <span className="font-semibold text-ink">promised vs delivered</span> over the last four quarters.
          </p>
          <p className="mt-3 rounded-xl bg-raised p-3 text-ink-2">
            {STATIC
              ? <>Not recorded for {ask.symbol} in this demo. Recorded: {researched.map((r) => r.symbol).join(', ') || 'none'}. Any NSE ticker can be researched locally with <code className="text-ink">./run.sh research {ask.symbol}</code>.</>
              : <>Not generated for {ask.symbol} yet. Run <code className="text-ink">./run.sh research {ask.symbol}</code> (a few minutes, free-tier models).</>}
          </p>
          {researched.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {researched.map((r) => (
                <button key={r.symbol} onClick={() => { setAsk(null); openResearch(r.symbol) }}
                        className="min-h-11 rounded-full border border-line px-3 font-medium text-ink-2">{r.symbol}</button>
              ))}
            </div>
          )}
        </Sheet>
      )}
      {windowOpen && (
        <WindowSheet data={data} market={market} manifest={manifest} researched={researched} latestDay={latestDay}
                     hours={hours} onHours={setHours} asOf={asOf} onAsOf={setAsOf} loading={loading} refreshing={refreshing}
                     onRefresh={() => load(true)} onClose={() => setWindowOpen(false)} />
      )}
      {ledgerOpen && <LedgerSheet onClose={() => setLedgerOpen(false)} />}
    </>
  )
}
