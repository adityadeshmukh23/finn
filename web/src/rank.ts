import type { Card } from './api'
import { resultsWithoutFigures, rowFigure } from './figure'
import { dayMonth } from './format'
import { describe, MOVE_BASE, moveAlone } from './market'
import { shortRole } from './plain'

/**
 * Card order and the line that explains it. Deterministic, from what the card carries: the lead event's weight, set
 * on the server, less a step for a top change below CEO, MD or chair; recency; company size; other kinds of major
 * filing; and how far a move went past the investor's lines. A filing can't pull a row below its move alone.
 */

const EVENT: Record<string, string> = {
  'Top management change': 'Top management change',
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

const SIZE: Record<string, number> = { large: 6, mid: 3 }
const BELOW_THE_TOP = 7      // a CFO or other top change, against a CEO, MD or chair
const MOVE_ON_A_FILING = 10  // a move adds less to a row that already has an event
const TOP_ROLE = /(?<!Deputy |Vice )\b(CEO|MD|Managing Director|Chief Executive|Chairman|Chairperson)\b/i

const topChanges = (c: Card) => [c.lead, ...c.items].filter((it) => it.reason === 'Top management change')
export const namesTopRole = (c: Card) =>
  [...topChanges(c).map((it) => it.headline), ...(c.people ?? []).map((p) => p.role)].some((t) => TOP_ROLE.test(t))
export const otherMajor = (c: Card) =>
  new Set(c.items.filter((it) => it.tier === 'high' && it.reason !== c.lead.reason).map((it) => it.reason)).size

export interface ScoreParts { event: number; recency: number; size: number; others: number; move: number; total: number }

/** What a row's score is made of. A row whose move alone beats its filing is scored as that move. */
export function scoreParts(c: Card): ScoreParts {
  const strength = c.market?.strength ?? 0
  const alone = { event: MOVE_BASE, recency: 0, size: 0, others: 0, move: moveAlone(strength) }
  const sum = (p: Omit<ScoreParts, 'total'>) => ({ ...p, total: Math.round((p.event + p.recency + p.size + p.others + p.move) * 10) / 10 })
  if (c.lead.category === 'market') return sum(alone)
  const cut = c.lead.reason === 'Top management change' && !namesTopRole(c) ? BELOW_THE_TOP : 0
  const filing = sum({
    event: c.lead.base - cut, recency: c.lead.score - c.lead.base, size: SIZE[c.size] ?? 0,
    others: 3 * otherMajor(c), move: Math.min(MOVE_ON_A_FILING, 2 * strength),
  })
  const floor = sum(alone)
  return c.market && floor.total > filing.total ? floor : filing
}

export const scoreCard = (c: Card): number => scoreParts(c).total

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
 * Sort cards and attach `why_rank` and `why_short`, for a collapsed #1: the event or, with no number on the row, who changed. Cards must already have their final items (after mutes).
 * The top rows are what a first-time reader sees, so results we can't show a number for stay out of them
 * while another row can take the place. Scores don't change; only the order does.
 */
export function rankCards(cards: Card[]): Card[] {
  // On a tie, the bigger move goes first.
  const sorted = cards.map((c) => ({ ...c, score: scoreCard(c) })).sort((a, b) => b.score - a.score || scoreParts(b).move - scoreParts(a).move)
  const head = sorted.filter((c) => !resultsWithoutFigures(c)).slice(0, TOP_ROWS)
  const scored = [...head, ...sorted.filter((c) => !head.includes(c))]
  const lowest = head[head.length - 1]
  const passed = (c: Card) => !!lowest && resultsWithoutFigures(c) && c.score > lowest.score
  return scored.map((c, i) => {
    let tail = ''
    if (head.length > 0 && passed(c)) tail = '; no figures to show, so rows with figures come first'
    else if (i > 0) tail = belowTail(c, scored[i - 1], i)
    else if (sorted[0].score > c.score) tail = rowFigure(c) ? '; the biggest event with figures to show' : '; the biggest event FINN can show in full'
    else if (scored.length > 1) tail = '; the biggest event in this window'
    const moved = c.market && c.lead.category !== 'market' ? `; stock ${describe(c.market)}, ${dayMonth(c.market.date)} close` : ''
    const event = `${label(c.lead.reason)}.`
    return {
      ...c,
      why_rank: `${label(c.lead.reason)}${alsoLine(c)}${moved}${tail}.`,
      why_short: i === 0 && !rowFigure(c) ? peopleLine(c) || event : event,
    }
  })
}

/** Says the one thing that most separates this row from the row above it. No difference, no claim. */
function belowTail(c: Card, prev: Card, i: number): string {
  const a = scoreParts(prev), b = scoreParts(c)
  const gaps = (['event', 'size', 'others', 'move'] as const).map((k) => [k, a[k] - b[k]] as const)
  const [part, gap] = gaps.reduce((x, y) => (y[1] > x[1] ? y : x))
  if (gap <= 0) return a.recency > b.recency ? `; filed before #${i}` : ''
  if (part === 'size') return `; #${i} is a larger company`
  if (part === 'others') return `; #${i} also has other major filings`
  if (part === 'move') return c.lead.category === 'market' && prev.lead.category === 'market' ? `; a smaller move than #${i}` : `; #${i} had a bigger price or volume move`
  const bothTop = c.lead.reason === 'Top management change' && prev.lead.reason === 'Top management change'
  return bothTop ? `; #${i} is a more senior change` : `; #${i} is a bigger kind of event`
}

const CHANGE_WORDS: Record<string, string> = {
  appointed: 'appointed as', resigned: 'resigned as', ceased: 'is no longer', retiring: 'retiring as',
  're-designated': 're-designated as', 're-appointed': 're-appointed as',
}

/** Who changed, from the filing's own disclosure: "Sashidhar Jagdishan is no longer MD & CEO. Anup Bagchi appointed as MD & CEO." */
export function peopleLine(c: Card): string {
  if (c.lead.category !== 'management_change') return ''
  const people = c.people ?? []
  const top = people.filter((p) => TOP_ROLE.test(p.role))
  return (top.length ? top : people).slice(0, 2)
    .map((p) => `${p.person} ${CHANGE_WORDS[p.change] ?? p.change} ${shortRole(p.role)}.`).join(' ')
}
