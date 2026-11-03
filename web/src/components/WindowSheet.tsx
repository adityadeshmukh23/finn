import { STATIC, type Digest, type Manifest, type ResearchEntry } from '../api'
import { lastSessionBy, type Market } from '../market'
import { Sheet } from './Sheet'
import * as fig from '../fig'

export const WINDOWS = [
  { hours: 24, label: '24h' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
]

export const windowLabel = (hours: number) => WINDOWS.find((w) => w.hours === hours)?.label ?? `${hours}h`

/** "Recorded filings, as of 30 Oct, 8:29 pm IST": the one line that says how old this is. */
export function asOfLine(d: Digest): string {
  const s = d.source
  const fresh = s.source === 'live' || s.source === 'cache'
  const label = fresh ? 'Live NSE' : s.source === 'unavailable' ? 'No data' : 'Recorded filings'
  // A past date in the replay is "as of" the end of that window; otherwise the snapshot's own fetch time.
  const at = STATIC ? d.window.end : s.as_of
  return at ? `${label}, as of ${fig.clock(at)} IST` : label
}

/** The briefing's bookkeeping: what came in and what happened to it. */
export function briefingStats(data: Digest, view: Digest, hours: number): string {
  const alerts = view.cards.filter((c) => c.market).length
  const dups = data.counts.duplicates_dropped
  return `${data.counts.total} filings in the last ${windowLabel(hours)}${alerts ? ` · ${alerts} price or volume alerts` : ''} · ${view.counts.hidden} hidden${dups ? ` · ${dups} ${dups === 1 ? 'duplicate' : 'duplicates'} dropped` : ''}`
}

function priceLine(m: Market | null, end: string): string {
  if (!m) return 'Prices unavailable: price and volume alerts are off.'
  const last = lastSessionBy(m, end) ?? m.through
  return `Prices to the ${last ? fig.day(last) : '?'} close, Yahoo Finance${m.message ? `. ${m.message}` : ''}`
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
  refreshing: boolean
  onRefresh: () => void
  onClose: () => void
}

export function WindowSheet({ data, view, market, manifest, researched, latestDay, hours, onHours, asOf, onAsOf, loading, refreshing, onRefresh, onClose }: Props) {
  return (
    <Sheet title="Briefing window" onClose={onClose}>
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
        <button onClick={onRefresh} disabled={refreshing || loading || !!asOf}
                className="mt-3 min-h-11 w-full rounded-full border border-line font-medium text-ink-2 disabled:opacity-40">
          {refreshing ? 'Fetching' : asOf ? 'Past briefings are fixed' : 'Fetch the latest filings'}
        </button>
      )}
      {data && view && (
        <>
          <p className="mt-5 font-semibold text-ink">This briefing</p>
          <p className="mt-1 text-ink-2">{briefingStats(data, view, hours)}.</p>
          {view.quiet.length > 0 && <p className="mt-1 text-ink-2">Nothing from {view.quiet.length} holdings: {view.quiet.join(', ')}.</p>}
        </>
      )}
      <p className="mt-5 font-semibold text-ink">{STATIC ? 'This is a recording' : 'Sources'}</p>
      {data && <p className="mt-1 text-ink-2">{asOfLine(data)}. {priceLine(market, data.window.end)}.</p>}
      {data?.source.message && <p className="mt-1 text-ink-2">{data.source.message}</p>}
      {STATIC && (
        <p className="mt-2 text-ink-2">
          {manifest ? `NSE filings for ${manifest.holdings} holdings, ${fig.day(manifest.from)} to ${fig.day(manifest.to)}` : 'Recorded NSE filings'}
          {researched.length > 0 && `, and research on ${researched.length} companies`}. Nothing here updates.
        </p>
      )}
    </Sheet>
  )
}
