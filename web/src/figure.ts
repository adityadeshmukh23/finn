import type { Card, Results } from './api'
import { fmtPct, fmtX } from './market'

/** The one number a row is about, and the line beside it. Nothing here is computed: it picks fields the card already has. */
export interface RowFigure {
  value: string
  label: string
  sign: 'up' | 'down' | 'none'
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
    if (pat !== null) return { value: fmtPct(pat), label: 'PAT YoY', sign: signOf(pat) }
    const rev = r.rows.revenue.yoy_pct
    if (rev !== null) return { value: fmtPct(rev), label: 'Revenue YoY', sign: signOf(rev) }
  }
  const m = card.market
  if (!m) return null
  if (m.move_hit && m.chg_pct !== null) {
    return { value: fmtPct(m.chg_pct), label: m.vol_x !== null ? `on ${fmtX(m.vol_x)} volume` : 'in a day', sign: signOf(m.chg_pct) }
  }
  if (m.vol_x !== null) return { value: fmtX(m.vol_x), label: 'volume', sign: 'none' }
  return null
}

/** The row's sentence. Drops what the figure beside it already says. */
export function rowLine(card: Card): string {
  const { lead, market: m } = card
  if (lead.category === 'market') {
    const price = m && !m.move_hit && m.chg_pct !== null ? `Price ${fmtPct(m.chg_pct)}. ` : ''
    return `${price}No filing in this window`
  }
  if (shownResults(card) && rowFigure(card)?.label === 'PAT YoY') return lead.headline.replace(/, [+−-][\d.]+% YoY/, '')
  return lead.headline
}

/** A figure-less results filing says so in amber, because the page has numbers we would not vouch for. */
export const figuresWithheld = (card: Card) =>
  card.lead.category === 'results' && card.results?.status === 'extracted' && card.results.confidence === 'low'
