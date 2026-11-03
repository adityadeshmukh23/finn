import type { Density } from '../density'

const OPTIONS: [Density, string][] = [['compact', 'Compact'], ['detailed', 'Detailed']]

/** How much Today shows. The same control on Today and in How to read this. */
export function DensityControl({ density, onDensity, className = '' }: { density: Density; onDensity: (d: Density) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="How much to show" className={`flex rounded-full bg-raised p-0.5 ${className}`}>
      {OPTIONS.map(([d, label]) => (
        <button key={d} role="radio" aria-checked={density === d} onClick={() => onDensity(d)}
                className={`min-h-11 flex-1 rounded-full font-semibold ${density === d ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
