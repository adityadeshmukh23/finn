import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** WCAG AA for every text and background pair the app uses, in both themes, read from the source so it can't go stale. */
const src = join(__dirname, '..')
const css = readFileSync(join(src, 'index.css'), 'utf8')
const research = readFileSync(join(src, 'components/Research.tsx'), 'utf8')
const strip = readFileSync(join(src, 'components/BookStrip.tsx'), 'utf8')
const AA = 4.5

type RGB = [number, number, number]
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB
const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const over = (fg: RGB, share: number, bg: RGB): RGB => fg.map((c, i) => Math.round(c * share + bg[i] * (1 - share))) as RGB
function ratio(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function tokens(block: string): Record<string, RGB> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], rgb(m[2])]))
}
const light = tokens(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')))
const dark = tokens(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('html, body')))

const TEXT = ['ink', 'ink-2', 'ink-3', 'up', 'down', 'flag']
const GROUND = ['bg', 'surface', 'raised']

/** Every verdict pill, as Research.tsx styles it, on the surface of a row and the page behind the filter chips. */
function pills() {
  return [...research.matchAll(/(\w+): 'bg-([\w-]+?)(?:\/(\d+))? text-([\w-]+)',/g)].map((m) => ({ name: m[1], bg: m[2], tint: m[3] ? +m[3] / 100 : null, text: m[4] }))
}

function pairs(t: Record<string, RGB>) {
  const out: [string, number][] = []
  for (const f of TEXT) for (const g of GROUND) out.push([`${f} on ${g}`, ratio(t[f], t[g])])
  out.push(['bg on ink (buttons, selected chip, undo)', ratio(t.bg, t.ink)])
  for (const p of pills()) {
    for (const g of ['surface', 'bg']) {
      const ground = p.tint === null ? t[p.bg] : over(t[p.bg], p.tint, t[g])
      out.push([`${p.name} pill, ${p.text} on ${p.bg}${p.tint ? ' tint' : ''}, over ${g}`, ratio(t[p.text], ground)])
    }
  }
  // Book strip tiles at their strongest tint. Weaker tints sit between this and plain surface.
  const max = +strip.match(/MAX_TINT = (\d+)/)![1] / 100
  for (const sign of ['up', 'down']) out.push([`ink on a full ${sign} tile`, ratio(t.ink, over(t[sign], max, t.surface))])
  return out
}

describe('contrast', () => {
  it.each([['light', light], ['dark', dark]] as const)('every pair passes AA in %s', (_, t) => {
    expect(pairs(t).filter(([, r]) => r < AA).map(([n, r]) => `${n}: ${r.toFixed(2)}`)).toEqual([])
  })

  it('reads the pills and the tile text from the source', () => {
    expect(pills().map((p) => p.name)).toEqual(['met', 'partially', 'missed', 'not_found', 'too_vague', 'not_yet_due'])
    expect(strip).toContain('text-ink">{chg === null')
    expect(pairs(light).length).toBe(pairs(dark).length)
  })

  it('reproduces the failures it was written for, on the old colours', () => {
    const was: Record<string, RGB> = { ...light, up: rgb('#15803d') }
    expect(ratio(was.up, was.raised).toFixed(2)).toBe('4.29')
    expect(ratio(was.up, over(was.up, 0.12, was.surface)).toFixed(2)).toBe('4.27')
    expect(ratio(was.up, over(was.up, 0.12, was.bg)).toFixed(2)).toBe('3.94')
    expect(ratio(dark['ink-2'], over(dark.up, 0.26, dark.surface))).toBeLessThan(AA)     // the tile's old text, dark mode
  })
})
