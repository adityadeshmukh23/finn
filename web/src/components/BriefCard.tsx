import { useRef, useState } from 'react'
import type { Card, Item } from '../api'
import { CATEGORY_LABEL, clock, dayMonth } from '../format'
import { describe } from '../market'
import { Icon } from './Icon'
import { People } from './People'
import { ResultsTable } from './ResultsTable'

function Chip({ item }: { item: Item }) {
  return (
    <span className="text-meta font-semibold text-ink-2">{CATEGORY_LABEL[item.category] ?? item.category}</span>
  )
}

function FilingLink({ url, label = 'Filing' }: { url: string; label?: string }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="text-meta font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
      {label}<Icon name="external" size={12} className="ml-0.5" />
    </a>
  )
}

interface Props {
  card: Card
  rank: number
  onDismiss: () => void
  onAsk: () => void
}

export function BriefCard({ card, rank, onDismiss, onAsk }: Props) {
  const [open, setOpen] = useState(false)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null)
  const { lead } = card
  const more = card.items.length + card.folded.length

  // One gesture only: swipe left to dismiss. Vertical scrolling is left to the browser.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('a,button')) return
    start.current = { x: e.clientX, y: e.clientY, horizontal: null }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    if (s.horizontal === null && Math.hypot(ddx, ddy) > 8) s.horizontal = Math.abs(ddx) > Math.abs(ddy)
    if (s.horizontal) setDx(Math.min(0, ddx))
  }
  const onPointerUp = () => {
    const s = start.current
    start.current = null
    if (s?.horizontal && dx < -90) {
      setLeaving(true)
      setTimeout(onDismiss, 180)
    } else setDx(0)
  }

  return (
    <li className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-0 flex items-center justify-end rounded-2xl bg-raised pr-5 text-meta font-medium text-ink-3">
        Dismiss
      </div>
      <article
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${leaving ? -420 : dx}px)`,
          transition: start.current ? 'none' : 'transform 180ms ease-out',
          touchAction: 'pan-y',
        }}
        className="relative rounded-2xl border border-line bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <Chip item={lead} />
          <span className="text-meta text-ink-3">{clock(lead.ts)}</span>
        </div>

        <p className="mt-2 text-body text-ink-2">
          <span className="font-semibold text-ink">{card.symbol}</span>
          <span className="text-ink-3"> · </span>
          {card.company}
        </p>
        {card.market && lead.category !== 'market' && (
          <p className="mt-1 text-meta font-semibold text-ink">
            Stock {describe(card.market)}
            <span className="font-normal text-ink-3"> · {dayMonth(card.market.date)} close</span>
          </p>
        )}
        <h3 className="mt-1 text-body font-semibold text-ink">{lead.headline}</h3>
        {lead.why && lead.category !== 'results' && !(lead.category === 'management_change' && card.people?.length) && <p className="mt-1.5 text-body text-ink-2">{lead.why}</p>}
        {card.results && lead.category === 'results' && <ResultsTable r={card.results} />}
        {card.people && card.people.length > 0 && lead.category === 'management_change' && <People people={card.people} />}
        {card.why_rank && (
          <p className="mt-2 text-meta text-ink-3">
            <span className="font-semibold text-ink-2">#{rank}</span> {card.why_rank}
          </p>
        )}

        <div className="mt-3 flex items-center gap-4">
          <FilingLink url={lead.url} label={lead.category === 'market' ? 'NSE quote' : 'Filing'} />
          {lead.read && (
            <span className="text-meta text-ink-3" title={`"${lead.read.quote}"`}>Summary checked against p.{lead.read.page}</span>
          )}
          {more > 0 && (
            <button onClick={() => setOpen(!open)} aria-expanded={open}
                    className="text-meta font-medium text-ink-2 hover:text-ink">
              {open ? 'Less' : `+${more} more`}
            </button>
          )}
          <button onClick={onAsk}
                  className="ml-auto rounded-full bg-ink px-3 py-1.5 text-meta font-semibold text-bg active:scale-95">
            Ask FINN
          </button>
        </div>

        {open && (
          <ul className="mt-3 space-y-3 border-t border-line pt-3">
            {card.results && lead.category !== 'results' && (
              <li><ResultsTable r={card.results} /></li>
            )}
            {card.items.map((it) => (
              <li key={it.id}>
                <div className="flex items-center justify-between gap-3">
                  <Chip item={it} />
                  <span className="text-meta text-ink-3">{clock(it.ts)}</span>
                </div>
                <p className="mt-1 text-body text-ink">{it.headline}</p>
                <div className="mt-1"><FilingLink url={it.url} /></div>
              </li>
            ))}
            {card.folded.length > 0 && (
              <li className="text-meta text-ink-3">
                {card.folded.length} results newspaper {card.folded.length === 1 ? 'ad' : 'ads'} (same numbers, already filed){' '}
                {card.folded.map((it, i) => (
                  <a key={it.id} href={it.url} target="_blank" rel="noopener noreferrer"
                     className="underline underline-offset-4">{i ? ', ' : ''}ad {i + 1}<Icon name="external" size={12} className="ml-0.5" /></a>
                ))}
              </li>
            )}
            {card.routine_count - card.folded.length > 0 && (
              <li className="text-meta text-ink-3">
                {card.routine_count - card.folded.length} routine{' '}
                {card.routine_count - card.folded.length === 1 ? 'filing' : 'filings'} from {card.symbol} hidden below
              </li>
            )}
          </ul>
        )}
        <span className="sr-only">Rank {rank}</span>
      </article>
    </li>
  )
}
