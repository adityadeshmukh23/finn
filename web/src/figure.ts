import type { Card, Results } from './api'
import type { MoveContext } from './company'
import { CATEGORY_LABEL, dayMonth } from './format'
import { plainHeadline } from './plain'
import { closeTime, fmtPct, fmtX } from './market'

/** The one number a row is about, and the line beside it. Nothing here is computed: it picks fields the card already has. */
export interface RowFigure {
  value: string
  label: string
  sign: 'up' | 'down' | 'none'
  kind: 'results' | 'market'
}

const signOf = (n: number): RowFigure['sign'] => (n > 0 ? 'up' : n < 0 ? 'down' : 'none')

type Extracted = Extract<Results, { status: 'extracted' }>

function shownResults(card: Card): Extracted | null {
  const r = card.results
  return r && r.status === 'extracted' && r.confidence !== 'low' && card.lead.category === 'results' ? r : null
}

export function rowFigure(card: Card): RowFigure | null {
  const r = shownResults(card)
  if (r) {
    const pat = r.rows.pat.yoy_pct
    if (pat !== null) return { value: fmtPct(pat), label: 'PAT YoY', sign: signOf(pat), kind: 'results' }
    const rev = r.rows.revenue.yoy_pct
    if (rev !== null) return { value: fmtPct(rev), label: 'Revenue YoY', sign: signOf(rev), kind: 'results' }
  }
  const m = card.market
  if (!m) return null
  const day = dayMonth(m.date)
  if (m.move_hit && m.chg_pct !== null) {
    return { value: fmtPct(m.chg_pct), label: m.vol_x !== null ? `${day}, ${fmtX(m.vol_x)} volume` : `${day} close`, sign: signOf(m.chg_pct), kind: 'market' }
  }
  if (m.vol_x !== null) return { value: fmtX(m.vol_x), label: `volume, ${day}`, sign: 'none', kind: 'market' }
  return null
}

/** "…, effective 29 Oct 2026" says nothing when the filing itself is dated 29 Oct. */
function withoutSameDay(line: string, ts: string): string {
  const m = line.match(/, effective (\d{1,2} [A-Z][a-z]{2}) \d{4}$/)
  return m && m[1] === dayMonth(ts) ? line.slice(0, m.index) : line
}

/** What was filed between the two closes around a move, from the same list as the company file's chart. */
export function moveLine(c: MoveContext): string {
  const span = c.previous ? `between the ${dayMonth(c.previous)} and ${dayMonth(c.date)} closes` : `up to the ${dayMonth(c.date)} close`
  if (c.filed.length === 0) return `No material filing ${span}`
  const kinds = [...new Set(c.filed.map((r) => CATEGORY_LABEL[r.category] ?? r.category))]
  return `Filed ${span}: ${kinds.join(', ')}`
}

/**
 * The row's sentence. Drops what the figure beside it already says. `short` is the collapsed Compact row.
 * A price row makes no claim about filings without a context: with the timeline unavailable, FINN can't check.
 */
export function rowLine(card: Card, ctx: MoveContext | null = null, short = false): string {
  const { lead, market: m } = card
  if (lead.category === 'market') {
    const price = m && !m.move_hit && m.chg_pct !== null ? `Price ${fmtPct(m.chg_pct)}. ` : ''
    if (!ctx) return `${price}Price or volume alert`
    if (ctx.last) return `${price}Filed ${dayMonth(ctx.last.ts)}: ${withoutSameDay(plainHeadline(ctx.last.headline), ctx.last.ts)}`
    return `${price}${moveLine(ctx)}`
  }
  const r = shownResults(card)
  if (r && short) return resultsLabel(lead.headline.replace(/[,;] .*$/, ''), r)
  if (r && rowFigure(card)?.label === 'PAT YoY') return lead.headline.replace(/, [+−-][\d.]+% YoY/, '')
  return plainHeadline(lead.headline)
}

/** "PAT ₹29,250 cr, Sep 2026 qtr, consolidated". */
function resultsLabel(first: string, r: Extracted): string {
  const parts = [first, r.period ? `${r.period} qtr` : '', r.basis === 'unknown' ? '' : r.basis]
  return parts.filter(Boolean).join(', ')
}

/** True when the close shown on a filing's row came first: the move can't be a response to this filing. */
export const closedBeforeFiling = (card: Card): boolean =>
  !!card.market && card.lead.category !== 'market' && closeTime(card.market.date) < new Date(card.lead.ts).getTime()

/** A figure-less results filing says so in amber, because the page has numbers we would not vouch for. */
export const figuresWithheld = (card: Card) =>
  card.lead.category === 'results' && card.results?.status === 'extracted' && card.results.confidence === 'low'

/** Results with no number we can show: low confidence, no table found, or no read at all. */
export const resultsWithoutFigures = (card: Card) => card.lead.category === 'results' && !shownResults(card)
