import { describe, expect, it } from 'vitest'
import type { Card, Results } from '../api'
import { figuresWithheld, rowFigure, rowLine } from '../figure'

const lead = (category: string, headline: string) => ({ id: '1', symbol: 'X', category, tier: 'high', reason: '', headline, why: '', url: '', ts: '', nse_category: '', base: 90, score: 90, read: null }) as Card['lead']
const results = (confidence: string, pat: number | null, rev: number | null) => ({
  status: 'extracted', confidence,
  rows: { pat: { yoy_pct: pat }, revenue: { yoy_pct: rev }, pbt: {}, ebitda: null },
}) as unknown as Results
const card = (over: Partial<Card>): Card => ({ symbol: 'X', company: 'X', sector: '', size: '', score: 90, lead: lead('results', 'h'), items: [], routine_count: 0, folded: [], ...over })
const sig = (chg: number | null, vol: number | null, move_hit: boolean, vol_hit: boolean) => ({ date: '2026-10-30', close: 1, chg_pct: chg, vol_x: vol, move_hit, vol_hit })

describe('rowFigure', () => {
  it('leads confident results with PAT YoY', () => {
    expect(rowFigure(card({ results: results('high', 32.1, 28.6) }))).toEqual({ value: '+32.1%', label: 'PAT YoY', sign: 'up' })
  })
  it('falls back to revenue when PAT growth is not meaningful', () => {
    expect(rowFigure(card({ results: results('medium', null, -4) }))).toEqual({ value: '−4.0%', label: 'Revenue YoY', sign: 'down' })
  })
  it('never shows a low-confidence figure', () => {
    const c = card({ results: results('low', 32.1, 28.6) })
    expect(rowFigure(c)).toBeNull()
    expect(figuresWithheld(c)).toBe(true)
  })
  it('a rise is green and a fall is red, whatever the volume', () => {
    expect(rowFigure(card({ lead: lead('market', ''), market: sig(-6.3, 42, true, true) }))).toEqual({ value: '−6.3%', label: 'on 42× volume', sign: 'down' })
    expect(rowFigure(card({ lead: lead('market', ''), market: sig(5, 1.2, true, false) }))?.sign).toBe('up')
  })
  it('volume alone has no sign', () => {
    expect(rowFigure(card({ lead: lead('market', ''), market: sig(0.9, 3.4, false, true) }))).toEqual({ value: '3.4×', label: 'volume', sign: 'none' })
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
  it('points a price card at the last material filing', () => {
    const c = card({ lead: lead('market', ''), market: sig(-6.3, 42, true, true) })
    const last = { id: '1', ts: '2026-10-29T12:00:00+05:30', tier: 'high', base: 95, category: 'management_change', reason: '', headline: 'Resignation of MD & CEO', url: '', read: null } as const
    expect(rowLine(c, last)).toBe('No filing in this window. Last, 29 Oct: Resignation of MD & CEO')
  })
  it('a collapsed Compact row leads with the fact, and drops a same-day effective date', () => {
    const c = card({ lead: lead('market', ''), market: sig(-6.3, 42, true, true) })
    const last = { id: '1', ts: '2026-10-29T15:00:00+05:30', tier: 'high', base: 95, category: 'management_change', reason: '', headline: 'Resignation of Mr. P N Vasudevan as Managing Director & CEO of the company w.e.f. October 29, 2026', url: '', read: null } as const
    expect(rowLine(c, last, true)).toBe('Last filing, 29 Oct: P N Vasudevan resigns as MD & CEO')
    expect(rowLine(c, { ...last, headline: 'Resignation of Mr. P N Vasudevan as Managing Director & CEO of the company w.e.f. November 2, 2026' }, true))
      .toBe('Last filing, 29 Oct: P N Vasudevan resigns as MD & CEO, effective 2 Nov 2026')
    expect(rowLine(c, null, true)).toBe('No filing in this window')
  })
  it('states a price move on a volume-only alert, and never says to go and look elsewhere', () => {
    const c = card({ lead: lead('market', ''), market: sig(2.9, 24, false, true) })
    expect(rowLine(c)).toBe('Price +2.9%. No filing in this window')
  })
})
