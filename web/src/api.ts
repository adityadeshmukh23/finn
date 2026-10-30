export type Tier = 'high' | 'medium' | 'routine'

export interface Item {
  id: string
  symbol: string
  category: string
  tier: Tier
  reason: string
  headline: string
  why: string
  url: string
  ts: string
  nse_category: string
  score: number
}

export interface Card {
  symbol: string
  company: string
  sector: string
  size: string
  score: number
  lead: Item
  items: Item[]
  routine_count: number
}

export interface HiddenGroup {
  reason: string
  count: number
  items: Item[]
}

export interface SourceStatus {
  source: 'live' | 'cache' | 'snapshot' | 'unavailable' | 'bundled'
  as_of: string | null
  message: string
  covered: string[]
}

export interface Digest {
  window: { start: string; end: string; hours: number }
  counts: { total: number; shown: number; hidden: number; duplicates_dropped: number }
  cards: Card[]
  hidden: HiddenGroup[]
  quiet: string[]
  source: SourceStatus
  is_live_now: boolean
}

export interface Ledger {
  spent_usd: number
  budget_usd: number
  today: { live_calls: number; usd: number }
  by_source: Record<string, { calls: number; usd: number }>
  by_purpose: { purpose: string; model: string; calls: number; input_tokens: number; output_tokens: number; usd: number }[]
  mode: 'live' | 'mock'
  public_demo: boolean
}

const API = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

async function getJSON<T>(path: string, timeoutMs = 25000): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(`${API}${path}`, { signal: ctl.signal })
    if (!r.ok) {
      const body = await r.json().catch(() => null)
      throw new Error(body?.detail ?? `Server returned ${r.status}`)
    }
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export async function fetchDigest(hours: number, asOf: string | null, refresh = false): Promise<Digest> {
  const q = new URLSearchParams({ hours: String(hours) })
  if (asOf) q.set('as_of', asOf)
  if (refresh) q.set('refresh', 'true')
  try {
    return await getJSON<Digest>(`/api/digest?${q}`)
  } catch (err) {
    // Backend asleep or unreachable: fall back to the briefing bundled at build time.
    if (asOf) throw err
    const r = await fetch(`/snapshot/digest-${hours}.json`)
    if (!r.ok) throw err
    const d = (await r.json()) as Digest
    d.source = {
      ...d.source,
      source: 'bundled',
      message: `Server unreachable (${(err as Error).message}). Showing the briefing bundled with the app.`,
    }
    return d
  }
}

export const fetchLedger = () => getJSON<Ledger>('/api/ledger', 10000)
