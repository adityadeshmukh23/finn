export type Tab = 'today' | 'book' | 'research' | 'alerts'
export interface Route { tab: Tab; symbol: string | null }

/** Hash routing keeps the static host simple and makes the phone's back gesture work. */
export function parseHash(hash: string): Route {
  const detail = hash.match(/^#research\/([A-Za-z0-9&_-]+)$/)
  if (detail) return { tab: 'research', symbol: decodeURIComponent(detail[1]).toUpperCase() }
  if (hash === '#book') return { tab: 'book', symbol: null }
  if (hash === '#research') return { tab: 'research', symbol: null }
  if (hash === '#alerts') return { tab: 'alerts', symbol: null }
  return { tab: 'today', symbol: null }
}

export const tabHash = (t: Tab) => (t === 'today' ? '#' : `#${t}`)
