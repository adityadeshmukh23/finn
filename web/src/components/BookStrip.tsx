import type { Digest } from '../api'
import type { Timeline } from '../company'
import { sessionAt, type Market } from '../market'
import { filingCount } from './Book'
import * as fig from '../fig'

const FULL_TINT_AT_PCT = 6     // a 6% day takes the strongest tint
const MAX_TINT = 26            // percent of the sign colour mixed into the tile

/** Tint for a day's move: red or green by sign, stronger the bigger it is. The number is always printed too. */
export function tileTint(chg: number | null): string | undefined {
  if (!chg) return undefined
  const share = Math.round((Math.min(Math.abs(chg), FULL_TINT_AT_PCT) / FULL_TINT_AT_PCT) * MAX_TINT)
  return `color-mix(in srgb, var(--${chg < 0 ? 'down' : 'up'}) ${share}%, var(--surface))`
}

/** The whole book in one swipeable row, biggest move first, so what's off screen matters least. */
export function BookStrip({ view, market, timeline, onOpen }: { view: Digest; market: Market | null; timeline: Timeline | null; onOpen: (sym: string) => void }) {
  const end = view.window.end
  const tiles = Object.keys(view.names).map((symbol) => ({
    symbol, session: market ? sessionAt(market.sessions[symbol], end) : null, filings: filingCount(view, symbol, timeline),
  })).sort((a, b) => Math.abs(b.session?.[2] ?? 0) - Math.abs(a.session?.[2] ?? 0))
  return (
    <ul aria-label="Your book, biggest move first" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tiles.map(({ symbol, session, filings }) => {
        const chg = session?.[2] ?? null
        return (
          <li key={symbol} className="shrink-0">
            <button onClick={() => onOpen(symbol)} style={{ backgroundColor: tileTint(chg) }}
                    aria-label={`${symbol}, ${chg === null ? 'no price' : `${fig.pct(chg)} on ${fig.day(session![0])}`}${filings ? `, ${filings} ${filings === 1 ? 'filing' : 'filings'}` : ''}`}
                    className="relative block min-h-11 min-w-11 rounded-lg border border-line py-0.5 pl-2 pr-3.5 text-left text-meta">
              <span className="block font-semibold text-ink">{symbol}</span>
              <span className="block text-ink-2">{chg === null ? 'n/a' : fig.pct(chg)}</span>
              {filings > 0 && <span aria-hidden="true" className="absolute right-1 bottom-1.5 h-1.5 w-1.5 rounded-full bg-ink" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
