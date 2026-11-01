import type { ReactNode } from 'react'
import { ALERT_CATEGORIES, DEFAULT_PREFS, type AlertPrefs } from '../alerts'
import type { Card } from '../api'
import { CATEGORY_LABEL, dayMonth } from '../format'
import { describe } from '../market'
import { Icon } from './Icon'

function Stepper({ label, value, step, min, max, unit, prefix = '', onChange }: {
  label: string; value: number; step: number; min: number; max: number; unit: string; prefix?: string
  onChange: (v: number) => void
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 10) / 10)))
  const btn = 'h-11 w-11 rounded-full border border-line font-semibold text-ink disabled:opacity-30'
  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <span className="text-ink-2">{label}</span>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={() => set(value - step)} disabled={value <= min} aria-label={`Lower ${label}`}>−</button>
        <span className="w-12 text-center font-semibold text-ink" aria-live="polite">{prefix}{value}{unit}</span>
        <button className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label={`Raise ${label}`}>+</button>
      </div>
    </div>
  )
}

export function Alerts({ chip, prefs, onChange, cards, onOpen }: {
  chip: ReactNode
  prefs: AlertPrefs; onChange: (p: AlertPrefs) => void; cards: Card[]; onOpen: (sym: string) => void
}) {
  const fired = cards.filter((c) => c.market)
  const toggle = (cat: string) =>
    onChange({ ...prefs, muted: prefs.muted.includes(cat) ? prefs.muted.filter((c) => c !== cat) : [...prefs.muted, cat] })

  return (
    <main>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-title font-semibold text-ink">Alerts</h1>
        {chip}
      </header>
      <p className="text-meta text-ink-3">Checked against end-of-day prices when you open FINN. Nothing is sent to your phone.</p>

      <p className="mt-5 font-semibold text-ink">{fired.length === 0 ? 'None fired in this briefing' : `${fired.length} fired in this briefing`}</p>
      {fired.length > 0 && (
        <ul className="mt-1 divide-y divide-line border-y border-line">
          {fired.map((c) => (
            <li key={c.symbol}>
              <button onClick={() => onOpen(c.symbol)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left">
              <span className="shrink-0">
                <span className="block font-semibold text-ink">{c.symbol}</span>
                <span className="block text-meta text-ink-3">{dayMonth(c.market!.date)} close</span>
              </span>
              <span className="flex items-center gap-2 text-right text-ink-2">{describe(c.market!)}<Icon name="chevron" className="text-ink-3" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 font-semibold text-ink">Surface</p>
      <div role="radiogroup" className="mt-2 flex rounded-full bg-raised p-0.5">
        {([['medium', 'High + medium'], ['high', 'High only']] as const).map(([v, label]) => (
          <button key={v} role="radio" aria-checked={prefs.minTier === v} onClick={() => onChange({ ...prefs, minTier: v })}
                  className={`min-h-11 flex-1 rounded-full px-3 font-semibold ${prefs.minTier === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
            {label}
          </button>
        ))}
      </div>

      <p className="mt-5 font-semibold text-ink">Categories</p>
      <p className="text-meta text-ink-3">Muted filings move to the hidden list; nothing is deleted.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ALERT_CATEGORIES.map((cat) => {
          const on = !prefs.muted.includes(cat)
          return (
            <button key={cat} aria-pressed={on} onClick={() => toggle(cat)}
                    className={`flex min-h-11 items-center gap-1 rounded-full border px-3 font-medium ${on ? 'border-ink text-ink' : 'border-line text-ink-3 line-through'}`}>
              {on && <Icon name="check" size={14} />}{CATEGORY_LABEL[cat] ?? cat}
            </button>
          )
        })}
      </div>

      <p className="mt-5 font-semibold text-ink">Price and volume</p>
      <p className="text-meta text-ink-3">A holding with no filing still gets a card when it crosses one of these.</p>
      <Stepper label="Volume vs 20-day average" value={prefs.volX} step={0.5} min={1.5} max={10} unit="×"
               onChange={(volX) => onChange({ ...prefs, volX })} />
      <Stepper label="Price move in a day" value={prefs.movePct} step={1} min={1} max={20} unit="%" prefix="±"
               onChange={(movePct) => onChange({ ...prefs, movePct })} />
      <button onClick={() => onChange(DEFAULT_PREFS)} className="mt-3 min-h-11 text-ink-3 underline underline-offset-4">
        Reset to defaults
      </button>
    </main>
  )
}
