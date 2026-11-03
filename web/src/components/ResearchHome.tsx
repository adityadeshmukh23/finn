import { useState } from 'react'
import type { ResearchEntry, Walk } from '../api'
import { lead, named, trail } from '../walk'
import { Icon } from './Icon'

const GROUP: Record<Walk['group'], string> = {
  revised_delivered: 'revised and delivered', held_delivered: 'held and delivered', revised_open: 'revised and open',
}

const checkable = (c: ResearchEntry['counts']) => {
  const n = c.met + c.partially + c.missed
  return n ? `${n} checkable` : 'No checkable promise yet'
}

function WalkRow({ w, onOpen }: { w: Walk; onOpen: (path: string) => void }) {
  return (
    <li>
      <button onClick={() => onOpen(`${w.symbol}/${w.row}`)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{named(w)}</span>
          <span className="block text-meta text-ink-2">{lead(w)}</span>
        </span>
        <Icon name="chevron" className="shrink-0 text-ink-3" />
      </button>
    </li>
  )
}

function Group({ count, group, walks, onOpen }: { count: number; group: Walk['group']; walks: Walk[]; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold text-ink">
        {count} {GROUP[group]}
        <Icon name="down" size={14} className={`shrink-0 text-ink-3 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <ul className="divide-y divide-line border-t border-line">{walks.map((w) => <WalkRow key={`${w.symbol}-${w.row}`} w={w} onOpen={onOpen} />)}</ul>}
    </div>
  )
}

/** One promise followed call by call. The revised and delivered walk leads, because it's the one with something to compare; the rest are a count until opened. */
function FrontDoor({ walks, onOpen }: { walks: Walk[]; onOpen: (path: string) => void }) {
  const of = (g: Walk['group']) => walks.filter((w) => w.group === g)
  const anchors = of('revised_delivered')
  return (
    <section className="mt-3 divide-y divide-line border-y border-line" aria-label="Guidance walks">
      {anchors.length > 0 && (
        <div className="py-2">
          <p className="min-h-6 font-semibold text-ink">{anchors.length} {GROUP.revised_delivered}</p>
          {anchors.map((w) => (
            <button key={w.row} onClick={() => onOpen(`${w.symbol}/${w.row}`)} className="mt-0.5 flex w-full items-center gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-ink">{named(w)}</span>
                <span className="block text-ink-2">{trail(w)}</span>
                <span className="block font-semibold text-ink">{lead(w)}</span>
              </span>
              <Icon name="chevron" className="shrink-0 text-ink-3" />
            </button>
          ))}
        </div>
      )}
      {(['held_delivered', 'revised_open'] as const).map((g) => of(g).length > 0 && <Group key={g} count={of(g).length} group={g} walks={of(g)} onOpen={onOpen} />)}
    </section>
  )
}

/** The walks, then one row per recorded company. The verdict counts are one tap down, on the scorecard, to keep this screen to 16 numbers. Never a single score. */
export function ResearchHome({ entries, walks = [], book, onOpen }: { entries: ResearchEntry[]; walks?: Walk[]; book: Set<string>; onOpen: (sym: string) => void }) {
  return (
    <main>
      <h1 className="text-title font-semibold text-ink">Promised vs delivered</h1>
      <p className="text-meta text-ink-3">
        Management's guidance against what it reported. Transcripts and annual reports only.
      </p>
      {walks.length > 0 && <FrontDoor walks={walks} onOpen={onOpen} />}
      {walks.length > 0 && entries.length > 0 && <h2 className="mt-5 text-meta text-ink-3">Scorecards</h2>}
      {entries.length === 0 ? (
        <p className="mt-4 text-ink-2">No research recorded in this build.</p>
      ) : (
        <ul className={`divide-y divide-line border-b border-line ${walks.length > 0 ? 'mt-1' : 'mt-3 border-t'}`}>
          {entries.map((r) => (
            <li key={r.symbol}>
              <button onClick={() => onOpen(r.symbol)} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink">{r.symbol}</span>
                  <span className="text-meta text-ink-3"> · {r.name || r.symbol}{book.has(r.symbol) ? ' · in your book' : ''}</span>
                  <span className="mt-0.5 block text-ink-2">{checkable(r.counts)}</span>
                </span>
                <Icon name="chevron" className="text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
