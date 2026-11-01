/**
 * Every open sheet owns one history entry, so the phone's back gesture closes the sheet and nothing else.
 * Open pushes an entry; back pops it and closes; closing any other way pops it too. Sheets stack, top first.
 */
interface Win {
  history: Pick<History, 'pushState' | 'replaceState' | 'back'>
  addEventListener: (type: 'popstate', fn: () => void) => void
  removeEventListener: (type: 'popstate', fn: () => void) => void
  dispatchEvent?: (e: Event) => boolean
}

export function createSheetHistory(win: Win) {
  const stack: (() => void)[] = []
  let pendingBack: ReturnType<typeof setTimeout> | null = null

  const onPop = () => {
    const top = stack.pop()
    if (top) top()
    if (stack.length === 0) win.removeEventListener('popstate', onPop)
  }

  return {
    /** Call on open. The returned function is called on close, however the close happened. */
    open(onBack: () => void): () => void {
      // React's StrictMode unmounts and remounts at once: reuse the entry instead of popping and pushing.
      if (pendingBack !== null) { clearTimeout(pendingBack); pendingBack = null }
      else win.history.pushState({ finnSheet: true }, '')
      if (stack.length === 0) win.addEventListener('popstate', onPop)
      stack.push(onBack)
      return () => {
        const i = stack.indexOf(onBack)
        if (i === -1) return                    // back already popped this entry
        stack.splice(i, 1)
        if (stack.length === 0) win.removeEventListener('popstate', onPop)
        pendingBack = setTimeout(() => { pendingBack = null; win.history.back() }, 0)
      }
    },
    /** Leave a sheet for a new route: the sheet's entry becomes that route, so back returns to the screen under it. */
    leaveTo(hash: string) {
      if (pendingBack !== null) { clearTimeout(pendingBack); pendingBack = null }
      stack.length = 0
      win.removeEventListener('popstate', onPop)
      win.history.replaceState(null, '', hash)
    },
  }
}

export const sheetHistory = typeof window === 'undefined'
  ? createSheetHistory({ history: { pushState() {}, replaceState() {}, back() {} }, addEventListener() {}, removeEventListener() {} })
  : createSheetHistory(window)
