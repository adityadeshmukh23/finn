import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Digest, Walk } from '../api'
import { parseHash } from '../route'
import { TOUR } from '../tour'

const demo = join(__dirname, '../../public/demo')
const read = <T,>(f: string) => JSON.parse(readFileSync(join(demo, f), 'utf8')) as T
const latest = read<Digest>('digest-2026-10-30-24.json')
const readme = readFileSync(join(__dirname, '../../../README.md'), 'utf8')
const section = readme.slice(readme.indexOf('## 2-minute tour'), readme.indexOf('\n## ', readme.indexOf('## 2-minute tour') + 5))

describe('the 2-minute tour', () => {
  it('has five steps and every target exists on the recording', () => {
    expect(TOUR).toHaveLength(5)
    const timeline = read<Record<string, { results?: { status: string; confidence?: string } }[]>>('timeline.json')
    const results = (s: string) => timeline[s].map((r) => r.results).filter((r) => r?.status === 'extracted')
    expect(results('EQUITASBNK')[0]?.confidence).toBe('low')
    expect(results('RELIANCE')[0]?.confidence).not.toBe('low')
    expect(latest.names.EQUITASBNK && latest.names.RELIANCE).toBeTruthy()
    const walks = read<Walk[]>('walks.json')
    for (const { action } of TOUR) {
      if (action.kind !== 'go') continue
      const r = parseHash(action.hash)
      expect(r.tab).not.toBe('today')
      if (r.row) expect(walks.some((w) => w.symbol === r.symbol && w.row === r.row)).toBe(true)
    }
  })

  it('claims nothing live and gives no advice, in the app and the README', () => {
    expect(section).toContain('2-minute tour')
    for (const text of [...TOUR.map((s) => s.text), section]) {
      expect(text, text).not.toMatch(/\b(live|real[- ]time|today's price|refresh|buy|sell|target price|should|recommend|undervalued)\b/i)
    }
    expect(section).toMatch(/recorded/i)
  })
})
