import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every number the app writes goes through fig.ts, so one screen can't format a figure differently from the next.
 * Numbers that aren't figures are named here, with the reason. A named exception that no longer matches fails too.
 */
const src = join(__dirname, '..')

const EXCEPTIONS: [file: string, text: string, why: string][] = [
  ['components/CompanyChart.tsx', '`${i ? \'L\' : \'M\'}${x(i).toFixed(1)} ${y(s[1]).toFixed(1)}`', 'SVG coordinates, never read by anyone'],
  ['components/GuidanceWalk.tsx', 'const at = (n: number) => n.toFixed(1)', 'SVG coordinates, never read by anyone'],
  ['components/CompanyChart.tsx', 'left: `${xPct}%`', 'CSS position'],
  ['components/CompanyChart.tsx', 'top: `${topPct}%`', 'CSS position'],
  ['components/CompanyChart.tsx', "translateX(-50%)", 'CSS position'],
  ['components/Research.tsx', 'at least 80% of a growth', 'the rule itself, in words, and not a figure from a filing'],
  ['components/Research.tsx', 'at least 80% of it', 'the same rule, in words, beside a verdict it explains'],
  ['components/BookStrip.tsx', '${share}%, var(--surface)', 'CSS colour mix'],
  ['components/LedgerSheet.tsx', 'width: `${Math.min(100, (data.spent_usd / data.budget_usd) * 100)}%`', 'CSS width of a bar'],
]

const RAW = [/\.toFixed\(/, /\.toLocale\w*\(/, /\bIntl\./, /[₹×]/, /\}%/, /\d%/]

/** Comments may quote a figure; code may not write one. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

function sources(dir = src): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '__tests__') return []
    if (e.isDirectory()) return sources(join(dir, e.name))
    return /\.tsx?$/.test(e.name) && e.name !== 'fig.ts' ? [join(dir, e.name)] : []
  })
}

function violations(file: string, text: string): string[] {
  let body = code(text)
  for (const [f, allowed] of EXCEPTIONS) if (f === file) body = body.replace(allowed, '')
  return body.split('\n').flatMap((line, i) => (RAW.some((r) => r.test(line)) ? [`${file}:${i + 1} ${line.trim()}`] : []))
}

describe('figures go through fig.ts', () => {
  it('no raw number format anywhere else', () => {
    expect(sources().flatMap((p) => violations(relative(src, p), readFileSync(p, 'utf8')))).toEqual([])
  })

  it('every named exception still exists', () => {
    for (const [file, text] of EXCEPTIONS) expect(code(readFileSync(join(src, file), 'utf8')), file).toContain(text)
  })

  it('catches each kind of raw format', () => {
    for (const bad of ['n.toFixed(1)', "n.toLocaleString('en-IN')", 'new Intl.NumberFormat()', '`₹${n}`', '`${n}×`', '`${n}%`', '<>{n}%</>'.replace('{n}', '{v}'), '"12%"']) {
      expect(violations('x.tsx', `const a = ${bad}`), bad).toHaveLength(1)
    }
    expect(violations('x.tsx', '// "₹872.7" is how it used to read\nconst a = 1')).toEqual([])
  })
})
