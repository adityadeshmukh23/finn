import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BADGE_HUES, badgeHue, badgeLetters } from '../badge'

const src = join(__dirname, '..')
const css = readFileSync(join(src, 'index.css'), 'utf8')
const tickers = (JSON.parse(readFileSync(join(src, '../../data/portfolio.json'), 'utf8')) as { portfolio: { symbol: string }[] }).portfolio.map((p) => p.symbol)
const AA = 4.5

type RGB = [number, number, number]
function hsl(h: number, s: number, l: number): RGB {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}
const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
function ratio(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Read from the source, so the test can't drift from what ships. */
function tones(block: string) {
  const read = (name: string) => {
    const m = block.match(new RegExp(`--${name}:\\s*(\\d+)%\\s+(\\d+)%`))
    return [+m![1], +m![2]] as [number, number]
  }
  return { ground: read('badge-ground'), letter: read('badge-letter') }
}
const light = tones(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')))
const dark = tones(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('html, body')))

describe('monogram badges', () => {
  it.each([['light', light], ['dark', dark]] as const)('every hue passes AA in %s', (_, t) => {
    const low = BADGE_HUES.map((h) => [h, ratio(hsl(h, ...t.letter), hsl(h, ...t.ground))]).filter(([, r]) => r < AA)
    expect(low).toEqual([])
  })

  it('the contrast check fails on a weak pair', () => {
    expect(ratio(hsl(220, 60, 60), hsl(220, 55, 90))).toBeLessThan(AA)
  })

  it('never uses red, green or amber, which mean sign and confidence', () => {
    for (const h of BADGE_HUES) expect(h >= 185 && h <= 330, String(h)).toBe(true)
  })

  it('the same ticker always gets the same colour and letters', () => {
    for (const t of tickers) {
      expect(badgeHue(t)).toBe(badgeHue(t))
      expect(badgeHue(t.toLowerCase())).toBe(badgeHue(t))
      expect(BADGE_HUES).toContain(badgeHue(t))
    }
    // Pinned: a change to the hash would repaint every company.
    expect(['RELIANCE', 'EQUITASBNK', 'KAYNES'].map(badgeHue)).toEqual([310, 280, 250])
  })

  it('letters come from the ticker', () => {
    expect(badgeLetters('RELIANCE')).toBe('RE')
    expect(badgeLetters('M&M')).toBe('MM')
    expect(badgeLetters('3MINDIA')).toBe('3M')
  })

  it('spreads across the portfolio rather than one colour for all', () => {
    expect(new Set(tickers.map(badgeHue)).size).toBeGreaterThan(4)
  })
})
