import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Card, Digest, Research as R } from '../api'
import type { Timeline } from '../company'

/**
 * Headlines, targets and delivered text are written by the backend and recorded, so fig.ts can't format them and the guard
 * can't see them. This holds them to the same rules, on every recording: Indian grouping, U+2212, a basis on every result.
 */
const demo = join(__dirname, '../../public/demo')
const read = <T,>(f: string) => JSON.parse(readFileSync(join(demo, f), 'utf8')) as T
const digests = readdirSync(demo).filter((f) => f.startsWith('digest-')).map((f) => read<Digest>(f))
const scorecards = readdirSync(join(demo, 'research')).filter((f) => f !== 'index.json').map((f) => read<R>(`research/${f}`))

const INDIAN = String.raw`\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}`      // 3,32,861 or 29,250 or 990
const CRORE = String.raw`₹−?(?:${INDIAN})(?:\.\d{1,2})? cr`
const CHANGE = String.raw`[+−]\d+\.\d% YoY`
const QUARTER = String.raw`[A-Z][a-z]{2} \d{4} qtr`
const HEADLINE = new RegExp(`^PAT ${CRORE}(?:, ${CHANGE})?(?:; revenue ${CHANGE})? \\((?:${QUARTER}, )?(?:consolidated|standalone)\\)$`)
const VALUE = String.raw`(?:${CRORE}|\$\d+(?:\.\d+)? (?:mn|bn)|\d+(?:\.\d+)?%)`
const TARGET = new RegExp(`^(?:about |under )?${VALUE}(?:–${VALUE}|\\+)?$`)
const CALL = /^Q[1-4] FY\d{2}$/
const DUE = /^(?:(?:Q[1-4]|H[12]|9M) )?FY\d{2}$|^unspecified$/

const headlines = (c: Card) => [c.lead, ...c.items, ...c.folded].map((it) => it.headline)

describe('server strings follow the same grammar, on every recording', () => {
  it('every results headline', () => {
    const timeline = read<Timeline>('timeline.json')
    const all = [...digests.flatMap((d) => d.cards.flatMap(headlines)), ...Object.values(timeline).flat().map((it) => it.headline)]
    const results = [...new Set(all.filter((h) => h.startsWith('PAT ')))]
    expect(results.length).toBeGreaterThan(5)
    expect(results.filter((h) => !HEADLINE.test(h))).toEqual([])
  })

  it('every target, delivered figure, call and due date', () => {
    const rows = scorecards.flatMap((s) => s.scorecard.rows)
    const claims = rows.flatMap((r) => [r.promised, ...r.revisions, ...(r.later ?? [])])
    const targets = [...new Set(claims.map((c) => c.target).filter(Boolean))] as string[]
    expect(targets.length).toBeGreaterThan(20)
    expect(targets.filter((t) => !TARGET.test(t))).toEqual([])
    const delivered = [...new Set(rows.map((r) => r.delivered?.text).filter(Boolean))] as string[]
    expect(delivered.filter((t) => !TARGET.test(t))).toEqual([])
    expect(claims.map((c) => c.call).filter((c) => !CALL.test(c))).toEqual([])
    expect(rows.map((r) => r.due).filter((d) => !DUE.test(d))).toEqual([])
  })

  it('every results card names its quarter, its basis and its unit', () => {
    const shown = digests.flatMap((d) => d.cards.map((c) => c.results)).filter((r) => r?.status === 'extracted' && r.confidence !== 'low')
    expect(shown.length).toBeGreaterThan(5)
    for (const r of shown) {
      if (r?.status !== 'extracted') continue
      expect(r.period).toMatch(/^[A-Z][a-z]{2} \d{4}$/)
      expect(['consolidated', 'standalone']).toContain(r.basis)
      expect(r.unit).toMatch(/^₹ crore(?: \(converted from (?:lakh|million|thousand|rupees)\))?$/)
    }
  })

  it('the grammar refuses what it should', () => {
    for (const bad of ['PAT ₹-12 cr (standalone)', 'PAT ₹332,861 cr (consolidated)', 'PAT ₹29,250 cr, +32% YoY (consolidated)', 'PAT ₹29,250 cr']) expect(HEADLINE.test(bad), bad).toBe(false)
    for (const bad of ['₹100,000 cr', '-5%', '₹1000.5 Cr']) expect(TARGET.test(bad), bad).toBe(false)
    expect(HEADLINE.test('PAT ₹3,32,861 cr, −2.0% YoY (Sep 2026 qtr, consolidated)')).toBe(true)
    expect(TARGET.test('₹1,00,000 cr+')).toBe(true)
  })
})
