import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTheme, saveTheme, THEME_COLOR, THEME_KEY } from '../theme'

const web = join(__dirname, '../..')
const html = readFileSync(join(web, 'index.html'), 'utf8')
const css = readFileSync(join(web, 'src/index.css'), 'utf8')

describe('theme', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is dark for a new visitor, whatever the phone says', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(loadTheme()).toBe('dark')
    expect(css).not.toContain('prefers-color-scheme')
    expect(html).not.toContain('prefers-color-scheme')
  })

  it('a saved choice wins, and junk reads as dark', () => {
    for (const [saved, shown] of [['light', 'light'], ['dark', 'dark'], ['junk', 'dark']] as const) {
      vi.stubGlobal('localStorage', { getItem: () => saved })
      expect(loadTheme()).toBe(shown)
    }
  })

  it('works when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(loadTheme()).toBe('dark')
    expect(() => saveTheme('light')).not.toThrow()
  })

  it('the script that runs before first paint agrees with the app', () => {
    const head = html.slice(0, html.indexOf('</head>'))
    expect(html).toContain('<html lang="en" data-theme="dark">')
    expect(head).toContain(`content="${THEME_COLOR.dark}"`)
    const script = head.slice(head.indexOf('<script>'), head.indexOf('</script>'))
    expect(script).toContain(`'${THEME_KEY}'`)
    expect(script).toContain(THEME_COLOR.light)
    expect(script).toMatch(/try\s*\{[\s\S]*\}\s*catch/)
    expect(head.indexOf('theme-color')).toBeLessThan(head.indexOf('<script>'))
  })

  it('the colours match the page ground in each theme', () => {
    const ground = (block: string) => block.match(/--bg:\s*(#[0-9a-f]{6})/)![1]
    expect(ground(css.slice(css.indexOf(':root {')))).toBe(THEME_COLOR.light)
    expect(ground(css.slice(css.indexOf(':root[data-theme="dark"]')))).toBe(THEME_COLOR.dark)
  })
})
