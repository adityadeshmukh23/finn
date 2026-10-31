import { ALERT_CATEGORIES, DEFAULT_PREFS, type AlertPrefs } from '../alerts'
import { CATEGORY_LABEL } from '../format'
import { Sheet } from './Sheet'

function Stepper({ label, value, step, min, max, unit, prefix = '', onChange }: {
  label: string; value: number; step: number; min: number; max: number; unit: string; prefix?: string
  onChange: (v: number) => void
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 10) / 10)))
  const btn = 'h-8 w-8 rounded-full border border-line text-sm font-semibold text-ink disabled:opacity-30'
  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <span className="text-xs text-ink-2">{label}</span>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={() => set(value - step)} disabled={value <= min} aria-label={`Lower ${label}`}>−</button>
        <span className="tabular w-12 text-center text-sm font-semibold text-ink" aria-live="polite">{prefix}{value}{unit}</span>
        <button className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label={`Raise ${label}`}>+</button>
      </div>
    </div>
  )
}

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

      <p className="mt-5 text-[13px] font-semibold text-ink">Price and volume (end of day)</p>
      <p className="text-xs text-ink-3">A holding with no filing still gets a card when it crosses one of these.</p>
      <Stepper label="Volume vs 20-day average" value={prefs.volX} step={0.5} min={1.5} max={10} unit="×"
               onChange={(volX) => onChange({ ...prefs, volX })} />
      <Stepper label="Price move in a day" value={prefs.movePct} step={1} min={1} max={20} unit="%" prefix="±"
               onChange={(movePct) => onChange({ ...prefs, movePct })} />
      <button onClick={() => onChange(DEFAULT_PREFS)} className="mt-4 text-xs text-ink-3 underline underline-offset-4">
        Reset to defaults
      </button>
    </Sheet>
  )
}
