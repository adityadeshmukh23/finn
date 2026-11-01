import { Icon } from './Icon'

/** Says what window is on screen and opens the picker. Sits in the header, so nothing is docked over the rows. */
export function WindowChip({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label={`Change window and date. Showing ${label}`}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-line px-3 font-medium text-ink-2">
      {label}<Icon name="down" size={14} />
    </button>
  )
}
