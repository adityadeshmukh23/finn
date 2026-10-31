import { ALERT_CATEGORIES, DEFAULT_PREFS, type AlertPrefs } from '../alerts'
import { CATEGORY_LABEL } from '../format'
import { Sheet } from './Sheet'

export function AlertsSheet({ prefs, onChange, onClose }: {
  prefs: AlertPrefs; onChange: (p: AlertPrefs) => void; onClose: () => void
}) {
  const toggle = (cat: string) =>
    onChange({ ...prefs, muted: prefs.muted.includes(cat) ? prefs.muted.filter((c) => c !== cat) : [...prefs.muted, cat] })

  return (
    <Sheet title="Alert settings" onClose={onClose}>
      <p className="text-[13px] font-semibold text-ink">Surface</p>
      <div role="radiogroup" className="mt-2 flex rounded-full bg-raised p-0.5">
        {([['medium', 'High + medium'], ['high', 'High only']] as const).map(([v, label]) => (
          <button key={v} role="radio" aria-checked={prefs.minTier === v} onClick={() => onChange({ ...prefs, minTier: v })}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${prefs.minTier === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
            {label}
          </button>
        ))}
      </div>

      <p className="mt-5 text-[13px] font-semibold text-ink">Categories</p>
      <p className="text-xs text-ink-3">Muted filings move to the hidden list; nothing is deleted.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ALERT_CATEGORIES.map((cat) => {
          const on = !prefs.muted.includes(cat)
          return (
            <button key={cat} aria-pressed={on} onClick={() => toggle(cat)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? 'border-ink bg-ink text-bg' : 'border-line text-ink-3 line-through'}`}>
              {CATEGORY_LABEL[cat] ?? cat}
            </button>
          )
        })}
      </div>

      <p className="mt-5 rounded-xl bg-raised p-3 text-xs leading-snug text-ink-2">
        Volume-multiple and price-move thresholds arrive with push alerts, once FINN tracks prices.
      </p>
      <button onClick={() => onChange(DEFAULT_PREFS)} className="mt-4 text-xs text-ink-3 underline underline-offset-4">
        Reset to defaults
      </button>
    </Sheet>
  )
}
