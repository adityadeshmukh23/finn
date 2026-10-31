import type { Market, Signal } from './market'

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
  base: number             // event weight before recency
  score: number
  read: { page: number; quote: string } | null   // headline came from the filing, verified quote
}

export interface ResultRow { current: number | null; previous: number | null; year_ago: number | null; qoq_pct: number | null; yoy_pct: number | null }

export type Results =
  | { status: 'no_table' | 'unavailable' | 'skipped'; note: string }
  | {
      status: 'extracted'
      basis: 'consolidated' | 'standalone' | 'unknown'
      quarter: string
      page: number
      unit: string
      revenue_label: string
      lender: boolean
      rows: { revenue: ResultRow; ebitda: ResultRow | null; pbt: ResultRow; pat: ResultRow }
      margins: { ebitda: number | null; pat: number | null }
      confidence: 'high' | 'medium' | 'low'
      confidence_note: string
      url: string
    }

export interface Person {
  person: string
  role: string
  change: 'appointed' | 'resigned' | 'ceased' | 'retiring' | 're-designated' | 're-appointed'
  effective: string        // as printed in the filing; '' if not stated or not verified
  reason: string           // exits only, backed by a quote found in the filing
  profile: string          // the filing's own brief profile, quote-checked
  page: number
  url: string
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
  folded: Item[]           // routine results satellites (newspaper ads) riding on this card
  results?: Results | null // quarterly table read from the results filing, figures verified on the page
  people?: Person[]        // management changes read from the filings, verified against their text
  why_rank?: string        // set in the browser: why this card sits at this rank
  market?: Signal          // set in the browser: a price/volume threshold crossed in this window
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
  names: Record<string, string>
  source: SourceStatus
  is_live_now: boolean
}

export interface Ledger {
  spent_usd: number
  budget_usd: number
  today: { live_calls: number; usd: number }
  by_source: Record<string, { calls: number; usd: number }>
  by_purpose: { purpose: string; model: string; calls: number; input_tokens: number; output_tokens: number; usd: number }[]
  slots: { slot: string; provider: string; model: string; live: boolean; free: boolean; calls_today: number; rpd: number; rpm: number }[]
  mode: 'live' | 'mock'
  public_demo: boolean
}

const API = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
// No API configured in a production build (the public Vercel demo): replay pre-generated data.
export const STATIC = import.meta.env.VITE_STATIC === '1' || (import.meta.env.PROD && !API)

export interface Manifest {
  fetched_at: string
  from: string
  to: string
  days: string[]
  windows: number[]
  holdings: number
}

let manifest: Promise<Manifest> | null = null
export function fetchManifest(): Promise<Manifest> {
  manifest ??= fetch('/demo/manifest.json').then((r) => {
    if (!r.ok) throw new Error('Demo data missing from this build')
    return r.json() as Promise<Manifest>
  }).catch((e) => { manifest = null; throw e })
  return manifest
}

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

/** A pre-generated briefing. `asOf` null means the latest recorded day. */
export async function fetchBundled(hours: number, asOf: string | null): Promise<Digest> {
  const m = await fetchManifest()
  const day = asOf ?? m.to
  if (!m.days.includes(day)) {
    throw new Error(`No recorded filings for that date. The demo covers ${m.from} to ${m.to}.`)
  }
  const r = await fetch(`/demo/digest-${day}-${hours}.json`)
  if (!r.ok) throw new Error(`Demo data missing for ${day}`)
  return (await r.json()) as Digest
}

export async function fetchDigest(hours: number, asOf: string | null, refresh = false): Promise<Digest> {
  if (STATIC) return fetchBundled(hours, asOf)
  const q = new URLSearchParams({ hours: String(hours) })
  if (asOf) q.set('as_of', asOf)
  if (refresh) q.set('refresh', 'true')
  try {
    return await getJSON<Digest>(`/api/digest?${q}`)
  } catch (err) {
    // API down or unreachable: fall back to the recorded briefing for the latest day.
    if (asOf) throw err
    const d = await fetchBundled(hours, null).catch(() => { throw err })
    d.source = {
      ...d.source,
      message: `Server unreachable (${(err as Error).message}). Showing recorded filings.`,
    }
    return d
  }
}

let bundledMarket: Promise<Market> | null = null
function fetchBundledMarket(): Promise<Market> {
  bundledMarket ??= fetch('/demo/market.json').then((r) => {
    if (!r.ok) throw new Error('No price data in this build')
    return r.json() as Promise<Market>
  }).catch((e) => { bundledMarket = null; throw e })
  return bundledMarket
}

/** End-of-day signals. Never throws: no prices means no price alerts, and the badge says so. */
export async function fetchMarket(asOf: string | null): Promise<Market | null> {
  if (STATIC) return fetchBundledMarket().catch(() => null)
  try {
    return await getJSON<Market>(`/api/market${asOf ? `?as_of=${asOf}` : ''}`, 30000)
  } catch {
    return fetchBundledMarket().then((m) => ({ ...m, message: 'Price server unreachable. Showing recorded prices.' }))
      .catch(() => null)
  }
}

export const fetchLedger = () => getJSON<Ledger>('/api/ledger', 10000)
