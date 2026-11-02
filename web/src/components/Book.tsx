import type { ReactNode } from 'react'
import type { Digest } from '../api'
import { filingsInWindow, type Timeline } from '../company'
import { dayMonth } from '../format'
import { fmtPct, lastSessionBy, sessionAt, type Market } from '../market'
import { Icon } from './Icon'

/** Filings this holding made in the window, surfaced and hidden alike. The company file's list when it's loaded. */
export function filingCount(d: Digest, symbol: string, timeline: Timeline | null = null): number {
  if (timeline) return filingsInWindow(timeline[symbol], d.window.start, d.window.end).length
  const card = d.cards.find((c) => c.symbol === symbol)
  const surfaced = card && card.lead.category !== 'market' ? 1 + card.items.length + card.folded.length : 0
  const hidden = d.hidden.reduce((n, g) => n + g.items.filter((it) => it.symbol === symbol).length, 0)
  return surfaced + hidden
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`

/** The 18 holdings as a ledger: last close, day move, what was filed. Biggest move first. */
export function Book({ chip, view, market, timeline, onOpen }: { chip: ReactNode; view: Digest; market: Market | null; timeline: Timeline | null; onOpen: (sym: string) => void }) {
  const end = view.window.end
  const last = market ? lastSessionBy(market, end) : null
  const rows = Object.entries(view.names).map(([symbol, name]) => ({
    symbol, name, session: market ? sessionAt(market.sessions[symbol], end) : null, filings: filingCount(view, symbol, timeline),
  })).sort((a, b) => Math.abs(b.session?.[2] ?? 0) - Math.abs(a.session?.[2] ?? 0))

  return (
    <main>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-title font-semibold text-ink">Book</h1>
        {chip}
      </header>
      <p className="text-meta text-ink-3">
        {rows.length} holdings{last ? `, closes on ${dayMonth(last)}` : ''}. Biggest move first; filings are for this briefing's window. A mock portfolio.
      </p>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {rows.map((r) => {
          const chg = r.session?.[2] ?? null
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{r.symbol}</span>
                <span className="block truncate text-meta text-ink-3">
                  {r.name}{r.filings > 0 && ` · ${r.filings} ${r.filings === 1 ? 'filing' : 'filings'}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block font-semibold ${chg === null ? 'text-ink-3' : chg < 0 ? 'text-down' : chg > 0 ? 'text-up' : 'text-ink'}`}>
                  {chg === null ? 'n/a' : fmtPct(chg)}
                </span>
                <span className="block text-meta text-ink-3">{r.session ? inr(r.session[1]) : 'no price'}</span>
              </span>
            </>
          )
          return (
            <li key={r.symbol}>
              <button onClick={() => onOpen(r.symbol)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
                {body}<Icon name="chevron" className="text-ink-3" />
              </button>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
