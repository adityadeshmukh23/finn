import type { Card } from './api'

/**
 * Card order and the one-line "why it ranks here". Deterministic, from three things the card carries:
 * the lead event's weight (set by the ranker on the server), other material filings from the same
 * company in the window (+3 each for high), and recency (up to +5 inside the window).
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
}

const label = (reason: string) => EVENT[reason] ?? reason

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

/** Sort cards and attach `why_rank`. Cards must already have their final items (after mutes). */
export function rankCards(cards: Card[]): Card[] {
  const scored = cards.map((c) => ({ ...c, score: scoreCard(c) })).sort((a, b) => b.score - a.score)
  return scored.map((c, i) => {
    let tail = ''
    if (i > 0) {
      const prev = scored[i - 1]
      const heavier = scored.slice(0, i).filter((x) => x.lead.base > c.lead.base).length
      if (prev.lead.base === c.lead.base) {
        const pe = prev.items.filter((it) => it.tier === 'high').length
        const ce = c.items.filter((it) => it.tier === 'high').length
        tail = ce < pe ? `; fewer other high-priority filings than #${i}` : `; filed before #${i}`
      } else if (prev.lead.base < c.lead.base) {
        tail = `; older than #${i}, which outscores it on recency`
      } else if (heavier > 0) {
        tail = `; below ${heavier} higher-weight ${heavier === 1 ? 'event' : 'events'}`
      }
    } else if (scored.length > 1) {
      tail = '; the heaviest event in this window'
    }
    return { ...c, why_rank: `${label(c.lead.reason)}${alsoLine(c)}${tail}.` }
  })
}
