import type { Density } from '../density'
import { usd } from '../format'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

const KEY: [React.ReactNode, string][] = [
  [<span aria-hidden="true" className="inline-block h-4 w-1 rounded-full bg-ink align-middle" />, 'The line on the left is rank. The thicker it is, the more it matters today.'],
  [<><span className="text-up">+</span>/<span className="text-down">−</span></>, 'Green and red are only ever the sign of a number.'],
  [<span className="text-flag">Amber</span>, 'Low confidence. FINN shows the page, not a figure it can\'t vouch for.'],
  ['p.12', 'Every figure links to the page it was read from.'],
  ['As of', 'This is a recording. Nothing here updates.'],
  ['Filtered', 'Routine filings FINN set aside. They are all listed, with the reason.'],
]

/** What the marks mean, and how much to show. Also where a power user turns the full density back on. */
export function HowToRead({ density, onDensity, spent, onLedger, onClose }: {
  density: Density; onDensity: (d: Density) => void; spent: number | null; onLedger: () => void; onClose: () => void
}) {
  return (
    <Sheet title="How to read this" onClose={onClose}>
      <div role="radiogroup" aria-label="How much to show" className="flex rounded-full bg-raised p-0.5">
        {(['compact', 'detailed'] as const).map((d) => (
          <button key={d} role="radio" aria-checked={density === d} onClick={() => onDensity(d)}
                  className={`min-h-11 flex-1 rounded-full font-semibold capitalize ${density === d ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
            {d}
          </button>
        ))}
      </div>
      <p className="mt-2 text-meta text-ink-3">
        {density === 'compact' ? 'The top 3, one number each. Tap a row for the rest.' : 'Everything open: top rows, tables, synthesis and the book strip.'}
      </p>
      <dl className="mt-3 grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-2">
        {KEY.map(([mark, text]) => (
          <div key={text} className="contents">
            <dt className="font-semibold text-ink">{mark}</dt>
            <dd className="text-ink-2">{text}</dd>
          </div>
        ))}
      </dl>
      <button onClick={onLedger} className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 text-left text-ink-2">
        {spent === null ? 'How FINN routes model calls' : `${usd(spent)} in model spend. See how`}
        <Icon name="chevron" size={14} className="shrink-0 text-ink-3" />
      </button>
    </Sheet>
  )
}
