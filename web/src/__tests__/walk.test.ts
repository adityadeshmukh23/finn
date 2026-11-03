import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Walk } from '../api'
import * as fig from '../fig'
import { lead, title, trail } from '../walk'

const walks = JSON.parse(readFileSync(join(__dirname, '../../public/demo/walks.json'), 'utf8')) as Walk[]
const of = (symbol: string, row: string) => walks.find((w) => w.symbol === symbol && w.row === row)!

describe('fig: guidance figures', () => {
  it('writes a target as it was stated', () => {
    const t = (low: number, floor = false, about = false, high: number | null = null) => ({ low, high, floor, about })
    expect(fig.target(t(4500, true), 'crore')).toBe('₹4,500 cr+')
    expect(fig.target(t(4000, true, true), 'crore')).toBe('about ₹4,000 cr minimum')
    expect(fig.target(t(1000), 'crore')).toBe('₹1,000 cr')
    expect(fig.target(t(3500, false, false, 4000), 'crore')).toBe('₹3,500–4,000 cr')
    expect(fig.target(t(27, true), '%')).toBe('27%+')
    expect(fig.target(t(15.5), '%')).toBe('15.5%')
  })
  it('points carry a sign and U+2212, percent of target one decimal', () => {
    expect(fig.points(1.2)).toBe('+1.2 pts')
    expect(fig.points(-0.44)).toBe('−0.4 pts')
    expect(fig.points(0.04)).toBe('0.0 pts')
    expect(fig.ofTarget(80.5856)).toBe('80.6%')
    expect(fig.ofTarget(90)).toBe('90.0%')
  })
})

describe('the walk reads as arithmetic', () => {
  it('Kaynes says it missed both, with the two figures', () => {
    expect(lead(of('KAYNES', 'PQ1FY26-1'))).toBe('Missed both: 80.6% of the first promise, 90.7% of the last statement')
    expect(trail(of('KAYNES', 'PQ1FY26-1'))).toBe('₹4,500 cr+ → about ₹4,000 cr minimum → ₹3,626 cr')
  })
  it('a target that held is one sentence, and a management figure says it was stated on call', () => {
    expect(lead(of('BEL', 'PQ1FY26-1'))).toBe('Held on 3 calls: 15%+. Delivered 16.2%, +1.2 pts')
    expect(lead(of('BEL', 'PQ1FY26-2'))).toBe('Held on 3 calls: 27%+. Delivered 29.2%, +2.2 pts')
    expect(lead(of('BEL', 'PQ1FY26-3'))).toBe('Held on 3 calls: ₹27,000 cr+. Delivered ₹30,045 cr, 111.3% of target, stated on call')
    expect(lead(of('BEL', 'PQ1FY26-5'))).toBe('Held on 3 calls: ₹1,000 cr+. Delivered ₹900 cr, 90.0% of target, stated on call')
    expect(lead(of('COFORGE', 'PQ2FY26-8'))).toBe('Held on 2 calls: 14%+. Delivered 14.4%, +0.4 pts, stated on call')
  })
  it('an open walk names its last revision and claims nothing else', () => {
    expect(lead(of('COFORGE', 'PQ4FY26-3'))).toBe('Revised on the Q2 FY27 call. Not yet due')
    expect(lead(of('DIXON', 'PQ3FY26-4'))).toBe('Revised on the Q4 FY26 call. Not yet due')
    expect(lead(of('DIXON', 'PQ4FY26-13'))).toBe('Revised on the Q1 FY27 call. Not yet due')
  })
  it('no intent words, no score, on any walk', () => {
    const INTENT = /\b(cuts?|lowered|raised|walked back|beat|bar|slashed|credib\w*|honest\w*|broke|kept|score|promise kept)\b/i
    for (const w of walks) for (const line of [title(w), lead(w), trail(w)]) expect(line, line).not.toMatch(INTENT)
    expect(walks.filter((w) => /missed/i.test(lead(w))).map((w) => w.symbol)).toEqual(['KAYNES'])
  })
  it('every figure in a lead comes from the walk, through fig', () => {
    for (const w of walks) {
      const allowed = new Set([...w.steps.map((s) => fig.target(s, w.unit)), w.delivered?.value ?? ''].join(' ').match(/\d[\d,.]*/g) ?? [])
      for (const g of [w.vs_first, w.vs_last]) if (g) allowed.add(Math.abs(g.value).toFixed(1))
      if (w.delivered) (w.unit === '%' ? fig.margin(w.delivered.value) : fig.crore(w.delivered.value)).match(/\d[\d,.]*/g)!.forEach((n) => allowed.add(n))
      const words = lead(w).replace(/Q[1-4] FY\d{2}/, '').replace(/Held on \d calls/, '')
      for (const n of words.match(/\d[\d,.]*\d|\d/g) ?? []) expect(allowed.has(n), `${n} in ${lead(w)}`).toBe(true)
    }
  })
})
