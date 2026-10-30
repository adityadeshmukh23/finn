import { useRef, useState } from 'react'
import type { Card, Item } from '../api'
import { CATEGORY_LABEL, when } from '../format'

const TIER_DOT: Record<string, string> = { high: 'bg-hot', medium: 'bg-accent', routine: 'bg-ink-3' }

function Chip({ item }: { item: Item }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
      <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[item.tier]}`} />
      {CATEGORY_LABEL[item.category] ?? item.category}
    </span>
  )
}

function FilingLink({ url }: { url: string }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="text-xs font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
      Filing ↗
    </a>
  )
}

interface Props {
  card: Card
  rank: number
  refTime: Date
  onDismiss: () => void
  onAsk: () => void
}

export function BriefCard({ card, rank, refTime, onDismiss, onAsk }: Props) {
  const [open, setOpen] = useState(false)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null)
  const { lead } = card
  const more = card.items.length

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
      <div className="absolute inset-0 flex items-center justify-end rounded-2xl bg-raised pr-5 text-xs font-medium text-ink-3">
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
          <span className="tabular text-xs text-ink-3">{when(lead.ts, refTime)}</span>
        </div>

        <p className="mt-2 text-[13px] text-ink-2">
          <span className="font-semibold text-ink">{card.symbol}</span>
          <span className="text-ink-3"> · </span>
          {card.company}
        </p>
        <h3 className="mt-1 text-[15px] font-semibold leading-snug text-ink">{lead.headline}</h3>
        {lead.why && <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{lead.why}</p>}

        <div className="mt-3 flex items-center gap-4">
          <FilingLink url={lead.url} />
          {more > 0 && (
            <button onClick={() => setOpen(!open)} aria-expanded={open}
                    className="text-xs font-medium text-ink-2 hover:text-ink">
              {open ? 'Less' : `+${more} more`}
            </button>
          )}
          <button onClick={onAsk}
                  className="ml-auto rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-bg active:scale-95">
            Ask FINN
          </button>
        </div>

        {open && (
          <ul className="mt-3 space-y-3 border-t border-line pt-3">
            {card.items.map((it) => (
              <li key={it.id}>
                <div className="flex items-center justify-between gap-3">
                  <Chip item={it} />
                  <span className="tabular text-xs text-ink-3">{when(it.ts, refTime)}</span>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-ink">{it.headline}</p>
                <div className="mt-1"><FilingLink url={it.url} /></div>
              </li>
            ))}
            {card.routine_count > 0 && (
              <li className="text-xs text-ink-3">
                {card.routine_count} routine {card.routine_count === 1 ? 'filing' : 'filings'} from {card.symbol} hidden below
              </li>
            )}
          </ul>
        )}
        <span className="sr-only">Rank {rank}</span>
      </article>
    </li>
  )
}
