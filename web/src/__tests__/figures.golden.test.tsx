import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// Every toggle that starts closed starts open, so the figures behind a tap are rendered too. No DOM library, no production props.
const toggles = vi.hoisted(() => ({ open: false }))
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return { ...react, useState: (init: unknown) => react.useState(init === false && toggles.open ? true : init) }
})

import { applyAlerts, DEFAULT_PREFS } from '../alerts'
import type { Digest, Research as R } from '../api'
import type { Timeline } from '../company'
import type { Market } from '../market'
import { Alerts } from '../components/Alerts'
import { Book } from '../components/Book'
import { CompanySheet } from '../components/CompanySheet'
import { Scorecard } from '../components/Research'
import { ResearchHome } from '../components/ResearchHome'
import { Today } from '../components/Today'
import { WindowSheet } from '../components/WindowSheet'

/**
 * Every number the app can show, on every recording. A formatting or visual commit must leave this unchanged unless its
 * message lists the change. To see what changed: GOLDEN_DUMP=/path/tokens.json vitest run figures.golden, before and after.
 * To accept a listed change: GOLDEN_UPDATE=1 vitest run figures.golden. It can't catch a wrong read: that's the results audit.
 */
const demo = join(__dirname, '../../public/demo')
const GOLDEN = join(__dirname, 'figures.golden.json')
const read = <T,>(f: string) => JSON.parse(readFileSync(join(demo, f), 'utf8')) as T
const market = read<Market>('market.json')
const timeline = read<Timeline>('timeline.json')
const noop = () => {}

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)'
const TOKEN = new RegExp(`[+−±$₹-]*\\d[\\d,.:]*(?:\\s?(?:%|×|cr\\b|am\\b|pm\\b|${MONTH}\\b))?|n\\.m\\.|–`, 'g')
const ENTITY: Record<string, string> = { '&amp;': '&', '&#x27;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>' }

/** The numbers a reader or a screen reader meets, in order: text, aria-label and title. Not coordinates, classes or links. */
function tokens(markup: string): string[] {
  const said = markup.replace(/<[^>]*>/g, (tag) => ` ${[...tag.matchAll(/\b(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1]).join(' ')} `)
  const text = said.replace(/&[#\w]+;/g, (e) => ENTITY[e] ?? ' ')
  return text.match(TOKEN) ?? []
}

function render(screens: Record<string, string[]>, key: string, ...views: [boolean, ReactElement][]) {
  screens[key] = views.flatMap(([open, view]) => {
    toggles.open = open
    return tokens(renderToStaticMarkup(view))
  })
  toggles.open = false
}

function briefing(screens: Record<string, string[]>, f: string) {
  const raw = read<Digest>(f)
  const view = applyAlerts(raw, DEFAULT_PREFS, market)
  const key = f.replace(/^digest-|\.json$/g, '')
  const today = (density: 'compact' | 'detailed') => (
    <Today chip={null} density={density} data={raw} view={view} market={market} timeline={timeline} hours={24} onHours={noop} day={null}
           loading={false} error={null} onReload={noop} customised={false} dismissed={new Set()} onDismiss={noop} onRestore={noop}
           onAsk={noop} onOpen={noop} onLedger={noop} onBook={noop} onHowTo={noop} />
  )
  render(screens, `${key}/today`, [false, today('compact')], [true, today('compact')], [false, today('detailed')], [true, today('detailed')])
  render(screens, `${key}/book`, [false, <Book chip={null} view={view} market={market} timeline={timeline} onOpen={noop} />])
  render(screens, `${key}/alerts`, [false, <Alerts chip={null} prefs={DEFAULT_PREFS} onChange={noop} cards={view.cards} onOpen={noop} />])
  render(screens, `${key}/window`, [false, (
    <WindowSheet data={raw} view={view} market={market} manifest={null} researched={[]} latestDay={null} hours={24} onHours={noop} asOf={null} onAsOf={noop}
                 loading={false} refreshing={false} onRefresh={noop} onClose={noop} />
  )])
  render(screens, `${key}/files`, ...Object.keys(view.names).map((symbol): [boolean, ReactElement] => [true, (
    <CompanySheet symbol={symbol} name={view.names[symbol]} sector="" card={view.cards.find((c) => c.symbol === symbol) ?? null} filings={timeline[symbol] ?? []}
                  sessions={market.sessions[symbol]} end={view.window.end} since={null} volX={DEFAULT_PREFS.volX} research={undefined} onResearch={noop} onClose={noop} />
  )]))
}

function everyScreen() {
  const screens: Record<string, string[]> = {}
  const files = readdirSync(demo).filter((f) => f.startsWith('digest-')).sort()
  files.forEach((f) => briefing(screens, f))
  const index = read<{ companies?: unknown[] }>('research/index.json')
  const entries = (Array.isArray(index) ? index : index.companies ?? []) as Parameters<typeof ResearchHome>[0]['entries']
  render(screens, 'research/home', [false, <ResearchHome entries={entries} book={new Set()} onOpen={noop} />])
  const scorecards = readdirSync(join(demo, 'research')).filter((f) => f !== 'index.json').sort()
  for (const f of scorecards) {
    const data = read<R>(`research/${f}`)
    render(screens, `research/${f.replace('.json', '')}`, [false, <Scorecard data={data} />], [true, <Scorecard data={data} />])
  }
  return { screens, briefings: files.length, scorecards: scorecards.length }
}

const hash = (t: string[]) => createHash('sha256').update(t.join('\n')).digest('hex').slice(0, 16)

describe('figures golden', () => {
  it('every number on every screen is unchanged, over all 66 briefings and 5 scorecards', () => {
    const { screens, briefings, scorecards } = everyScreen()
    expect([briefings, scorecards]).toEqual([66, 5])
    const all = Object.values(screens).flat()
    // A golden over nothing proves nothing: each kind of figure has to be in it.
    for (const unit of [/%$/, /×$/, /^₹/, /cr$/, /^n\.m\.$/, /pm$/, /Oct$/]) expect(all.some((t) => unit.test(t)), String(unit)).toBe(true)
    if (process.env.GOLDEN_DUMP) writeFileSync(process.env.GOLDEN_DUMP, JSON.stringify(screens))
    const now = Object.fromEntries(Object.entries(screens).map(([k, t]) => [k, hash(t)]))
    if (process.env.GOLDEN_UPDATE) writeFileSync(GOLDEN, `${JSON.stringify(now, null, 0).replace(/,"/g, ',\n"')}\n`)
    expect(existsSync(GOLDEN), 'run with GOLDEN_UPDATE=1 once').toBe(true)
    const was = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>
    expect(Object.keys(now).filter((k) => now[k] !== was[k])).toEqual([])
    expect(Object.keys(now).length).toBe(Object.keys(was).length)
  }, 120_000)

  it('reads numbers from text and labels, not from markup', () => {
    expect(tokens('<svg viewBox="0 0 340 170"><path d="M8.0 12.5"/></svg><span class="w-12" aria-label="BEL, −6.3% on 30 Oct">+32.1%</span> ₹872.7 42× ₹29,250 cr n.m. 8:29 pm'))
      .toEqual(['−6.3%', '30 Oct', '+32.1%', '₹872.7', '42×', '₹29,250 cr', 'n.m.', '8:29 pm'])
  })
})
