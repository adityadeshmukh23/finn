import { useRef, useState } from 'react'
import type { Card, Item } from '../api'
import type { TimelineItem } from '../company'
import { CATEGORY_LABEL, clock, dayMonth } from '../format'
import { figuresWithheld, rowFigure, rowLine } from '../figure'
import { describe } from '../market'
import { swipeDismisses, swipeMayStart } from '../swipe'
import { plainHeadline } from '../plain'
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
  compact: boolean
}

export function BriefRow({ card, rank, onDismiss, onAsk, last, compact }: Props) {
  const [open, setOpen] = useState(!compact && rank <= 3)
  const [table, setTable] = useState(!compact)
  const row = useRef<HTMLLIElement>(null)
  const [more, setMore] = useState(false)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef<{ x: number; y: number; t: number; horizontal: boolean | null } | null>(null)
  const { lead } = card
  const extra = card.items.length + card.folded.length
  const figure = rowFigure(card)
  const big = rank === 1 || (!compact && rank <= 3) ? 'text-figure' : 'text-title'
  const glance = compact && !open
  const signColour = figure?.sign === 'up' ? 'text-up' : figure?.sign === 'down' ? 'text-down' : 'text-ink'
  const m = card.market
  const stockLine = m && lead.category !== 'market' && !(figure && figure.label.includes('volume')) ? `Stock ${describe(m)}, ${dayMonth(m.date)} close` : ''
  const isResults = lead.category === 'results'
  const isPeople = lead.category === 'management_change' && !!card.people?.length

  // One gesture only: swipe left to dismiss, from anywhere on the row but the left edge.
  // Vertical scrolling is left to the browser. Capture keeps the swipe alive if the pointer leaves the row.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('a') || !swipeMayStart(e.clientX)) return
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, horizontal: null }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    if (s.horizontal === null && Math.hypot(ddx, ddy) > 8) {
      s.horizontal = Math.abs(ddx) > Math.abs(ddy)
      if (s.horizontal) e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (s.horizontal) setDx(Math.min(0, ddx))
  }
  const leave = () => {
    setLeaving(true)
    const top = row.current?.getBoundingClientRect().top ?? 0
    setTimeout(() => onDismiss(top), 180)
  }
  const swiped = useRef(false)
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current
    start.current = null
    swiped.current = !!s?.horizontal
    if (s?.horizontal && swipeDismisses(dx, e.timeStamp - s.t, window.innerWidth)) leave()
    else setDx(0)
  }

  return (
    <li ref={row} id={`row-${card.symbol}`} className="relative overflow-hidden">
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
        onDragStart={(e) => e.preventDefault()}
        className="relative select-none bg-bg pl-3"
      >
        <span aria-hidden="true" className="absolute inset-y-3 left-0 rounded-full bg-ink" style={{ width: spine(rank) }} />
        <button onClick={() => { if (!swiped.current) setOpen(!open); swiped.current = false }} aria-expanded={open}
                className={`block w-full text-left ${compact ? (glance && rank === 1 ? 'pt-2.5' : 'py-2.5') : 'pb-3'}`}>
          <span className={`flex items-center gap-2 ${compact ? 'justify-between' : 'min-h-11 pr-11'}`}>
            <span className="truncate">
              <span className="font-semibold text-ink">{card.symbol}</span>
              <span className="text-meta text-ink-3"> · {category(lead)}</span>
            </span>
            {compact && <Icon name="down" size={14} className={`text-ink-3 ${open ? 'rotate-180' : ''}`} />}
          </span>
          <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className={`block text-ink ${open ? '' : 'line-clamp-2'}`}>{rowLine(card, last, glance)}</span>
            {(!glance || figuresWithheld(card)) && (
              <span className="mt-0.5 block text-meta text-ink-3">
                {!glance && (lead.category === 'market' ? `${dayMonth(m?.date ?? lead.ts)} close` : clock(lead.ts))}
                {figuresWithheld(card) && <span className="text-flag">{!glance && ' · '}Low confidence, figures withheld</span>}
                {!glance && stockLine && <span className="block">{stockLine}</span>}
              </span>
            )}
          </span>
          {figure && (
            <span className="shrink-0 text-right">
              <span className={`block font-semibold ${big} ${signColour}`}>{figure.value}</span>
              <span className="block text-meta text-ink-3">{figure.label}</span>
            </span>
          )}
          </span>
        </button>
        {!compact && (
          <button onClick={leave} aria-label={`Dismiss ${card.symbol}`}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-end text-ink-2 hover:text-ink">
            <Icon name="close" size={24} />
          </button>
        )}

        {/* #1 always says why, even collapsed or after a dismiss moved it up. In Compact it also carries the one button. */}
        {glance && rank === 1 && (
          <div className="flex items-center gap-3 pb-2.5 pt-1">
            <p className="min-w-0 flex-1 text-meta text-ink-3"><span className="text-ink-2">#1</span> {card.why_short}</p>
            <button onClick={onAsk} className="min-h-11 shrink-0 rounded-full bg-ink px-4 font-semibold text-bg active:scale-95">Ask FINN</button>
          </div>
        )}
        {!glance && card.why_rank && (open || rank === 1) && (
          <p className={`text-meta text-ink-3 ${open ? '' : 'pb-3'}`}><span className="font-semibold text-ink-2">#{rank}</span> {card.why_rank}</p>
        )}
        {open && (
          <div className="pb-3">
            <div className="mt-1 flex flex-wrap items-center gap-x-4">
              <FilingLink url={lead.url} label={lead.category === 'market' ? 'NSE quote' : 'Filing'} />
              {extra > 0 && (
                <button onClick={() => setMore(!more)} aria-expanded={more} className="min-h-11 min-w-11 text-ink-2">
                  {more ? 'Less' : `+${extra} more`}
                </button>
              )}
              {compact && <button onClick={leave} aria-label={`Dismiss ${card.symbol}`} className="min-h-11 min-w-11 text-ink-2">Dismiss</button>}
              <button onClick={onAsk} className="ml-auto min-h-11 rounded-full bg-ink px-4 font-semibold text-bg active:scale-95">
                Ask FINN
              </button>
            </div>
            {lead.why && !isResults && !isPeople && lead.category !== 'market' && <p className="text-ink-2">{lead.why}</p>}
            {card.results && isResults && (
              card.results.status === 'extracted' && card.results.confidence !== 'low' && !table ? (
                <button onClick={() => setTable(true)} aria-expanded={false}
                        className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-raised px-3 text-left">
                  <span>Results table <span className="text-meta text-ink-3">· {card.results.basis} · p.{card.results.page}</span></span>
                  <Icon name="down" size={14} className="text-ink-3" />
                </button>
              ) : <ResultsTable r={card.results} />
            )}
            {isPeople && <People people={card.people!} />}
            {lead.read && (
              <p className="mt-2 text-meta text-ink-3" title={`"${lead.read.quote}"`}>Summary checked against p.{lead.read.page} of the filing</p>
            )}

            {more && (
              <ul className="mt-1 space-y-2 border-t border-line pt-2">
                {card.results && !isResults && <li><ResultsTable r={card.results} /></li>}
                {card.items.map((it) => (
                  <li key={it.id}>
                    <p className="text-meta text-ink-3"><span className="font-semibold text-ink-2">{category(it)}</span> · {clock(it.ts)}</p>
                    <p className="text-ink">{plainHeadline(it.headline)}</p>
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
