import { useState } from 'react'
import type { Card, Digest } from '../api'
import { usd } from '../format'
import { noSessionNote, type Market } from '../market'
import { BriefRow } from './BriefRow'
import { HiddenRow } from './HiddenRow'
import { Icon } from './Icon'
import { asOfLine, windowLabel } from './WindowSheet'

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
  data: Digest | null
  view: Digest | null
  market: Market | null
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
  onLedger: () => void
}

export function Today({ data, view, market, day, hours, onHours, loading, error, onReload, customised, spent, dismissed, onDismiss, onRestore, onAsk, onLedger }: Props) {
  const [details, setDetails] = useState(false)
  const span = windowLabel(hours)
  const cards = (view?.cards ?? []).filter((c) => !dismissed.has(c.lead.id))
  const dismissedHere = (view?.cards.length ?? 0) - cards.length

  return (
    <>
      <header>
        <h1 className="text-title font-bold text-ink">FINN</h1>
      </header>
      <p className="text-meta text-ink-3">{data ? asOfLine(data) : 'Loading the briefing'}</p>

      <main className="mt-3 space-y-4">
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
            <section>
              <div className="flex items-center justify-between gap-3">
                <p className="text-ink">
                  <span className="text-figure font-semibold">{cards.length}</span>{' '}
                  {cards.length === 1 ? 'company needs' : 'companies need'} a look
                </p>
                <button onClick={() => setDetails(!details)} aria-expanded={details}
                        className="-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 px-2 text-meta text-ink-3">
                  Details<Icon name="down" size={14} className={details ? 'rotate-180' : ''} />
                </button>
              </div>
              {details && <p className="text-meta text-ink-3">
                {data.counts.total} filings in the last {span}
                {cards.some((c) => c.market) && ` · ${cards.filter((c) => c.market).length} price or volume alerts`} · {view.counts.hidden} hidden
                {data.counts.duplicates_dropped > 0 && ` · ${data.counts.duplicates_dropped} ${data.counts.duplicates_dropped === 1 ? 'duplicate' : 'duplicates'} dropped`}
              </p>}
            </section>

            {cards.length === 0 && (
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
                {cards.map((c, i) => (
                  <BriefRow key={c.lead.id} card={c} rank={i + 1}
                            onDismiss={(top) => onDismiss(c.lead.id, c.symbol, top)} onAsk={() => onAsk(c)} />
                ))}
              </ul>
            )}

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

    </>
  )
}
