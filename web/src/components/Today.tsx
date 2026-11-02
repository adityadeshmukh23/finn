import { useState, type ReactNode } from 'react'
import type { Card, Digest } from '../api'
import { bookTally, moveContext, type Timeline } from '../company'
import type { Density } from '../density'
import { dayMonth, usd } from '../format'
import { lastSessionBy, noSessionNote, type Market } from '../market'
import { rankCards, TOP_ROWS } from '../rank'
import { briefingEnd, compactEnd, synthesis } from '../synthesis'
import { BookStrip } from './BookStrip'
import { BriefRow } from './BriefRow'
import { HiddenRow } from './HiddenRow'
import { Icon } from './Icon'
import { asOfLine, briefingStats, windowLabel } from './WindowSheet'

function Skeleton() {
  return (
    <ul className="mt-4 divide-y divide-line border-y border-line" aria-label="Loading briefing">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex gap-3 py-3 pl-3">
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-3 w-24" />
          </div>
          <div className="skeleton h-7 w-16" />
        </li>
      ))}
    </ul>
  )
}

interface Props {
  chip: ReactNode
  density: Density
  data: Digest | null
  view: Digest | null
  market: Market | null
  timeline: Timeline | null
  hours: number
  onHours: (h: number) => void
  day: string | null
  loading: boolean
  error: string | null
  onReload: () => void
  customised: boolean
  spent: number | null
  dismissed: Set<string>
  onDismiss: (id: string, symbol: string, top: number) => void
  onRestore: (ids: string[]) => void
  onAsk: (c: Card) => void
  onOpen: (sym: string) => void
  onLedger: () => void
  onBook: () => void
  onHowTo: () => void
}

export function Today({ chip, density, data, view, market, timeline, day, hours, onHours, loading, error, onReload, customised, spent, dismissed, onDismiss, onRestore, onAsk, onOpen, onLedger, onBook, onHowTo }: Props) {
  const [details, setDetails] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const span = windowLabel(hours)
  // Rank what's left, so the numbers, the lead rule and the "why #N" lines stay true after a dismiss.
  const cards = rankCards((view?.cards ?? []).filter((c) => !dismissed.has(c.lead.id)))
  const dismissedHere = (view?.cards.length ?? 0) - cards.length
  const compact = density === 'compact'
  const shown = compact && !showMore ? cards.slice(0, TOP_ROWS) : cards
  const tally = compact && market && view ? bookTally(market.sessions, view.window.end) : null
  const closes = tally && market && view ? lastSessionBy(market, view.window.end) : null
  const says = view ? synthesis(cards, view.window.start, timeline) : []

  return (
    <>
      <header className="flex items-center gap-1">
        <h1 className="flex-1 text-title font-bold text-ink">FINN</h1>
        <button onClick={onHowTo} aria-label="How to read this" className="flex h-11 w-11 items-center justify-center text-ink-2">
          <Icon name="info" size={22} />
        </button>
        {chip}
      </header>
      <p className="text-meta text-ink-3">{data ? asOfLine(data) : 'Loading the briefing'}</p>

      <main className={compact ? 'space-y-4' : 'mt-3 space-y-4'}>
        {loading && <Skeleton />}

        {!loading && error && (
          <div className="border-y border-line py-4">
            <p className="font-semibold text-ink">Couldn't load the briefing</p>
            <p className="mt-1 text-ink-2">{error}</p>
            <button onClick={() => onReload()} className="mt-3 min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Try again</button>
          </div>
        )}

        {!loading && data && view && (
          <>
            <section className={compact ? 'mt-1' : ''}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-ink">
                  <span className="text-figure font-semibold">{cards.length}</span>{' '}
                  {cards.length === 1 ? 'company needs' : 'companies need'} a look
                </p>
                {!compact && (
                  <button onClick={() => setDetails(!details)} aria-expanded={details}
                          className="-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 px-2 text-meta text-ink-3">
                    Details<Icon name="down" size={14} className={details ? 'rotate-180' : ''} />
                  </button>
                )}
              </div>
              {!compact && says.length > 0 && (
                <p className="text-ink-2">
                  {says.map((s, i) => (
                    <span key={s.symbol}>
                      {i > 0 && ' '}
                      {/* An inline link: its padding gives a 44 px target without pushing the lines apart. */}
                      <a href={`#row-${s.symbol}`} onClick={(e) => { e.preventDefault(); document.getElementById(`row-${s.symbol}`)?.scrollIntoView({ block: 'start' }) }}
                         className="py-[13px] underline decoration-line underline-offset-4">{s.text}.</a>
                    </span>
                  ))}
                </p>
              )}
              {!compact && <div className="mt-2"><BookStrip view={view} market={market} timeline={timeline} onOpen={onOpen} /></div>}
              {!compact && details && <p className="mt-2 text-meta text-ink-3">
                {briefingStats(data, view, hours)}
                {view.quiet.length > 0 && <span className="mt-1 block">Nothing from {view.quiet.length} holdings: {view.quiet.join(', ')}.</span>}
                <span className="mt-1 block">Tiles show each holding's last close, tinted by the move. A dot means a filing in this window.</span>
              </p>}
            </section>

            {view.cards.length === 0 && (
              <div className="border-y border-line py-4">
                <p className="font-semibold text-ink">
                  {data.counts.total === 0 ? `No filings in the last ${span}` : customised ? 'Nothing passes your alert settings' : 'Nothing material'}
                </p>
                <p className="mt-1 text-ink-2">
                  {data.counts.total === 0
                    ? `${day ? noSessionNote(market, day) ?? '' : ''} Nothing for FINN to rank. A wider window or another date has more.`.trim()
                    : customised
                      ? 'Everything in this window is muted or below your threshold. It is in the hidden list.'
                      : 'Everything filed in this window was routine. It is in the hidden list.'}
                </p>
                {hours < 168 && (
                  <button onClick={() => onHours(168)} className="mt-3 min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Show 7 days</button>
                )}
              </div>
            )}

            {cards.length > 0 && (
              <ul className="divide-y divide-line border-y border-line">
                {shown.map((c, i) => (
                  <BriefRow key={c.lead.id} card={c} rank={i + 1} compact={compact}
                            onDismiss={(top) => onDismiss(c.lead.id, c.symbol, top)} onAsk={() => onAsk(c)}
                            context={c.lead.category === 'market' && c.market && timeline ? moveContext(timeline[c.symbol], market?.sessions[c.symbol], c.market.date, view.window.start) : null} />
                ))}
              </ul>
            )}

            {compact && (
              <div className="-mt-4 divide-y divide-line">
                {cards.length > TOP_ROWS && (
                  <button onClick={() => setShowMore(!showMore)} aria-expanded={showMore}
                          className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold text-ink">
                    {showMore ? 'Show the top 3 only' : `${cards.length - TOP_ROWS} more ${cards.length - TOP_ROWS === 1 ? 'company' : 'companies'}`}
                    <Icon name="down" size={14} className={`shrink-0 text-ink-3 ${showMore ? 'rotate-180' : ''}`} />
                  </button>
                )}
                {tally && (
                  <button onClick={onBook} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-ink-2">
                    Book{closes ? `, ${dayMonth(closes)} close` : ''}: {tally.up} up, {tally.down} down{tally.flat > 0 && `, ${tally.flat} flat`}
                    <Icon name="chevron" size={14} className="shrink-0 text-ink-3" />
                  </button>
                )}
                {(view.cards.length > 0 || view.counts.hidden > 0) && (view.counts.hidden > 0
                  ? <HiddenRow groups={view.hidden} total={view.counts.hidden} label={compactEnd(dismissedHere, view.counts.hidden)} />
                  : <p className="flex min-h-11 items-center text-ink-2">{compactEnd(dismissedHere, 0)}</p>)}
              </div>
            )}

            {dismissedHere > 0 && (
              <button onClick={() => onRestore(view.cards.map((c) => c.lead.id))} className="min-h-11 text-ink-3 underline underline-offset-4">
                {dismissedHere} dismissed · show again
              </button>
            )}

            {!compact && <HiddenRow groups={view.hidden} total={view.counts.hidden} />}

            {!compact && (view.cards.length > 0 || view.counts.hidden > 0) && (
              <p className="flex items-start gap-2 font-semibold text-ink">
                <Icon name="check" size={20} className="mt-px" />
                {briefingEnd(cards.length, dismissedHere, view.counts.hidden)}
              </p>
            )}

            {!compact && <button onClick={onLedger} className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left text-ink-2">
              <span>{spent === null ? 'How FINN routes model calls' : `${usd(spent)} in model spend. See how`}</span>
              <Icon name="chevron" className="text-ink-3" />
            </button>}
          </>
        )}
      </main>

    </>
  )
}
