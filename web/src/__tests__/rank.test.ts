import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyAlerts, DEFAULT_PREFS } from '../alerts'
import type { Card, Digest } from '../api'
import { resultsWithoutFigures, rowFigure } from '../figure'
import type { Market } from '../market'
import { rankCards } from '../rank'

const demo = join(__dirname, '../../public/demo')
const read = <T,>(f: string) => JSON.parse(readFileSync(join(demo, f), 'utf8')) as T

const card = (symbol: string, score: number, results: unknown, category = 'results'): Card => ({
  symbol, company: symbol, sector: '', size: '', score,
  lead: { id: symbol, symbol, category, tier: 'high', reason: 'Quarterly results', headline: '', why: '', url: '', ts: '', nse_category: '', base: 90, score, read: null },
  items: [], routine_count: 0, folded: [], results: results as Card['results'],
})
const low = { status: 'extracted', confidence: 'low', rows: { pat: {}, revenue: {} } }
const high = { status: 'extracted', confidence: 'high', rows: { pat: { yoy_pct: 32.1 }, revenue: { yoy_pct: 28 } } }

describe('rankCards', () => {
  it('a low-confidence results card does not lead, even on the higher score', () => {
    const out = rankCards([card('SUN', 100, low), card('REL', 95, high)])
    expect(out.map((c) => c.symbol)).toEqual(['REL', 'SUN'])
    expect(out[0].why_rank).toContain('the heaviest event with figures to show')
    expect(out[1].why_rank).toContain('no figures to show, so it sits below')
  })
  it('leaves the order alone when the top card has figures', () => {
    expect(rankCards([card('REL', 100, high), card('SUN', 95, low)]).map((c) => c.symbol)).toEqual(['REL', 'SUN'])
  })
  it('stays out of the top 3 while other rows can take the places', () => {
    const out = rankCards([card('SUN', 100, low), card('A', 95, high), card('B', 90, high), card('C', 85, null, 'litigation'), card('D', 80, null, 'litigation')])
    expect(out.map((c) => c.symbol)).toEqual(['A', 'B', 'C', 'SUN', 'D'])
    expect(out[0].why_short).toBe('Fresh quarterly results; the heaviest event with figures to show.')
  })
  it('fills the top 3 with what speaks first when fewer than 3 can', () => {
    expect(rankCards([card('SUN', 100, low), card('MAR', 99, low), card('A', 95, high)]).map((c) => c.symbol)).toEqual(['A', 'SUN', 'MAR'])
  })
  it('re-ranking what is left after a dismiss is stable and keeps the rule', () => {
    const once = rankCards([card('SUN', 100, low), card('REL', 95, high), card('POL', 80, null, 'litigation')])
    const after = rankCards(once.filter((c) => c.symbol !== 'REL'))
    expect(after.map((c) => c.symbol)).toEqual(['POL', 'SUN'])
    expect(after.map((c) => c.score)).toEqual([80, 100])
  })
  it('keeps a figure-less card first if nothing else exists', () => {
    expect(rankCards([card('SUN', 100, low)])[0].symbol).toBe('SUN')
  })
  it('a management change can still lead: it has no number by nature', () => {
    expect(rankCards([card('CEO', 100, null, 'management_change'), card('REL', 95, high)])[0].symbol).toBe('CEO')
  })
})

describe('on the recording, at default alert settings', () => {
  const market = read<Market>('market.json')
  const digests = readdirSync(demo).filter((f) => f.startsWith('digest-'))
  it('the default screen, 30 Oct 24h, leads with Reliance and a real number', () => {
    const top = applyAlerts(read<Digest>('digest-2026-10-30-24.json'), DEFAULT_PREFS, market).cards[0]
    expect(top.symbol).toBe('RELIANCE')
    expect(rowFigure(top)?.value).toBe('+32.1%')
  })
  it('every recorded #1 has an explanation, including after the first row is dismissed', () => {
    for (const f of digests) {
      const { cards } = applyAlerts(read<Digest>(f), DEFAULT_PREFS, market)
      if (cards.length === 0) continue
      expect(cards[0].why_rank, f).toMatch(/^\S.{8,}\.$/)
      if (cards.length > 1) expect(rankCards(cards.slice(1))[0].why_rank, f).toMatch(/^\S.{8,}\.$/)
    }
  })
  it('no recorded top 3 holds results it cannot show while another row could take the place', () => {
    for (const f of digests) {
      const { cards } = applyAlerts(read<Digest>(f), DEFAULT_PREFS, market)
      const speaking = cards.filter((c) => !resultsWithoutFigures(c)).length
      cards.slice(0, Math.min(3, speaking)).forEach((c) => expect(resultsWithoutFigures(c), `${f} ${c.symbol}`).toBe(false))
    }
  })
  it('the default top 3 is Reliance, Equitas, Polycab, with Sun Pharma at #4 and nothing lost', () => {
    const { cards } = applyAlerts(read<Digest>('digest-2026-10-30-24.json'), DEFAULT_PREFS, market)
    expect(cards.slice(0, 4).map((c) => c.symbol)).toEqual(['RELIANCE', 'EQUITASBNK', 'POLYCAB', 'SUNPHARMA'])
    expect(cards).toHaveLength(9)
  })
})
