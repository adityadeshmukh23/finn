import { describe, expect, it } from 'vitest'
import type { Card, Results } from '../api'
import { closedBeforeFiling, figuresWithheld, moveLine, rowFigure, rowLine } from '../figure'

const lead = (category: string, headline: string) => ({ id: '1', symbol: 'X', category, tier: 'high', reason: '', headline, why: '', url: '', ts: '', nse_category: '', base: 90, score: 90, read: null }) as Card['lead']
const results = (confidence: string, pat: number | null, rev: number | null) => ({
  status: 'extracted', confidence,
  rows: { pat: { yoy_pct: pat }, revenue: { yoy_pct: rev }, pbt: {}, ebitda: null },
}) as unknown as Results
const card = (over: Partial<Card>): Card => ({ symbol: 'X', company: 'X', sector: '', size: '', score: 90, lead: lead('results', 'h'), items: [], routine_count: 0, folded: [], ...over })
const sig = (chg: number | null, vol: number | null, move_hit: boolean, vol_hit: boolean) => ({ date: '2026-10-30', close: 1, chg_pct: chg, vol_x: vol, move_hit, vol_hit })

describe('rowFigure', () => {
  it('leads confident results with PAT YoY', () => {
    expect(rowFigure(card({ results: results('high', 32.1, 28.6) }))).toEqual({ value: '+32.1%', label: 'PAT YoY', sign: 'up', kind: 'results' })
  })
  it('falls back to revenue when PAT growth is not meaningful', () => {
    expect(rowFigure(card({ results: results('medium', null, -4) }))).toEqual({ value: '−4.0%', label: 'Revenue YoY', sign: 'down', kind: 'results' })
  })
  it('never shows a low-confidence figure', () => {
    const c = card({ results: results('low', 32.1, 28.6) })
    expect(rowFigure(c)).toBeNull()
    expect(figuresWithheld(c)).toBe(true)
  })
  it('a rise is green and a fall is red, whatever the volume', () => {
    expect(rowFigure(card({ lead: lead('market', ''), market: sig(-6.3, 42, true, true) }))).toEqual({ value: '−6.3%', label: '30 Oct, 42× volume', sign: 'down', kind: 'market' })
    expect(rowFigure(card({ lead: lead('market', ''), market: sig(5, 1.2, true, false) }))?.sign).toBe('up')
  })
  it('volume alone has no sign', () => {
    expect(rowFigure(card({ lead: lead('market', ''), market: sig(0.9, 3.4, false, true) }))).toEqual({ value: '3.4×', label: 'volume, 30 Oct', sign: 'none', kind: 'market' })
  })
  it('a filing with no number and no alert has no figure', () => {
    expect(rowFigure(card({ lead: lead('litigation', 'NCLAT allowed') }))).toBeNull()
  })
})

describe('rowLine', () => {
  it('does not repeat the figure', () => {
    const c = card({ lead: lead('results', 'PAT ₹29,250 cr, +32.1% YoY; revenue +28.6%'), results: results('high', 32.1, 28.6) })
    expect(rowLine(c)).toBe('PAT ₹29,250 cr; revenue +28.6%')
  })
  it('keeps the standalone marker', () => {
    const c = card({ lead: lead('results', 'PAT ₹7,893 cr, +1.7% YoY; revenue +10.3% (standalone)'), results: results('medium', 1.7, 10.3) })
    expect(rowLine(c)).toBe('PAT ₹7,893 cr; revenue +10.3% (standalone)')
  })
  it('a collapsed row gives the headline figure, the quarter and the basis, and leaves the rest for the open row', () => {
    const r = { ...results('high', 32.1, 28.6), period: 'Sep 2026', basis: 'consolidated' } as unknown as Results
    const c = card({ lead: lead('results', 'PAT ₹29,250 cr, +32.1% YoY; revenue +28.6% YoY (Sep 2026 qtr, consolidated)'), results: r })
    expect(rowLine(c, null, true)).toBe('PAT ₹29,250 cr (Sep 2026 qtr, consolidated)')
    expect(rowLine(c)).toBe('PAT ₹29,250 cr; revenue +28.6% YoY (Sep 2026 qtr, consolidated)')
  })
  const mk = card({ lead: lead('market', ''), market: sig(-6.3, 42, true, true) })
  const exit = { id: '1', ts: '2026-10-29T15:00:00+05:30', tier: 'high', base: 95, category: 'management_change', reason: '', headline: 'Resignation of Mr. P N Vasudevan as Managing Director & CEO of the company w.e.f. October 29, 2026', url: '', read: null } as const
  const ctx = (over = {}) => ({ date: '2026-10-30', previous: '2026-10-29', filed: [], last: null, ...over })
  it('points a price row at a dated filing and never calls it the cause', () => {
    expect(rowLine(mk, ctx({ last: exit }), true)).toBe('Filed 29 Oct: P N Vasudevan resigns as MD & CEO')
    expect(rowLine(mk, ctx({ last: { ...exit, headline: 'Resignation of Mr. P N Vasudevan as Managing Director & CEO of the company w.e.f. November 2, 2026' } }), true))
      .toBe('Filed 29 Oct: P N Vasudevan resigns as MD & CEO, effective 2 Nov 2026')
  })
  it('gives results filed earlier as the lead figure, with its labels', () => {
    const filed = { ...exit, reason: 'Quarterly results', headline: 'PAT ₹6,367 cr, +28.7% YoY; revenue +22.8% YoY (Sep 2026 qtr, consolidated)' }
    expect(rowLine(mk, ctx({ last: filed }), true)).toBe('Filed 29 Oct: PAT ₹6,367 cr (Sep 2026 qtr, consolidated)')
  })
  it('says what a thin filing is', () => {
    const deck = { ...exit, reason: 'Results deck', headline: 'Investor Presentation' }
    expect(rowLine(mk, ctx({ last: deck }), true)).toBe('Filed 29 Oct: Results slides from the company')
  })
  it('says nothing was filed only between the two closes it checked', () => {
    expect(rowLine(mk, ctx())).toBe('Nothing material filed since the 29 Oct close')
    expect(moveLine(ctx({ filed: [exit, { ...exit, category: 'results' }, exit] }))).toBe('Since the 29 Oct close: Management, Results')
    expect(moveLine(ctx({ previous: null }))).toBe('Nothing material filed up to the 30 Oct close')
  })
  it('makes no claim about filings when the timeline is not available', () => {
    expect(rowLine(mk, null)).toBe('Price or volume alert')
  })
  it('states a price move on a volume-only alert', () => {
    expect(rowLine(card({ lead: lead('market', ''), market: sig(2.9, 24, false, true) }), ctx())).toBe('Price +2.9%. Nothing material filed since the 29 Oct close')
  })
  it('flags a close that came before the filing', () => {
    const filed = (ts: string) => card({ lead: { ...lead('results', 'h'), ts }, market: sig(4.6, 2, true, true) })
    expect(closedBeforeFiling(filed('2026-10-30T18:00:00+05:30'))).toBe(true)
    expect(closedBeforeFiling(filed('2026-10-30T12:00:00+05:30'))).toBe(false)
  })
})
