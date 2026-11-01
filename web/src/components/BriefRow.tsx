import { useRef, useState } from 'react'
import type { Card, Item } from '../api'
import type { TimelineItem } from '../company'
import { CATEGORY_LABEL, clock, dayMonth } from '../format'
import { figuresWithheld, rowFigure, rowLine } from '../figure'
import { describe } from '../market'
import { Icon } from './Icon'
import { People } from './People'
import { ResultsTable } from './ResultsTable'

const category = (it: Item) => CATEGORY_LABEL[it.category] ?? it.category

function FilingLink({ url, label = 'Filing' }: { url: string; label?: string }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center gap-1 text-ink-2 underline decoration-line underline-offset-4">
      {label}<Icon name="external" size={12} />
    </a>
  )
}

// The rank spine: the higher the row, the heavier the line. 4 px on #1, a hairline by #6.
const spine = (rank: number) => (rank === 1 ? 4 : rank <= 3 ? 3 : rank <= 5 ? 2 : 1)

interface Props {
  card: Card
  rank: number
  onDismiss: (top: number) => void
  onAsk: () => void
  last: TimelineItem | null
}

export function BriefRow({ card, rank, onDismiss, onAsk, last }: Props) {
  const [open, setOpen] = useState(rank <= 3)
  const row = useRef<HTMLLIElement>(null)
  const [more, setMore] = useState(false)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null)
  const { lead } = card
  const extra = card.items.length + card.folded.length
  const figure = rowFigure(card)
  const big = rank <= 3 ? 'text-figure' : 'text-title'
  const signColour = figure?.sign === 'up' ? 'text-up' : figure?.sign === 'down' ? 'text-down' : 'text-ink'
  const m = card.market
  const stockLine = m && lead.category !== 'market' && !(figure && figure.label.includes('volume')) ? `Stock ${describe(m)}, ${dayMonth(m.date)} close` : ''
  const isResults = lead.category === 'results'
  const isPeople = lead.category === 'management_change' && !!card.people?.length

  // One gesture only: swipe left to dismiss. Vertical scrolling is left to the browser.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('a')) return
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
  const leave = () => {
    setLeaving(true)
    const top = row.current?.getBoundingClientRect().top ?? 0
    setTimeout(() => onDismiss(top), 180)
  }
  const swiped = useRef(false)
  const onPointerUp = () => {
    const s = start.current
    start.current = null
    swiped.current = !!s?.horizontal
    if (s?.horizontal && dx < -90) leave()
    else setDx(0)
  }

  return (
    <li ref={row} className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end bg-raised pr-5 text-meta text-ink-3">Dismiss</div>
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
        className="relative bg-bg pl-3"
      >
        <span aria-hidden="true" className="absolute inset-y-3 left-0 rounded-full bg-ink" style={{ width: spine(rank) }} />
        <button onClick={() => { if (!swiped.current) setOpen(!open); swiped.current = false }} aria-expanded={open}
                className="block w-full pb-3 text-left">
          <span className="flex min-h-11 items-center pr-11">
            <span className="truncate">
              <span className="font-semibold text-ink">{card.symbol}</span>
              <span className="text-meta text-ink-3"> · {category(lead)}</span>
            </span>
          </span>
          <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className={`block text-ink ${open ? '' : 'line-clamp-2'}`}>{rowLine(card, last)}</span>
            <span className="mt-0.5 block text-meta text-ink-3">
              {lead.category === 'market' ? `${dayMonth(m?.date ?? lead.ts)} close` : clock(lead.ts)}
              {figuresWithheld(card) && <span className="text-flag"> · Low confidence, figures withheld</span>}
              {stockLine && <span className="block">{stockLine}</span>}
            </span>
          </span>
          {figure && (
            <span className="shrink-0 text-right">
              <span className={`block font-semibold ${big} ${signColour}`}>{figure.value}</span>
              <span className="block text-meta text-ink-3">{figure.label}</span>
            </span>
          )}
          </span>
        </button>
        <button onClick={leave} aria-label={`Dismiss ${card.symbol}`}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-end text-ink-3 hover:text-ink">
          <Icon name="close" size={18} />
        </button>

        {open && (
          <div className="pb-3">
            {lead.why && !isResults && !isPeople && lead.category !== 'market' && <p className="text-ink-2">{lead.why}</p>}
            {card.results && isResults && <ResultsTable r={card.results} />}
            {isPeople && <People people={card.people!} />}
            {lead.read && (
              <p className="mt-2 text-meta text-ink-3" title={`"${lead.read.quote}"`}>Summary checked against p.{lead.read.page} of the filing</p>
            )}
            {card.why_rank && (
              <p className="mt-2 text-meta text-ink-3"><span className="font-semibold text-ink-2">#{rank}</span> {card.why_rank}</p>
            )}

            <div className="mt-1 flex items-center gap-4">
              <FilingLink url={lead.url} label={lead.category === 'market' ? 'NSE quote' : 'Filing'} />
              {extra > 0 && (
                <button onClick={() => setMore(!more)} aria-expanded={more} className="min-h-11 min-w-11 text-ink-2">
                  {more ? 'Less' : `+${extra} more`}
                </button>
              )}
              <button onClick={onAsk} className="ml-auto min-h-11 rounded-full bg-ink px-4 font-semibold text-bg active:scale-95">
                Ask FINN
              </button>
            </div>

            {more && (
              <ul className="mt-1 space-y-2 border-t border-line pt-2">
                {card.results && !isResults && <li><ResultsTable r={card.results} /></li>}
                {card.items.map((it) => (
                  <li key={it.id}>
                    <p className="text-meta text-ink-3"><span className="font-semibold text-ink-2">{category(it)}</span> · {clock(it.ts)}</p>
                    <p className="text-ink">{it.headline}</p>
                    <FilingLink url={it.url} />
                  </li>
                ))}
                {card.folded.length > 0 && (
                  <li className="text-meta text-ink-3">
                    {card.folded.length} results newspaper {card.folded.length === 1 ? 'ad' : 'ads'}, same numbers, already filed{' '}
                    {card.folded.map((it, i) => (
                      <a key={it.id} href={it.url} target="_blank" rel="noopener noreferrer"
                         className="mr-2 inline-flex min-h-11 min-w-11 items-center gap-1 underline underline-offset-4">ad {i + 1}<Icon name="external" size={12} /></a>
                    ))}
                  </li>
                )}
                {card.routine_count - card.folded.length > 0 && (
                  <li className="text-meta text-ink-3">
                    {card.routine_count - card.folded.length} routine{' '}
                    {card.routine_count - card.folded.length === 1 ? 'filing' : 'filings'} from {card.symbol} in the hidden list
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
        <span className="sr-only">Rank {rank}</span>
      </article>
    </li>
  )
}
