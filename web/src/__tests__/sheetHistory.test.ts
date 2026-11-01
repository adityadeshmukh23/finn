import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSheetHistory } from '../sheetHistory'

/** A small browser history: entries, and a popstate on back. */
function fakeWin(start = '#') {
  const entries = [start]
  const listeners = new Set<() => void>()
  return {
    entries,
    history: {
      pushState: () => { entries.push(entries[entries.length - 1]) },
      replaceState: (_: unknown, __: string, url?: string | URL | null) => { entries[entries.length - 1] = String(url) },
      back: () => { entries.pop(); listeners.forEach((l) => l()) },
    },
    addEventListener: (_: 'popstate', fn: () => void) => { listeners.add(fn) },
    removeEventListener: (_: 'popstate', fn: () => void) => { listeners.delete(fn) },
  }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('sheet history', () => {
  it('back closes only the sheet: same tab, and FINN is still there', () => {
    const win = fakeWin('#book'), onBack = vi.fn()
    const sh = createSheetHistory(win)
    const release = sh.open(onBack)
    expect(win.entries).toEqual(['#book', '#book'])
    win.history.back()
    expect(onBack).toHaveBeenCalledOnce()
    expect(win.entries).toEqual(['#book'])
    release()                                      // the unmount that follows must not go back again
    vi.runAllTimers()
    expect(win.entries).toEqual(['#book'])
  })

  it('closing with X, Esc or a drag pops the entry, with no second close', () => {
    const win = fakeWin('#'), onBack = vi.fn()
    createSheetHistory(win).open(onBack)()
    vi.runAllTimers()
    expect(win.entries).toEqual(['#'])
    expect(onBack).not.toHaveBeenCalled()
  })

  it('stacked sheets close top first', () => {
    const win = fakeWin('#'), a = vi.fn(), b = vi.fn()
    const sh = createSheetHistory(win)
    sh.open(a); sh.open(b)
    win.history.back()
    expect(b).toHaveBeenCalledOnce()
    expect(a).not.toHaveBeenCalled()
  })

  it('leaving for research replaces the sheet entry, so back returns to the screen under it', () => {
    const win = fakeWin('#book'), onBack = vi.fn()
    const sh = createSheetHistory(win)
    const release = sh.open(onBack)
    sh.leaveTo('#research/BEL')
    release()
    vi.runAllTimers()
    expect(win.entries).toEqual(['#book', '#research/BEL'])
    win.history.back()
    expect(onBack).not.toHaveBeenCalled()
    expect(win.entries).toEqual(['#book'])
  })

  it('survives StrictMode remount without losing or doubling the entry', () => {
    const win = fakeWin('#')
    const sh = createSheetHistory(win)
    const onBack = vi.fn()
    sh.open(onBack)()
    sh.open(onBack)
    vi.runAllTimers()
    expect(win.entries).toEqual(['#', '#'])
    win.history.back()
    expect(onBack).toHaveBeenCalledOnce()
  })
})
