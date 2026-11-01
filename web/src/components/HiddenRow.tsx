import { useState } from 'react'
import type { HiddenGroup } from '../api'
import { clock } from '../format'
import { Icon } from './Icon'

export function HiddenRow({ groups, total }: { groups: HiddenGroup[]; total: number }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<string | null>(null)
  if (total === 0) return null
  const preview = groups.slice(0, 3).map((g) => `${g.count} ${g.reason.toLowerCase()}`).join(' · ')

  return (
    <section className="rounded-2xl border border-dashed border-line">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full p-4 text-left">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body font-semibold text-ink">
            {total} {total === 1 ? 'filing' : 'filings'} hidden
          </p>
          <span className="text-meta font-medium text-ink-3">{open ? 'Close' : 'See why'}</span>
        </div>
        {!open && <p className="mt-1 text-body text-ink-3">{preview}{groups.length > 3 ? ' · …' : ''}</p>}
      </button>

      {open && (
        <ul className="border-t border-dashed border-line">
          {groups.map((g) => (
            <li key={g.reason} className="border-b border-dashed border-line last:border-0">
              <button onClick={() => setGroup(group === g.reason ? null : g.reason)}
                      aria-expanded={group === g.reason}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="text-body text-ink-2">{g.reason}</span>
                <span className="text-body font-semibold text-ink">{g.count}</span>
              </button>
              {group === g.reason && (
                <ul className="space-y-2.5 px-4 pb-4">
                  {g.items.map((it) => (
                    <li key={it.id} className="text-body ">
                      <span className="font-semibold text-ink">{it.symbol}</span>{' '}
                      <span className="text-ink-2">{it.headline}</span>{' '}
                      <span className="whitespace-nowrap text-meta text-ink-3">{clock(it.ts)}</span>{' '}
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noopener noreferrer"
                           className="whitespace-nowrap text-meta text-ink-3 underline underline-offset-4">filing<Icon name="external" size={12} className="ml-0.5" /></a>
                      )}
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
