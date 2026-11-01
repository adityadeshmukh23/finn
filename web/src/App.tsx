import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyAlerts, DEFAULT_PREFS, loadPrefs, savePrefs, type AlertPrefs } from './alerts'
import { fetchDigest, fetchLedger, fetchManifest, fetchMarket, fetchResearchIndex, fetchTimeline, STATIC, type Card, type Digest, type Manifest, type ResearchEntry } from './api'
import { Alerts } from './components/Alerts'
import { Book } from './components/Book'
import { CompanySheet } from './components/CompanySheet'
import { LedgerSheet } from './components/LedgerSheet'
import { Research } from './components/Research'
import { ResearchHome } from './components/ResearchHome'
import { TabBar } from './components/TabBar'
import { Today } from './components/Today'
import { WindowChip } from './components/WindowChip'
import { windowLabel, WindowSheet } from './components/WindowSheet'
import { dayMonth, todayIST } from './format'
import type { Timeline } from './company'
import type { Market } from './market'
import { sheetHistory } from './sheetHistory'
import { parseHash, tabHash, type Route, type Tab } from './route'

const DISMISSED_KEY = 'finn.dismissed'
const MIN_ROW_VISIBLE = 96

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
  const [undo, setUndo] = useState<{ id: string; symbol: string } | null>(null)
  const [file, setFile] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Timeline | null>(null)
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
      setFile(null)
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
  useEffect(() => { fetchTimeline().then(setTimeline) }, [])

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

  // `top` is where the dismissed row was: the next row slides into that spot, so keep it above the dock.
  const dismiss = (id: string, symbol: string, top: number) => {
    const next = new Set(dismissed).add(id)
    setDismissed(next)
    saveDismissed(next)
    setUndo({ id, symbol })
    setTimeout(() => setUndo((u) => (u?.id === id ? null : u)), 4000)
    requestAnimationFrame(() => {
      const dockTop = document.querySelector('nav')?.getBoundingClientRect().top ?? window.innerHeight
      const under = top + MIN_ROW_VISIBLE - dockTop
      if (under > 0) window.scrollBy({ top: under })
    })
  }
  const restore = (ids: string[]) => {
    const next = new Set(dismissed)
    ids.forEach((i) => next.delete(i))
    setDismissed(next)
    saveDismissed(next)
    setUndo(null)
  }

  const chip = <WindowChip label={`${day ? `${dayMonth(day)} · ` : ''}${windowLabel(hours)}`} onOpen={() => setWindowOpen(true)} />
  const book = useMemo(() => new Set(Object.keys(data?.names ?? {})), [data])
  const skeleton = <div className="skeleton h-40 w-full" aria-label="Loading" />

  return (
    <>
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-[calc(100px+env(safe-area-inset-bottom)+1.5rem)] pt-[max(1rem,env(safe-area-inset-top))]">
        <div hidden={route.tab !== 'today'}>
          <Today chip={chip} data={data} view={view} market={market} timeline={timeline} day={day} hours={hours} onHours={setHours}
                 loading={loading} error={error} onReload={load} customised={customised} spent={spent} dismissed={dismissed}
                 onDismiss={dismiss} onRestore={restore} onAsk={(c: Card) => setFile(c.symbol)} onLedger={() => setLedgerOpen(true)} />
        </div>
        {route.tab === 'book' && (view ? <Book chip={chip} view={view} market={market} onOpen={setFile} /> : skeleton)}
        {route.tab === 'research' && (route.symbol
          ? <Research symbol={route.symbol} onBack={closeResearch} />
          : <ResearchHome entries={researched} book={book} onOpen={openResearch} />)}
        {route.tab === 'alerts' && <Alerts chip={chip} prefs={prefs} onChange={changePrefs} cards={view?.cards ?? []} onOpen={setFile} />}
      </div>

      <TabBar tab={route.tab} onSelect={selectTab} dock={undo ? (
        <div className="flex min-h-11 items-center justify-between gap-3 bg-ink pl-4 text-bg" role="status">
          <span className="truncate">Dismissed {undo.symbol}</span>
          <button onClick={() => restore([undo.id])} className="min-h-11 min-w-11 px-4 font-semibold">Undo</button>
        </div>
      ) : null} />

      {file && view && (
        <CompanySheet symbol={file} name={view.names[file] ?? file} card={view.cards.find((c) => c.symbol === file) ?? null}
                      filings={timeline ? timeline[file] ?? [] : null} sessions={market?.sessions[file]} end={view.window.end}
                      since={manifest?.from ?? null} volX={prefs.volX} research={researched.find((r) => r.symbol === file)}
                      onResearch={() => {
                        sheetHistory.leaveTo(`#research/${file}`)
                        window.dispatchEvent(new HashChangeEvent('hashchange'))
                      }} onClose={() => setFile(null)} />
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
