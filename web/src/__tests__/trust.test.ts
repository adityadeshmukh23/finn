import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyAlerts, DEFAULT_PREFS } from '../alerts'
import type { Digest } from '../api'
import { filingCount } from '../components/Book'
import { filingsInWindow, moveContext, sessionsAsOf, type Timeline } from '../company'
import { closedBeforeFiling, moveLine, rowFigure, rowLine } from '../figure'
import { closeTime, type Market } from '../market'
import { synthesis } from '../synthesis'

/** What a row says against what the company file shows, on every holding on every recorded briefing, at two alert settings. */
const demo = join(__dirname, '../../public/demo')
const read = <T,>(f: string) => JSON.parse(readFileSync(join(demo, f), 'utf8')) as T
const timeline = read<Timeline>('timeline.json'), market = read<Market>('market.json')
const files = readdirSync(demo).filter((f) => f.startsWith('digest-'))
const prefs = [DEFAULT_PREFS, { ...DEFAULT_PREFS, volX: 1.5, movePct: 1 }]
const each = (fn: (d: Digest, f: string) => void) => { for (const f of files) for (const p of prefs) fn(applyAlerts(read<Digest>(f), p, market), f) }
const CAUSAL = /because|due to|driven|caused|behind it|triggered|in response|reaction|on the back of|following the/i

describe('a price row and the company file agree, on every recording', () => {
  it('says nothing was filed only when the file has no material filing on that session', () => {
    let rows = 0
    each((d, f) => {
      for (const c of d.cards.filter((x) => x.lead.category === 'market')) {
        rows++
        const sessions = market.sessions[c.symbol]
        const i = sessions.findIndex((s) => s[0] === c.market!.date)
        const from = closeTime(sessions[i - 1][0]), to = closeTime(sessions[i][0])
        // Worked out here from the raw lists, not through the helper under test.
        const raw = (timeline[c.symbol] ?? []).filter((r) => r.tier !== 'routine' && new Date(r.ts).getTime() > from && new Date(r.ts).getTime() <= to)
        const ctx = moveContext(timeline[c.symbol], sessions, c.market!.date, d.window.start)
        expect(ctx.filed.map((r) => r.id), `${f} ${c.symbol}`).toEqual(raw.map((r) => r.id))
        expect(moveLine(ctx).startsWith('No material filing'), `${f} ${c.symbol}`).toBe(raw.length === 0)
        const said = rowLine(c, ctx, true)
        expect(said, f).not.toMatch(/no filing|in this window|last filing/i)
        if (ctx.last) expect((timeline[c.symbol] ?? []).some((r) => r.id === ctx.last!.id), f).toBe(true)
      }
    })
    expect(rows).toBeGreaterThan(100)
  })
  it('the figure is the close the chart shows for that date', () => {
    each((d, f) => {
      for (const c of d.cards.filter((x) => x.market)) {
        const s = sessionsAsOf(market.sessions[c.symbol], d.window.end).find((x) => x[0] === c.market!.date)
        expect(s, `${f} ${c.symbol}`).toBeDefined()
        expect([s![2], s![3]], `${f} ${c.symbol}`).toEqual([c.market!.chg_pct, c.market!.vol_x])
      }
    })
  })
  it('every filing on a row or in the hidden list is in the company file, and the Book counts the same list', () => {
    each((d, f) => {
      const ids = new Set(Object.values(timeline).flat().map((r) => r.id))
      for (const c of d.cards.filter((x) => x.lead.category !== 'market')) {
        for (const it of [c.lead, ...c.items, ...c.folded]) expect(ids.has(it.id), `${f} ${it.id}`).toBe(true)
      }
      for (const g of d.hidden) for (const it of g.items) expect(ids.has(it.id), `${f} ${it.id}`).toBe(true)
      for (const sym of Object.keys(d.names)) {
        expect(filingCount(d, sym, timeline), `${f} ${sym}`).toBe(filingsInWindow(timeline[sym], d.window.start, d.window.end).length)
      }
    })
  })
})

describe('figures carry their labels, on every recording', () => {
  it('a move names its close, and results name the comparison, the quarter and the basis', () => {
    each((d, f) => {
      for (const c of d.cards) {
        const fig = rowFigure(c)
        if (!fig) continue
        if (fig.kind === 'market') expect(fig.label, f).toMatch(/\d{1,2} [A-Z][a-z]{2}/)
        else {
          expect(fig.label, f).toMatch(/YoY$/)
          expect(c.results?.status, f).toBe('extracted')
          if (c.results?.status === 'extracted') {
            expect(c.results.period, `${f} ${c.symbol}`).toMatch(/^[A-Z][a-z]{2} \d{4}$/)
            expect(['consolidated', 'standalone'], `${f} ${c.symbol}`).toContain(c.results.basis)
            const line = rowLine(c, null, true)
            expect(line, f).toContain(`${c.results.period} qtr`)
            expect(line, f).toContain(c.results.basis)
          }
        }
      }
    })
  })
})

describe('nothing implies a filing moved a price, on every recording', () => {
  it('rows, rank lines and the synthesis use no causal wording', () => {
    each((d, f) => {
      const ctxFor = (sym: string, date: string) => moveContext(timeline[sym], market.sessions[sym], date, d.window.start)
      for (const c of d.cards) {
        const ctx = c.lead.category === 'market' ? ctxFor(c.symbol, c.market!.date) : null
        const text = [rowLine(c, ctx), rowLine(c, ctx, true), c.why_rank, c.why_short, ctx && moveLine(ctx)].join(' | ')
        expect(text, f).not.toMatch(CAUSAL)
      }
      for (const s of synthesis(d.cards, d.window.start, timeline)) expect(s.text, f).not.toMatch(CAUSAL)
    })
  })
  it('a close that came first is flagged wherever it happens', () => {
    let flagged = 0
    each((d) => { for (const c of d.cards) if (closedBeforeFiling(c)) flagged++ })
    expect(flagged).toBeGreaterThan(0)
  })
})
