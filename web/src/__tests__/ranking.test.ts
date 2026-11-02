import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyAlerts, DEFAULT_PREFS } from '../alerts'
import type { Card, Digest } from '../api'
import { dayMonth } from '../format'
import { resultsWithoutFigures, rowFigure, rowLine } from '../figure'
import { describe as describeMove, type Market } from '../market'
import { eventLabel, otherMajor, namesTopRole, rankCards, scoreCard, scoreParts } from '../rank'

const demo = join(__dirname, '../../public/demo')
const read = <T,>(f: string) => JSON.parse(readFileSync(join(demo, f), 'utf8')) as T
const market = read<Market>('market.json')
const files = readdirSync(demo).filter((f) => f.startsWith('digest-'))
const tight = { ...DEFAULT_PREFS, volX: 1.5, movePct: 1 }
const order = (f: string) => applyAlerts(read<Digest>(f), DEFAULT_PREFS, market).cards.map((c) => c.symbol)

const lead = (over: Partial<Card['lead']>): Card['lead'] => ({ id: 'x', symbol: 'X', category: 'management_change', tier: 'high', reason: 'Top management change', headline: '', why: '', url: '', ts: '2026-10-30T12:00:00+05:30', nse_category: '', base: 95, score: 95, read: null, ...over })
const row = (symbol: string, size: string, l: Partial<Card['lead']> = {}, over: Partial<Card> = {}): Card =>
  ({ symbol, company: symbol, sector: '', size, score: 0, lead: { ...lead(l), id: symbol, symbol }, items: [], routine_count: 0, folded: [], ...over })
const sig = (strength: number, chg = -5): Card['market'] => ({ date: '2026-10-30', close: 1, chg_pct: chg, vol_x: 3, vol_hit: true, move_hit: true, strength })

describe('the rules', () => {
  it('a CEO change outranks a CFO change, and size counts among filings', () => {
    const ceo = row('CEO', 'large', { headline: 'Change in Managing Director' }), cfo = row('CFO', 'small', { headline: 'Appointment of a Chief Financial Officer' })
    expect(scoreCard(ceo) - scoreCard(cfo)).toBe(7 + 6)
    expect(namesTopRole(cfo)).toBe(false)
  })
  it('a deputy or vice chair is not the MD or the chair', () => {
    expect(namesTopRole(row('A', '', { headline: 'Deputy Managing Director retires' }))).toBe(false)
    expect(namesTopRole(row('A', '', { headline: 'Executive Vice Chairman appointed' }))).toBe(false)
    expect(namesTopRole(row('A', '', { headline: 'Change in Managing Director' }))).toBe(true)
  })
  it('a tie goes to the bigger move', () => {
    const filing = row('F', '', { base: 90, score: 90, reason: 'M&A', category: 'M&A' })
    expect(rankCards([filing, row('M', '', { category: 'market', base: 65, score: 90 }, { market: sig(50) })]).map((c) => c.symbol)).toEqual(['M', 'F'])
  })
  it('one event filed twice counts once; a different kind of event counts', () => {
    const twin = { ...lead({ id: 'b' }) }, other = { ...lead({ id: 'c', reason: 'M&A' }) }
    expect(otherMajor(row('A', '', {}, { items: [twin] }))).toBe(0)
    expect(otherMajor(row('A', '', {}, { items: [twin, other] }))).toBe(1)
  })
  it('a move adds at most 10 to a filing, and at most 25 alone', () => {
    expect(scoreParts(row('A', '', {}, { market: sig(50) })).move).toBe(10)
    expect(scoreParts(row('A', '', { category: 'market', base: 65, score: 90 }, { market: sig(50) })).total).toBe(90)
  })
  it('a filing cannot pull a row below its move alone, and size does not lift a move alone', () => {
    const deck = row('DECK', 'large', { reason: 'Results deck', category: 'results', base: 35, score: 36 }, { market: sig(6) })
    expect(scoreCard(deck)).toBe(65 + 24)
  })
})

describe('the approved order, on the recording', () => {
  it('27 Oct', () => expect(order('digest-2026-10-27-24.json')).toEqual(['HDFCBANK', 'LT', 'RELIANCE', 'MARUTI', 'HOMEFIRST', 'STERTOOLS', 'AARTIPHARM', 'HINDUNILVR', 'INFY']))
  it('28 Oct', () => expect(order('digest-2026-10-28-24.json')).toEqual(['NAUKRI', 'BAJAJELEC', 'HINDUNILVR', 'KPITTECH', 'AARTIPHARM', 'POLYCAB', 'LT', 'INFY']))
  it('29 Oct', () => expect(order('digest-2026-10-29-24.json')).toEqual(['EQUITASBNK', 'ASIANPAINT', 'BAJAJELEC', 'DEEPAKNTR', 'AARTIPHARM', 'HOMEFIRST']))
  it('30 Oct', () => expect(order('digest-2026-10-30-24.json')).toEqual(['RELIANCE', 'EQUITASBNK', 'POLYCAB', 'SUNPHARMA', 'DEEPAKNTR', 'AARTIPHARM', 'BAJAJELEC', 'HOMEFIRST', 'NAUKRI']))
  it('days that already read right keep their order', () => {
    expect(order('digest-2026-10-13-24.json')).toEqual(['NAUKRI', 'POLYCAB', 'BAJAJELEC', 'KPITTECH', 'INFY'])
    expect(order('digest-2026-10-15-24.json')).toEqual(['POLYCAB', 'BAJAJELEC', 'MARUTI'])
    expect(order('digest-2026-10-19-24.json')).toEqual(['BAJFINANCE', 'AARTIPHARM', 'HOMEFIRST', 'INFY', 'LT', 'POLYCAB'])
    expect(order('digest-2026-10-23-24.json')).toEqual(['INFY', 'NAUKRI', 'HDFCBANK', 'BAJFINANCE'])
  })
})

/**
 * Every claim a "why #N" line can make, checked against the data. A phrase with no check here fails, so a new
 * wording can't reach the screen unverified. Run at two alert settings over every recording.
 */
function checkClaims(cards: Card[], where: string) {
  cards.forEach((c, i) => {
    const prev = cards[i - 1]
    const at = `${where} #${i + 1} ${c.symbol}: ${c.why_rank}`
    let text = c.why_rank!
    expect(text.startsWith(eventLabel(c.lead.reason)), at).toBe(true)
    text = text.slice(eventLabel(c.lead.reason).length)

    const plus = text.match(/^, plus (.+?)(?: and (\d+) more)?(?=;|\.$)/)
    if (plus) {
      const others = c.items.filter((it) => it.tier !== 'routine' && it.reason !== c.lead.reason).map((it) => eventLabel(it.reason).toLowerCase())
      for (const name of plus[1].split(' and ')) expect(others, at).toContain(name.toLowerCase())
      text = text.slice(plus[0].length)
    }
    const stock = text.match(/^; stock (.+?), (\d{1,2} [A-Z][a-z]{2}) close/)
    if (stock) {
      const m = c.market!
      const s = market.sessions[c.symbol].find((x) => x[0] === m.date)!
      expect([s[2], s[3]], at).toEqual([m.chg_pct, m.vol_x])
      expect(stock[1], at).toBe(describeMove(m))
      expect(stock[2], at).toBe(dayMonth(m.date))
      text = text.slice(stock[0].length)
    }
    const a = prev && scoreParts(prev), b = scoreParts(c)
    const claim = text.replace(/\.$/, '')
    const n = claim.match(/#(\d+)/)
    if (n) expect(+n[1], at).toBe(i)
    if (claim === '') return
    else if (claim === '; the biggest event in this window') {
      expect(i, at).toBe(0)
      for (const o of cards) expect(c.score, at).toBeGreaterThanOrEqual(o.score!)
    } else if (claim === '; the biggest event with figures to show') {
      expect(i, at).toBe(0)
      expect(rowFigure(c), at).not.toBeNull()
      expect(cards.some((o) => o.score! > c.score!), at).toBe(true)
      for (const o of cards.filter((x) => !resultsWithoutFigures(x))) expect(c.score, at).toBeGreaterThanOrEqual(o.score!)
    } else if (claim === '; the biggest event FINN can show in full') {
      expect(i, at).toBe(0)
      expect(rowFigure(c), at).toBeNull()
      expect(cards.some((o) => o.score! > c.score!), at).toBe(true)
      for (const o of cards.filter((x) => !resultsWithoutFigures(x))) expect(c.score, at).toBeGreaterThanOrEqual(o.score!)
    } else if (claim === '; no figures to show, so rows with figures come first') {
      expect(resultsWithoutFigures(c), at).toBe(true)
    } else if (/^; #\d+ is a more senior change$/.test(claim)) {
      expect(namesTopRole(prev) && !namesTopRole(c), at).toBe(true)
    } else if (/^; #\d+ is a bigger kind of event$/.test(claim)) {
      expect(a.event, at).toBeGreaterThan(b.event)
    } else if (/^; #\d+ is a larger company$/.test(claim)) {
      const rank = (x: Card) => ['small', 'mid', 'large'].indexOf(x.size)
      expect(rank(prev), at).toBeGreaterThan(rank(c))
    } else if (/^; #\d+ also has other major filings$/.test(claim)) {
      expect(otherMajor(prev), at).toBeGreaterThan(otherMajor(c))
    } else if (/^; a smaller move than #\d+$/.test(claim) || /^; #\d+ had a bigger price or volume move$/.test(claim)) {
      expect(prev.market!.strength, at).toBeGreaterThan(c.market?.strength ?? 0)
    } else if (/^; filed before #\d+$/.test(claim)) {
      expect(new Date(c.lead.ts).getTime(), at).toBeLessThan(new Date(prev.lead.ts).getTime())
    } else {
      throw new Error(`No check for this claim: ${at}`)
    }
  })
}

describe('on every recorded briefing, at two alert settings', () => {
  const each = (fn: (cards: Card[], where: string) => void) => {
    for (const f of files) for (const [name, p] of [['default', DEFAULT_PREFS], ['tight', tight]] as const) fn(applyAlerts(read<Digest>(f), p, market).cards, `${f} ${name}`)
  }
  it('every rank explanation claims only what the data supports', () => each(checkClaims))
  it('still holds after the top row is dismissed', () => each((cards, where) => { if (cards.length > 1) checkClaims(rankCards(cards.slice(1)), `${where} dismissed`) }))
  it('rows score in order, apart from results held out of the top 3', () => {
    each((cards, where) => {
      const speaking = cards.filter((c) => !resultsWithoutFigures(c))
      speaking.forEach((c, i) => { if (i > 0) expect(speaking[i - 1].score!, `${where} ${c.symbol}`).toBeGreaterThanOrEqual(c.score!) })
      cards.slice(0, Math.min(3, speaking.length)).forEach((c) => expect(resultsWithoutFigures(c), where).toBe(false))
    })
  })
  it('re-ranking is stable', () => {
    each((cards, where) => expect(rankCards(cards).map((c) => c.symbol), where).toEqual(cards.map((c) => c.symbol)))
  })
  it('a #1 with no number still says what happened, and names only people in the filing', () => {
    let checked = 0
    each((cards, where) => {
      const top = cards[0]
      if (!top || rowFigure(top)) return
      checked++
      const said = `${rowLine(top, null, true)} ${top.why_short}`
      expect(said.length, `${where} ${said}`).toBeGreaterThan(24)
      if (top.lead.category !== 'management_change') return
      const names = (top.people ?? []).map((p) => p.person)
      if (names.length) expect(names.some((x) => top.why_short!.includes(x)), `${where} ${top.why_short}`).toBe(true)
      for (const s of top.why_short!.split('. ').filter((x) => /(appointed|resigned|no longer|retiring|re-)/.test(x))) {
        expect(names.some((x) => s.startsWith(x)), `${where} ${s}`).toBe(true)
      }
    })
    expect(checked).toBeGreaterThan(20)
  })
})

describe('the key fact on a #1 with no number', () => {
  it('names who changed on 27 Oct', () => {
    const top = applyAlerts(read<Digest>('digest-2026-10-27-24.json'), DEFAULT_PREFS, market).cards[0]
    expect(top.why_short).toBe('Sashidhar Jagdishan is no longer MD & CEO. Anup Bagchi appointed as MD & CEO.')
  })
  it('a #1 with a number keeps the plain event', () => {
    const top = applyAlerts(read<Digest>('digest-2026-10-30-24.json'), DEFAULT_PREFS, market).cards[0]
    expect(top.why_short).toBe('Fresh quarterly results.')
  })
})
