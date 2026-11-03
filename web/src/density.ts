export type Density = 'compact' | 'detailed'

const KEY = 'finn.density'

/** Detailed unless the reader chose Compact. Remembered on this device only. */
export function loadDensity(): Density {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'detailed'
  } catch {
    return 'detailed'
  }
}

export function saveDensity(d: Density) {
  try { localStorage.setItem(KEY, d) } catch { /* session-only */ }
}
