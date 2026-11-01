import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyAlerts, DEFAULT_PREFS } from '../alerts'
import type { Digest } from '../api'
import type { Timeline } from '../company'
import { rowFigure } from '../figure'
import type { Market } from '../market'
import { briefingEnd, synthesis } from '../synthesis'

const demo = join(__dirname, '../../public/demo')
const read = <T,>(f: string) => JSON.parse(readFileSync(join(demo, f), 'utf8')) as T
const market = read<Market>('market.json'), timeline = read<Timeline>('timeline.json')
const load = (f: string) => applyAlerts(read<Digest>(f), DEFAULT_PREFS, market)

describe('synthesis', () => {
  it('the default screen says what happened, with real numbers', () => {
    const d = load('digest-2026-10-30-24.json')
    expect(synthesis(d.cards, d.window.start, timeline)).toEqual([
      { symbol: 'RELIANCE', text: 'Reliance Industries PAT +32.1% YoY' },
      { symbol: 'EQUITASBNK', text: 'Equitas Small Finance Bank −6.3% on 42× volume; 29 Oct filing: CEO/CFO/MD-level change' },
    ])
  })
  it('skips results it cannot show while anything else can speak', () => {
    for (const f of readdirSync(demo).filter((x) => x.startsWith('digest-'))) {
      const d = load(f)
      const says = synthesis(d.cards, d.window.start, timeline)
      if (says.length && d.cards.some((c) => !/withheld/.test(synthesis([c], d.window.start, timeline)[0].text))) {
        expect(says.some((s) => s.text.includes('withheld')), f).toBe(false)
      }
    }
  })
  it('on every recorded briefing: every number comes from that row, and no causal or advice words', () => {
    for (const f of readdirSync(demo).filter((x) => x.startsWith('digest-'))) {
      const d = load(f)
      for (const s of synthesis(d.cards, d.window.start, timeline)) {
        const card = d.cards.find((c) => c.symbol === s.symbol)!
        const fig = rowFigure(card)
        const allowed = `${fig?.value ?? ''} ${fig?.label ?? ''} ${card.company}`
        const body = s.text.replace(/\d{1,2} [A-Z][a-z]{2} filing/, '')
        for (const n of body.match(/\d+(?:\.\d+)?/g) ?? []) expect(allowed, `${n} in "${s.text}"`).toContain(n)
        expect(s.text, f).not.toMatch(/because|due to|driven|buy|sell|should/i)
      }
    }
  })
  it('an empty briefing says nothing', () => expect(synthesis([], '', null)).toEqual([]))
})

describe('briefingEnd', () => {
  it('counts only what was cleared as handled', () => {
    expect(briefingEnd(9, 0, 11)).toBe('9 companies to look at, 11 filtered. Nothing else is waiting.')
    expect(briefingEnd(1, 2, 0)).toBe('2 handled, 1 company to look at, 0 filtered. Nothing else is waiting.')
    expect(briefingEnd(0, 9, 11)).toBe('9 handled, 11 filtered. Nothing else is waiting.')
  })
})
