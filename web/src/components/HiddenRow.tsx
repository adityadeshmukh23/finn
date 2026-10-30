import { useState } from 'react'
import type { HiddenGroup } from '../api'
import { when } from '../format'

export function HiddenRow({ groups, total, refTime }: { groups: HiddenGroup[]; total: number; refTime: Date }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<string | null>(null)
  if (total === 0) return null
  const preview = groups.slice(0, 3).map((g) => `${g.count} ${g.reason.toLowerCase()}`).join(' · ')

  return (
    <section className="rounded-2xl border border-dashed border-line">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full p-4 text-left">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold text-ink">
            <span className="tabular">{total}</span> routine {total === 1 ? 'filing' : 'filings'} hidden
          </p>
          <span className="text-xs font-medium text-ink-3">{open ? 'Close' : 'See why'}</span>
        </div>
        {!open && <p className="mt-1 text-[13px] leading-snug text-ink-3">{preview}{groups.length > 3 ? ' · …' : ''}</p>}
      </button>

      {open && (
        <ul className="border-t border-dashed border-line">
          {groups.map((g) => (
            <li key={g.reason} className="border-b border-dashed border-line last:border-0">
              <button onClick={() => setGroup(group === g.reason ? null : g.reason)}
                      aria-expanded={group === g.reason}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="text-[13px] text-ink-2">{g.reason}</span>
                <span className="tabular text-[13px] font-semibold text-ink">{g.count}</span>
              </button>
              {group === g.reason && (
                <ul className="space-y-2.5 px-4 pb-4">
                  {g.items.map((it) => (
                    <li key={it.id} className="text-[13px] leading-snug">
                      <span className="font-semibold text-ink">{it.symbol}</span>{' '}
                      <span className="text-ink-2">{it.headline}</span>{' '}
                      <span className="tabular whitespace-nowrap text-xs text-ink-3">{when(it.ts, refTime)}</span>{' '}
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noopener noreferrer"
                           className="whitespace-nowrap text-xs text-ink-3 underline underline-offset-4">filing ↗</a>
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
