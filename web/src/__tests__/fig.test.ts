import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as fig from '../fig'

describe('signs', () => {
  it('a change carries its sign, and a fall uses U+2212, never a hyphen', () => {
    expect(fig.pctChange(6.26)).toEqual({ text: '+6.3%', sign: 'up' })
    expect(fig.pctChange(-6.26)).toEqual({ text: '−6.3%', sign: 'down' })
    expect(fig.crore(-1234.5)).toBe('−1,235')
    for (const t of [fig.pct(-1), fig.crore(-1), fig.crore(-1000)]) expect(t).not.toContain('-')
  })

  it('what rounds to zero has no sign and no colour', () => {
    for (const n of [0, 0.04, -0.04]) expect(fig.pctChange(n)).toEqual({ text: '0.0%', sign: 'none' })
    expect(fig.pctChange(0.05).sign).toBe('up')
  })
})

describe('units and decimals', () => {
  it('a margin always has one decimal', () => {
    expect([fig.margin(17), fig.margin(8.8), fig.margin(22.44), fig.margin(0)]).toEqual(['17.0%', '8.8%', '22.4%', '0.0%'])
  })

  it('a multiple is whole from 10× up', () => {
    expect([fig.multiple(42.4), fig.multiple(10), fig.multiple(9.96), fig.multiple(2.34)]).toEqual(['42×', '10×', '10.0×', '2.3×'])
  })

  it('a setting is shown as it stands', () => {
    expect([fig.times(2), fig.times(2.5), fig.plusMinusPct(4)]).toEqual(['2×', '2.5×', '±4%'])
  })

  it('a price under ₹1,000 always has two decimals, and from there up none', () => {
    expect([fig.price(872.7), fig.price(197.84), fig.price(53.59), fig.price(99)]).toEqual(['₹872.70', '₹197.84', '₹53.59', '₹99.00'])
    expect([fig.price(1185.4), fig.price(1000), fig.price(120345.6)]).toEqual(['₹1,185', '₹1,000', '₹1,20,346'])
    expect(fig.price(999.996)).toBe('₹1,000')
  })

  it('crore groups the Indian way: whole from 100, up to one decimal below it, and a dash when missing', () => {
    expect([fig.crore(332861), fig.crore(18226), fig.crore(99.44), fig.crore(100.4), fig.crore(12)]).toEqual(['3,32,861', '18,226', '99.4', '100', '12'])
    expect(fig.crore(null)).toBe('–')
    expect(fig.NOT_MEANINGFUL).toBe('n.m.')
  })

  it('dollars show cents, and more only below a cent', () => {
    expect([fig.usd(0), fig.usd(1.5), fig.usd(0.0012)]).toEqual(['$0.00', '$1.50', '$0.0012'])
  })
})

describe('numerals', () => {
  it('digits are ASCII from every function, so tabular figures line up', () => {
    const out = [fig.pct(-12.3), fig.margin(4), fig.multiple(4), fig.price(872.7), fig.price(1234), fig.crore(332861), fig.usd(1), fig.day('2026-10-30'), fig.clock('2026-10-30T19:40:00+05:30')]
    for (const t of out) expect(t.replace(/\s/g, ' ')).toMatch(/^[ -~₹×−]+$/)
  })

  it('the whole app sets tabular numerals', () => {
    const css = readFileSync(join(__dirname, '../index.css'), 'utf8')
    expect(css).toMatch(/body \{[^}]*font-variant-numeric: tabular-nums/)
  })
})

describe('periods and basis', () => {
  it('a quarter reads from its end, and falls back to the filing\'s own label', () => {
    expect(fig.period('Sep 2026', '30.09.2026')).toBe('Sep 2026 qtr')
    expect(fig.period(null, '491271')).toBe('qtr to 491271')
  })

  it('basis is said as consolidated or standalone', () => {
    expect(fig.basis('consolidated')).toBe('consolidated')
    expect(fig.basis('standalone')).toBe('standalone')
  })

  it('dates as filings print them read as 30 Oct, with the year only when it differs from the filing', () => {
    const filed = '2026-10-30T19:00:00+05:30'
    for (const [printed, want] of [['October 30, 2026', '30 Oct'], ['26 th October, 2026', '26 Oct'], ['26th October, 2026', '26 Oct'], ['02nd November 2026', '2 Nov'],
      ['03-Nov-2026', '3 Nov'], ['30th Sept 2026', '30 Sep'], ['1 February 2027', '1 Feb 2027'], ['January 1, 2027', '1 Jan 2027']]) {
      expect(fig.printedDates(printed, filed), printed).toBe(want)
    }
    expect(fig.printedDates('on Wednesday, October 28, 2026, at 17:30', filed)).toBe('on Wednesday, 28 Oct, at 17:30')
    expect(fig.printedDates('October 30, 2026')).toBe('30 Oct 2026')
  })
  it('leaves what is not a real date as printed', () => {
    for (const s of ['February 30, 2026', 'Q2 FY27', '30.09.2026', 'May 2026', '']) expect(fig.printedDates(s, '2026-10-30T19:00:00+05:30')).toBe(s)
  })
  it('dates are IST whatever the device says, with three-letter months', () => {
    expect(fig.day('2026-10-30')).toBe('30 Oct')
    expect(fig.day('2026-09-30')).toBe('30 Sep')
    expect(fig.day('2026-10-30T18:30:00Z')).toBe('31 Oct')
    expect(fig.clock('2026-10-30T19:40:11+05:30')).toMatch(/^30 Oct(,| at) 7:40\spm$/)
    expect(fig.clock('2026-09-30T19:40:11+05:30')).toMatch(/^30 Sep/)
    expect(fig.dayYear('2026-11-01T04:45:42')).toMatch(/^1 Nov 2026$/)
    expect(fig.weekdayDay('2026-10-11')).toBe('Sunday 11 Oct')
    expect(fig.todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('server headlines', () => {
  const H = 'PAT ₹29,250 cr, +32.1% YoY; revenue +28.6% YoY (Sep 2026 qtr, consolidated)'

  it('can be cut down to the figure, keeping the quarter and basis', () => {
    expect(fig.headlineFigureOnly(H)).toBe('PAT ₹29,250 cr (Sep 2026 qtr, consolidated)')
    expect(fig.headlineFigureOnly('PAT ₹−12.5 cr; revenue +1.0% YoY (Sep 2026 qtr, standalone)')).toBe('PAT ₹−12.5 cr (Sep 2026 qtr, standalone)')
  })

  it('can drop the PAT change the row already shows', () => {
    expect(fig.headlineWithoutYoY(H)).toBe('PAT ₹29,250 cr; revenue +28.6% YoY (Sep 2026 qtr, consolidated)')
    expect(fig.headlineWithoutYoY(H.replace('+32.1%', '−3.1%'))).toBe('PAT ₹29,250 cr; revenue +28.6% YoY (Sep 2026 qtr, consolidated)')
  })
})
