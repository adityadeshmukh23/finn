import type { Card } from './api'
import { resultsWithoutFigures } from './figure'
import { dayMonth } from './format'
import { describe } from './market'

/**
 * Card order and the one-line "why it ranks here". Deterministic, from three things the card carries:
 * the lead event's weight (set by the ranker on the server), other material filings from the same
 * company in the window (+3 each for high), recency (up to +5 inside the window), and a crossed
 * price or volume threshold (+6 each, applied in market.ts).
 */

const EVENT: Record<string, string> = {
  'Top management change': 'CEO/CFO/MD-level change',
  'Quarterly results': 'Fresh quarterly results',
  'M&A': 'M&A',
  'Subsidiary IPO / listing': 'Subsidiary listing',
  'Litigation / regulatory order': 'Legal or regulatory order',
  'Promoter pledge': 'Promoter pledge',
  'Credit rating downgrade': 'Rating downgrade',
  'Buyback': 'Buyback',
  'Fund raise': 'Fund raise',
  'Board change': 'Board change',
  'Equity issuance': 'Equity issuance',
  'Order win': 'Order win',
  'Capex / expansion': 'Capex',
  'Unusual price or volume': 'Price or volume alert',
}

const label = (reason: string) => EVENT[reason] ?? (reason || 'A material filing')

export const eventLabel = label

export function scoreCard(c: Card): number {
  const extraHigh = c.items.filter((it) => it.tier === 'high').length
  return Math.round((c.lead.score + 3 * extraHigh) * 10) / 10
}

function alsoLine(c: Card): string {
  const seen = new Set([c.lead.reason])
  const also: string[] = []
  for (const it of c.items) {
    if (it.tier === 'routine' || seen.has(it.reason)) continue
    seen.add(it.reason)
    const l = label(it.reason)
    also.push(/^[A-Z][a-z]/.test(l) ? l[0].toLowerCase() + l.slice(1) : l)   // keep "M&A", lower "Board change"
  }
  if (also.length === 0) return ''
  return `, plus ${also.slice(0, 2).join(' and ')}${also.length > 2 ? ` and ${also.length - 2} more` : ''}`
}

export const TOP_ROWS = 3

/**
 * Sort cards and attach `why_rank` and the shorter `why_short`. Cards must already have their final items (after mutes).
 * The top rows are what a first-time reader sees, so results we can't show a number for stay out of them
 * while another row can take the place. Scores don't change; only the order does.
 */
export function rankCards(cards: Card[]): Card[] {
  const sorted = cards.map((c) => ({ ...c, score: scoreCard(c) })).sort((a, b) => b.score - a.score)
  const head = sorted.filter((c) => !resultsWithoutFigures(c)).slice(0, TOP_ROWS)
  const scored = [...head, ...sorted.filter((c) => !head.includes(c))]
  const lowest = head[head.length - 1]
  const passed = (c: Card) => !!lowest && resultsWithoutFigures(c) && c.score > lowest.score
  const anyPassed = sorted.some(passed)
  return scored.map((c, i) => {
    let tail = ''
    if (head.length > 0 && passed(c)) {
      tail = '; no figures to show, so it sits below rows that have them'
    } else if (i === 0 && anyPassed) {
      tail = '; the heaviest event with figures to show'
    } else if (i > 0) {
      const prev = scored[i - 1]
      const heavier = scored.slice(0, i).filter((x) => x.lead.base > c.lead.base).length
      if (prev.lead.base === c.lead.base) {
        const pe = prev.items.filter((it) => it.tier === 'high').length
        const ce = c.items.filter((it) => it.tier === 'high').length
        tail = c.lead.category === 'market' ? `; a smaller move than #${i}`
          : ce < pe ? `; fewer other high-priority filings than #${i}` : `; filed before #${i}`
      } else if (prev.lead.base < c.lead.base) {
        tail = prev.market ? `; #${i}'s price/volume move lifts it above` : `; older than #${i}, which outscores it on recency`
      } else if (heavier > 0) {
        tail = `; below ${heavier} higher-weight ${heavier === 1 ? 'event' : 'events'}`
      }
    } else if (scored.length > 1) {
      tail = '; the heaviest event in this window'
    }
    const moved = c.market && c.lead.category !== 'market' ? `; stock ${describe(c.market)}, ${dayMonth(c.market.date)} close` : ''
    return { ...c, why_rank: `${label(c.lead.reason)}${alsoLine(c)}${moved}${tail}.`, why_short: `${label(c.lead.reason)}${tail}.` }
  })
}
