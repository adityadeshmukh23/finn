import { useState } from 'react'
import { STATIC, type Card, type Digest, type Manifest, type ResearchEntry } from '../api'
import { clock, dayMonth, usd } from '../format'
import { lastSessionBy, type Market } from '../market'
import { BriefCard } from './BriefCard'
import { HiddenRow } from './HiddenRow'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

const WINDOWS = [
  { hours: 24, label: '24h' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
]

/** "Recorded filings, as of 30 Oct, 8:29 pm IST": the one line that says how old this is. */
function asOfLine(d: Digest): string {
  const s = d.source
  const fresh = s.source === 'live' || s.source === 'cache'
  const label = fresh ? 'Live NSE' : s.source === 'unavailable' ? 'No data' : 'Recorded filings'
  // A past date in the replay is "as of" the end of that window; otherwise the snapshot's own fetch time.
  const at = STATIC ? d.window.end : s.as_of
  return at ? `${label}, as of ${clock(at)} IST` : label
}

function priceLine(m: Market | null, end: string): string {
  if (!m) return 'Prices unavailable: price and volume alerts are off.'
  const last = lastSessionBy(m, end) ?? m.through
  return `Prices to the ${last ? dayMonth(last) : '?'} close, Yahoo Finance${m.message ? `. ${m.message}` : ''}`
}

function Skeleton() {
  return (
    <ul className="mt-4 space-y-3" aria-label="Loading briefing">
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

interface Props {
  data: Digest | null
  view: Digest | null
  market: Market | null
  manifest: Manifest | null
  researched: ResearchEntry[]
  latestDay: string | null
  hours: number
  onHours: (h: number) => void
  asOf: string | null
  onAsOf: (d: string | null) => void
  loading: boolean
  error: string | null
  refreshing: boolean
  onReload: (refresh?: boolean) => void
  customised: boolean
  spent: number | null
  dismissed: Set<string>
  onDismiss: (id: string) => void
  onRestore: (ids: string[]) => void
  onAsk: (c: Card) => void
  onLedger: () => void
}

export function Today({ data, view, market, manifest, researched, latestDay, hours, onHours, asOf, onAsOf, loading, error,
  refreshing, onReload, customised, spent, dismissed, onDismiss, onRestore, onAsk, onLedger }: Props) {
  const [dataOpen, setDataOpen] = useState(false)
  const windowLabel = WINDOWS.find((w) => w.hours === hours)?.label ?? `${hours}h`
  const cards = (view?.cards ?? []).filter((c) => !dismissed.has(c.lead.id))
  const dismissedHere = (view?.cards.length ?? 0) - cards.length
  const day = asOf ?? latestDay

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-title font-bold text-ink">FINN</h1>
        <button onClick={() => setDataOpen(true)} aria-label={`Change briefing window and date. ${windowLabel}${day ? `, ${dayMonth(day)}` : ''}`}
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-line px-3 font-medium text-ink-2">
          {day ? `${dayMonth(day)} · ` : ''}{windowLabel}<Icon name="down" size={14} />
        </button>
      </header>
      <p className="mt-1 text-meta text-ink-3">{data ? asOfLine(data) : 'Loading the briefing'}</p>

      <main className="mt-3 space-y-4">
        {loading && <Skeleton />}

        {!loading && error && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-semibold text-ink">Couldn't load the briefing</p>
            <p className="mt-1 text-ink-2">{error}</p>
            <button onClick={() => onReload()} className="mt-3 min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Try again</button>
          </div>
        )}

        {!loading && data && view && (
          <>
            <section>
              <p className="text-ink">
                <span className="text-figure font-semibold">{cards.length}</span>{' '}
                {cards.length === 1 ? 'company needs' : 'companies need'} a look
              </p>
              <p className="mt-0.5 text-meta text-ink-3">
                {data.counts.total} filings in the last {windowLabel}
                {cards.some((c) => c.market) && ` · ${cards.filter((c) => c.market).length} price or volume alerts`} · {view.counts.hidden} hidden
                {data.counts.duplicates_dropped > 0 && ` · ${data.counts.duplicates_dropped} ${data.counts.duplicates_dropped === 1 ? 'duplicate' : 'duplicates'} dropped`}
              </p>
            </section>

            {cards.length === 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="font-semibold text-ink">
                  {data.counts.total === 0 ? `No filings in the last ${windowLabel}` : customised ? 'Nothing passes your alert settings' : 'Nothing material'}
                </p>
                <p className="mt-1 text-ink-2">
                  {data.counts.total === 0
                    ? 'A quiet window. Widen it, or pick an earlier date to see a busy day.'
                    : customised
                      ? 'Everything in this window is muted or below your threshold. It is listed below.'
                      : 'Everything filed in this window was routine. It is listed below if you want to check.'}
                </p>
                {hours < 168 && (
                  <button onClick={() => onHours(168)} className="mt-3 min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Show 7 days</button>
                )}
              </div>
            )}

            <ul className="space-y-3">
              {cards.map((c, i) => (
                <BriefCard key={c.lead.id} card={c} rank={i + 1}
                           onDismiss={() => onDismiss(c.lead.id)} onAsk={() => onAsk(c)} />
              ))}
            </ul>

            {dismissedHere > 0 && (
              <button onClick={() => onRestore(view.cards.map((c) => c.lead.id))} className="min-h-11 text-ink-3 underline underline-offset-4">
                {dismissedHere} dismissed · show again
              </button>
            )}

            <HiddenRow groups={view.hidden} total={view.counts.hidden} />

            {view.quiet.length > 0 && (
              <p className="px-1 text-meta text-ink-3">
                Nothing from {view.quiet.length} holdings (no filings, no price or volume alert): {view.quiet.join(', ')}
              </p>
            )}

            <button onClick={onLedger} className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left text-ink-2">
              <span>{spent === null ? 'How FINN routes model calls' : `${usd(spent)} in model spend. See how`}</span>
              <Icon name="chevron" className="text-ink-3" />
            </button>
          </>
        )}
      </main>

      {dataOpen && (
        <Sheet title="Briefing window" onClose={() => setDataOpen(false)}>
          <div role="radiogroup" aria-label="Time window" className="flex rounded-full bg-raised p-0.5">
            {WINDOWS.map((w) => (
              <button key={w.hours} role="radio" aria-checked={hours === w.hours} onClick={() => onHours(w.hours)}
                      className={`min-h-11 flex-1 rounded-full font-semibold ${hours === w.hours ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
                {w.label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex min-h-11 items-center justify-between gap-3 text-ink-2">
            As of
            <input type="date" value={asOf ?? latestDay ?? ''} max={latestDay ?? undefined} min={STATIC ? manifest?.from : undefined}
                   onChange={(e) => onAsOf(!e.target.value || e.target.value === latestDay ? null : e.target.value)}
                   className="min-h-11 rounded-full border border-line bg-surface px-3 text-ink" />
          </label>
          {!STATIC && (
            <button onClick={() => onReload(true)} disabled={refreshing || loading || !!asOf}
                    className="mt-3 min-h-11 w-full rounded-full border border-line font-medium text-ink-2 disabled:opacity-40">
              {refreshing ? 'Fetching' : asOf ? 'Past briefings are fixed' : 'Fetch the latest filings'}
            </button>
          )}
          <p className="mt-5 font-semibold text-ink">{STATIC ? 'This is a recording' : 'Sources'}</p>
          {data && <p className="mt-1 text-ink-2">{asOfLine(data)}. {priceLine(market, data.window.end)}.</p>}
          {data?.source.message && <p className="mt-1 text-ink-2">{data.source.message}</p>}
          {STATIC && (
            <p className="mt-2 text-ink-2">
              {manifest ? `NSE filings for ${manifest.holdings} holdings, ${dayMonth(manifest.from)} to ${dayMonth(manifest.to)}` : 'Recorded NSE filings'}
              {researched.length > 0 && `, and research on ${researched.length} companies`}. Nothing here updates.
              Run locally for live filings and any NSE ticker: <code className="text-ink">./run.sh research TICKER</code>.
            </p>
          )}
        </Sheet>
      )}
    </>
  )
}
