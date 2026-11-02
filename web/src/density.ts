export type Density = 'compact' | 'detailed'

const KEY = 'finn.density'

/** Compact unless the reader chose otherwise. Remembered on this device only. */
export function loadDensity(): Density {
  try {
    return localStorage.getItem(KEY) === 'detailed' ? 'detailed' : 'compact'
  } catch {
    return 'compact'
  }
}

export function saveDensity(d: Density) {
  try { localStorage.setItem(KEY, d) } catch { /* session-only */ }
}
