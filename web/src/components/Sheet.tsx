import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
const DRAG_CLOSE_PX = 90

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const [dy, setDy] = useState(0)
  // A parent's re-render passes a new onClose; that must not steal focus or re-lock the page.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key !== 'Tab' || !panel.current) return
      const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (els.length === 0) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [])

  // Drag from the handle area only, so the sheet's own content still scrolls.
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => { if (drag.current !== null) setDy(Math.max(0, e.clientY - drag.current)) }
  const onUp = () => {
    if (drag.current === null) return
    drag.current = null
    if (dy > DRAG_CLOSE_PX) onClose()
    else setDy(0)
  }

  return (
    <div className="sheet-backdrop fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}
           style={dy ? { transform: `translateY(${dy}px)` } : undefined}
           className={`sheet-panel flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface outline-none sm:rounded-3xl ${drag.current === null ? 'transition-transform duration-150' : ''}`}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: 'none' }}
             className="shrink-0 cursor-grab px-5 pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-ink-3 sm:hidden" aria-hidden="true" />
          <div className="mt-1 flex min-h-11 items-center justify-between gap-3">
            <h2 className="text-title font-semibold text-ink">{title}</h2>
            <button onClick={onClose} className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:text-ink" aria-label="Close">
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {children}
        </div>
      </div>
    </div>
  )
}
