import type { ResearchEntry } from '../api'
import { verdictLine } from '../format'
import { Icon } from './Icon'

/** Promised vs delivered, one row per recorded company. Counts of verdicts, never a single score. */
export function ResearchHome({ entries, book, onOpen }: { entries: ResearchEntry[]; book: Set<string>; onOpen: (sym: string) => void }) {
  return (
    <main>
      <h1 className="text-title font-semibold text-ink">Promised vs delivered</h1>
      <p className="text-meta text-ink-3">
        Management's guidance over the last four quarters, against what it reported. Transcripts and annual reports only.
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-ink-2">No research recorded in this build.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {entries.map((r) => (
            <li key={r.symbol}>
              <button onClick={() => onOpen(r.symbol)} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink">{r.symbol}</span>
                  <span className="text-meta text-ink-3"> · {r.name || r.symbol}{book.has(r.symbol) ? ' · in your book' : ''}</span>
                  <span className="mt-0.5 block text-ink-2">{verdictLine(r.counts)}</span>
                </span>
                <Icon name="chevron" className="text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
