import { useState } from 'react'
import type { HiddenGroup } from '../api'
import { clock } from '../format'
import { filingLine } from '../plain'
import { Icon } from './Icon'

/** `label` swaps the summary header for one plain line, for the Compact screen. */
export function HiddenRow({ groups, total, label }: { groups: HiddenGroup[]; total: number; label?: string }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<string | null>(null)
  if (total === 0) return null
  const preview = groups.slice(0, 3).map((g) => `${g.count} ${g.reason.toLowerCase()}`).join(' · ')

  return (
    <section className={label ? '' : 'border-y border-line'}>
      {label ? (
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-ink-2">
          {label}<Icon name="down" size={14} className={`shrink-0 text-ink-3 ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : <button onClick={() => setOpen(!open)} aria-expanded={open} className="min-h-14 w-full py-3 text-left">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-ink">{total} {total === 1 ? 'filing' : 'filings'} hidden</p>
          <span className="text-meta font-medium text-ink-3">{open ? 'Close' : 'See why'}</span>
        </div>
        {!open && <p className="mt-0.5 text-meta text-ink-3">{preview}{groups.length > 3 ? ' · …' : ''}</p>}
      </button>}

      {open && (
        <ul className="border-t border-line">
          {groups.map((g) => (
            <li key={g.reason} className="border-b border-line last:border-0">
              <button onClick={() => setGroup(group === g.reason ? null : g.reason)}
                      aria-expanded={group === g.reason}
                      className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left">
                <span className="text-ink-2">{g.reason}</span>
                <span className="font-semibold text-ink">{g.count}</span>
              </button>
              {group === g.reason && (
                <ul className="space-y-1 pb-3">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <span className="font-semibold text-ink">{it.symbol}</span>{' '}
                      <span className="text-ink-2">{filingLine(it)}</span>
                      <span className="flex items-center gap-3 text-meta text-ink-3">
                        {clock(it.ts)}
                        {it.url && (
                          <a href={it.url} target="_blank" rel="noopener noreferrer"
                             className="inline-flex min-h-11 min-w-11 items-center gap-1 underline underline-offset-4">filing<Icon name="external" size={12} /></a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
