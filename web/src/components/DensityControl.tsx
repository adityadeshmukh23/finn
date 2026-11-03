import type { Density } from '../density'
import { Segmented } from './Segmented'

const OPTIONS: [Density, string][] = [['compact', 'Compact'], ['detailed', 'Detailed']]

/** How much Today shows. The same control on Today and in How to read this. */
export function DensityControl({ density, onDensity, className }: { density: Density; onDensity: (d: Density) => void; className?: string }) {
  return <Segmented label="How much to show" options={OPTIONS} value={density} onChange={onDensity} className={className} />
}
