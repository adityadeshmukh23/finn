/** A two-way choice with its state on show, at least 44 px tall. */
export function Segmented<T extends string>({ label, options, value, onChange, className = '' }: {
  label: string; options: [T, string][]; value: T; onChange: (v: T) => void; className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-full bg-raised p-0.5 ${className}`}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
                className={`min-h-11 flex-1 rounded-full font-semibold ${value === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}
