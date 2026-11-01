import type { ReactNode } from 'react'
import type { Tab } from '../route'
import { Icon, type IconName } from './Icon'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'book', label: 'Book', icon: 'book' },
  { id: 'research', label: 'Research', icon: 'research' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
]

/** `dock` is the one slot above the tabs: the window picker, or an undo. Both sit in the page's reserved bottom space. */
export function TabBar({ tab, onSelect, dock }: { tab: Tab; onSelect: (t: Tab) => void; dock?: ReactNode }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {dock && <div className="mx-auto max-w-xl border-b border-line">{dock}</div>}
      <div className="mx-auto flex h-14 max-w-xl">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onSelect(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                  className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-meta ${tab === t.id ? 'font-semibold text-ink' : 'text-ink-3'}`}>
            <Icon name={t.icon} size={22} />
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
