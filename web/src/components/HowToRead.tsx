import type { Density } from '../density'
import { DensityControl } from './DensityControl'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { TOUR, type TourAction } from '../tour'

const KEY: [React.ReactNode, string][] = [
  [<span aria-hidden="true" className="inline-block h-4 w-1 rounded-full bg-ink align-middle" />, 'The line on the left is rank. The thicker it is, the more it matters today.'],
  [<><span className="text-up">+</span>/<span className="text-down">−</span></>, 'Green and red are only ever the sign of a number.'],
  [<span className="text-flag">Amber</span>, 'Low confidence. FINN shows the page, not a figure it can\'t vouch for.'],
  ['p.12', 'Every figure links to the page it was read from.'],
  ['As of', 'This is a recording. Nothing here updates.'],
  ['30 Oct', 'A date beside a move is the close it happened on. FINN says what was filed and when, never why a stock moved.'],
  ['Filtered', 'Routine filings FINN set aside. They are all listed, with the reason.'],
]

/** What the marks mean, and how much to show. */
export function HowToRead({ density, onDensity, onLedger, onTour, onClose }: {
  density: Density; onDensity: (d: Density) => void; onLedger: () => void; onTour: (a: TourAction) => void; onClose: () => void
}) {
  return (
    <Sheet title="How to read this" onClose={onClose}>
      <section className="mb-4 rounded-2xl bg-raised p-3" aria-label="2-minute tour">
        <h3 className="font-semibold text-ink">2-minute tour</h3>
        <p className="text-meta text-ink-3">Everything here is recorded. Nothing updates.</p>
        <ol className="mt-1 divide-y divide-line">
          {TOUR.map((s) => (
            <li key={s.text}>
              <button onClick={() => onTour(s.action)} className="flex min-h-11 w-full items-center gap-2 py-1.5 text-left text-ink-2">
                <span className="min-w-0 flex-1">{s.text}</span>
                <Icon name="chevron" size={14} className="shrink-0 text-ink-3" />
              </button>
            </li>
          ))}
        </ol>
      </section>
      <DensityControl density={density} onDensity={onDensity} />
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
        How this was built
        <Icon name="chevron" size={14} className="shrink-0 text-ink-3" />
      </button>
    </Sheet>
  )
}
