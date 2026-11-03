import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyAlerts, DEFAULT_PREFS, loadPrefs, savePrefs, type AlertPrefs } from './alerts'
import { fetchDigest, fetchManifest, fetchMarket, fetchResearchIndex, fetchTimeline, fetchWalks, STATIC, type Card, type Digest, type Manifest, type ResearchEntry, type Walk } from './api'
import { Alerts } from './components/Alerts'
import { Book } from './components/Book'
import { CompanySheet } from './components/CompanySheet'
import { HowToRead } from './components/HowToRead'
import { LedgerSheet } from './components/LedgerSheet'
import { Research } from './components/Research'
import { ResearchHome } from './components/ResearchHome'
import { TabBar } from './components/TabBar'
import { Today } from './components/Today'
import { WindowChip } from './components/WindowChip'
import { windowLabel, WindowSheet } from './components/WindowSheet'
import { applyTheme, loadTheme, saveTheme, type Theme } from './theme'
import type { TourAction } from './tour'
import { loadDensity, saveDensity, type Density } from './density'
import type { Timeline } from './company'
import type { Market } from './market'
import { sheetHistory } from './sheetHistory'
import { parseHash, tabHash, type Route, type Tab } from './route'
import * as fig from './fig'

const DISMISSED_KEY = 'finn.dismissed'
const MIN_ROW_VISIBLE = 96
const UNDO_MS = 8000

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
  const [density, setDensity] = useState(loadDensity)
  const changeDensity = (d: Density) => { setDensity(d); saveDensity(d) }
  const [theme, setTheme] = useState(loadTheme)
  const changeTheme = (t: Theme) => { setTheme(t); saveTheme(t); applyTheme(t) }
  const tourStep = (a: TourAction) => {
    if (a.kind === 'go') {
      sheetHistory.leaveTo(a.hash)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    }
    setHowTo(false)
    if (a.kind === 'file') setFile(a.symbol)
    if (a.kind === 'ledger') setLedgerOpen(true)
  }
  const [howTo, setHowTo] = useState(false)
  const [prefs, setPrefs] = useState<AlertPrefs>(loadPrefs)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [market, setMarket] = useState<Market | null>(null)
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [researched, setResearched] = useState<ResearchEntry[]>([])
  const [walks, setWalks] = useState<Walk[]>([])

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

  useEffect(() => { fetchResearchIndex().then(setResearched); fetchWalks().then(setWalks) }, [])
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
  const latestDay = STATIC ? manifest?.to ?? null : fig.todayIso()
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
    setTimeout(() => setUndo((u) => (u?.id === id ? null : u)), UNDO_MS)
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

  const chip = <WindowChip label={`${day ? `${fig.day(day)} · ` : ''}${windowLabel(hours)}`} onOpen={() => setWindowOpen(true)} />
  // Compact Today has the as-of line right under the chip, so the date isn't said twice. Book and Alerts have no such line.
  const todayChip = density === 'compact' ? <WindowChip label={`Last ${windowLabel(hours)}`} onOpen={() => setWindowOpen(true)} /> : chip
  const book = useMemo(() => new Set(Object.keys(data?.names ?? {})), [data])
  const skeleton = <div className="skeleton h-40 w-full" aria-label="Loading" />

  return (
    <>
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-[calc(100px+env(safe-area-inset-bottom)+1.5rem)] pt-[max(1rem,env(safe-area-inset-top))]">
        <div hidden={route.tab !== 'today'}>
          <Today key={density} chip={todayChip} density={density} onDensity={changeDensity} theme={theme} onTheme={changeTheme} data={data} view={view} market={market} timeline={timeline} day={day} hours={hours} onHours={setHours}
                 loading={loading} error={error} onReload={load} customised={customised} dismissed={dismissed}
                 onDismiss={dismiss} onRestore={restore} onAsk={(c: Card) => setFile(c.symbol)} onOpen={setFile} onLedger={() => setLedgerOpen(true)} onBook={() => { window.location.hash = 'book' }} onHowTo={() => setHowTo(true)} />
        </div>
        {route.tab === 'book' && (view ? <Book chip={chip} view={view} market={market} timeline={timeline} onOpen={setFile} /> : skeleton)}
        {route.tab === 'research' && (route.symbol
          ? <Research symbol={route.symbol} row={route.row} onBack={closeResearch} />
          : <ResearchHome entries={researched} walks={walks} book={book} onOpen={openResearch} />)}
        {route.tab === 'alerts' && <Alerts chip={chip} prefs={prefs} onChange={changePrefs} cards={view?.cards ?? []} onOpen={setFile} />}
      </div>

      <TabBar tab={route.tab} onSelect={selectTab} dock={undo ? (
        <div className="flex min-h-11 items-center justify-between gap-3 bg-ink pl-4 text-bg" role="status">
          <span className="truncate">Dismissed {undo.symbol}</span>
          <button onClick={() => restore([undo.id])} className="min-h-11 min-w-11 px-4 font-semibold">Undo</button>
        </div>
      ) : null} />

      {file && view && (
        <CompanySheet symbol={file} name={view.names[file] ?? file} sector={view.sectors?.[file] ?? ''} card={view.cards.find((c) => c.symbol === file) ?? null}
                      filings={timeline ? timeline[file] ?? [] : null} sessions={market?.sessions[file]} end={view.window.end}
                      since={manifest?.from ?? null} volX={prefs.volX} research={researched.find((r) => r.symbol === file)}
                      onResearch={() => {
                        sheetHistory.leaveTo(`#research/${file}`)
                        window.dispatchEvent(new HashChangeEvent('hashchange'))
                      }} onClose={() => setFile(null)} />
      )}
      {windowOpen && (
        <WindowSheet data={data} view={view} market={market} manifest={manifest} researched={researched} latestDay={latestDay}
                     hours={hours} onHours={setHours} asOf={asOf} onAsOf={setAsOf} loading={loading} refreshing={refreshing}
                     onRefresh={() => load(true)} onClose={() => setWindowOpen(false)} />
      )}
      {howTo && (
        <HowToRead density={density} onDensity={changeDensity} theme={theme} onTheme={changeTheme} onTour={tourStep}
                   onLedger={() => { setHowTo(false); setLedgerOpen(true) }} onClose={() => setHowTo(false)} />
      )}
      {ledgerOpen && <LedgerSheet onClose={() => setLedgerOpen(false)} />}
    </>
  )
}
