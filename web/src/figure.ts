import type { Card, Results } from './api'
import type { MoveContext } from './company'
import { CATEGORY_LABEL } from './format'
import { filingLine } from './plain'
import { closeTime } from './market'
import * as fig from './fig'

/** The one number a row is about, and the line beside it. Nothing here is computed: it picks fields the card already has. */
export interface RowFigure {
  value: string
  label: string
  sign: fig.Sign
  kind: 'results' | 'market'
}

type Extracted = Extract<Results, { status: 'extracted' }>

function shownResults(card: Card): Extracted | null {
  const r = card.results
  return r && r.status === 'extracted' && r.confidence !== 'low' && card.lead.category === 'results' ? r : null
}

export function rowFigure(card: Card): RowFigure | null {
  const r = shownResults(card)
  if (r) {
    const pat = r.rows.pat.yoy_pct
    if (pat !== null) return { value: fig.pct(pat), label: 'PAT YoY', sign: fig.pctChange(pat).sign, kind: 'results' }
    const rev = r.rows.revenue.yoy_pct
    if (rev !== null) return { value: fig.pct(rev), label: 'Revenue YoY', sign: fig.pctChange(rev).sign, kind: 'results' }
  }
  const m = card.market
  if (!m) return null
  const day = fig.day(m.date)
  if (m.move_hit && m.chg_pct !== null) {
    return { value: fig.pct(m.chg_pct), label: m.vol_x !== null ? `${day}, ${fig.multiple(m.vol_x)} volume` : `${day} close`, sign: fig.pctChange(m.chg_pct).sign, kind: 'market' }
  }
  if (m.vol_x !== null) return { value: fig.multiple(m.vol_x), label: `volume, ${day}`, sign: 'none', kind: 'market' }
  return null
}

/** "…, effective 29 Oct 2026" says nothing when the filing itself is dated 29 Oct. */
function withoutSameDay(line: string, ts: string): string {
  const m = line.match(/, effective (\d{1,2} [A-Z][a-z]{2}) \d{4}$/)
  return m && m[1] === fig.day(ts) ? line.slice(0, m.index) : line
}

/** What was filed between the two closes around a move, from the same list as the company file's chart. */
export function moveLine(c: MoveContext): string {
  const span = c.previous ? `since the ${fig.day(c.previous)} close` : `up to the ${fig.day(c.date)} close`
  if (c.filed.length === 0) return `Nothing material filed ${span}`
  const kinds = [...new Set(c.filed.map((r) => CATEGORY_LABEL[r.category] ?? r.category))]
  return `${span.charAt(0).toUpperCase()}${span.slice(1)}: ${kinds.join(', ')}`
}

/**
 * The row's sentence. Drops what the figure beside it already says. `short` is the collapsed Compact row.
 * A price row makes no claim about filings without a context: with the timeline unavailable, FINN can't check.
 */
export function rowLine(card: Card, ctx: MoveContext | null = null, short = false): string {
  const { lead, market: m } = card
  if (lead.category === 'market') {
    const price = m && !m.move_hit && m.chg_pct !== null ? `Price ${fig.pct(m.chg_pct)}. ` : ''
    if (!ctx) return `${price}Price or volume alert`
    if (ctx.last) return `${price}Filed ${fig.day(ctx.last.ts)}: ${withoutSameDay(fig.headlineFigureOnly(filingLine(ctx.last)), ctx.last.ts)}`
    return `${price}${moveLine(ctx)}`
  }
  const r = shownResults(card)
  if (r && short) return fig.headlineFigureOnly(lead.headline)
  if (r && rowFigure(card)?.label === 'PAT YoY') return fig.headlineWithoutYoY(lead.headline)
  return filingLine(lead)
}

/** True when the close shown on a filing's row came first: the move can't be a response to this filing. */
export const closedBeforeFiling = (card: Card): boolean =>
  !!card.market && card.lead.category !== 'market' && closeTime(card.market.date) < new Date(card.lead.ts).getTime()

/** A figure-less results filing says so in amber, because the page has numbers we would not vouch for. */
export const figuresWithheld = (card: Card) =>
  card.lead.category === 'results' && card.results?.status === 'extracted' && card.results.confidence === 'low'

/** Results with no number we can show: low confidence, no table found, or no read at all. */
export const resultsWithoutFigures = (card: Card) => card.lead.category === 'results' && !shownResults(card)
