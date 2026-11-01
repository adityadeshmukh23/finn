import { useMemo, useState } from 'react'
import { STATIC, type Card, type ResearchEntry } from '../api'
import { filingsAsOf, latestPeople, latestResults, material, routine, sessionIndexFor, sessionsAsOf, type TimelineItem } from '../company'
import { CATEGORY_LABEL, clock, dayMonth, verdictLine } from '../format'
import type { Session } from '../market'
import { CompanyChart } from './CompanyChart'
import { Icon } from './Icon'
import { People } from './People'
import { ResultsTable } from './ResultsTable'
import { Sheet } from './Sheet'

const category = (c: string) => CATEGORY_LABEL[c] ?? c

function FilingRow({ it }: { it: TimelineItem }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-meta text-ink-3"><span className="font-semibold text-ink-2">{category(it.category)}</span> · {clock(it.ts)}</span>
        <span className="block text-ink">{it.headline}</span>
        {it.read && <span className="block text-meta text-ink-3">Summary checked against p.{it.read.page} of the filing</span>}
      </span>
      {it.url && <Icon name="external" size={14} className="mt-1 text-ink-3" />}
    </>
  )
  return (
    <li>
      {it.url
        ? <a href={it.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-start gap-3 py-2.5">{body}</a>
        : <div className="flex min-h-11 items-start gap-3 py-2.5">{body}</div>}
    </li>
  )
}

interface Props {
  symbol: string
  name: string
  card: Card | null
  filings: TimelineItem[] | null    // null: the timeline file failed to load
  sessions: Session[] | undefined
  end: string
  since: string | null
  volX: number
  research: ResearchEntry | undefined
  onResearch: () => void
  onClose: () => void
}

/** Everything FINN verifiably holds on one company, as of the briefing's date. Sections with no data don't render. */
export function CompanySheet({ symbol, name, card, filings, sessions, end, since, volX, research, onResearch, onClose }: Props) {
  const [showRoutine, setShowRoutine] = useState(false)
  const past = useMemo(() => (filings ? filingsAsOf(filings, end) : []), [filings, end])
  const closes = useMemo(() => sessionsAsOf(sessions, end), [sessions, end])
  const last = closes[closes.length - 1]
  const keep = material(past), quiet = routine(past)

  const byIndex = useMemo(() => {
    const m = new Map<number, TimelineItem[]>()
    for (const it of keep) {
      const i = sessionIndexFor(it.ts, closes)
      if (i !== null) m.set(i, [...(m.get(i) ?? []), it])
    }
    return m
  }, [keep, closes])

  const fromCard = card ? [card.lead, ...card.items].filter((it) => it.category !== 'market') : []
  const leadRead = card?.lead.read ?? null
  const resultsAt = latestResults(past)
  const results = card?.results && card.lead.category === 'results' ? card.results : resultsAt?.results
  const peopleAt = latestPeople(past)
  const people = card?.people?.length ? card.people : peopleAt?.people

  return (
    <Sheet title={symbol} onClose={onClose}>
      <p className="-mt-2 text-meta text-ink-3">{name}{card?.sector ? ` · ${card.sector}` : ''}</p>

      {last ? (
        <section className="mt-3">
          <CompanyChart sessions={closes} markers={new Set(byIndex.keys())} volX={volX}
                        labelFor={(i) => [...new Set((byIndex.get(i) ?? []).map((it) => category(it.category)))].join(', ') || null} />
        </section>
      ) : (
        <p className="mt-3 text-ink-2">No price data for {symbol} up to this date.</p>
      )}

      {leadRead && card && (
        <section className="mt-5">
          <h3 className="font-semibold text-ink">{category(card.lead.category)}, {dayMonth(card.lead.ts)}</h3>
          <p className="mt-1 text-ink">{card.lead.headline}</p>
          <blockquote className="mt-2 border-l-2 border-line pl-3 italic text-ink-2">“{leadRead.quote}”</blockquote>
          <a href={`${card.lead.url}#page=${leadRead.page}`} target="_blank" rel="noopener noreferrer"
             className="inline-flex min-h-11 min-w-11 items-center gap-1 text-meta text-ink-3 underline underline-offset-4">
            Checked against p.{leadRead.page}<Icon name="external" size={12} />
          </a>
        </section>
      )}

      {results && (
        <section className="mt-5">
          <h3 className="font-semibold text-ink">Latest results{resultsAt ? `, filed ${dayMonth(resultsAt.ts)}` : ''}</h3>
          <ResultsTable r={results} />
        </section>
      )}

      {people && people.length > 0 && (
        <section className="mt-5">
          <h3 className="font-semibold text-ink">Latest management change{peopleAt ? `, filed ${dayMonth(peopleAt.ts)}` : ''}</h3>
          <People people={people} />
        </section>
      )}

      {research && (
        <section className="mt-5">
          <button onClick={onResearch} className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-raised p-3 text-left">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Promised vs delivered</span>
              <span className="block text-ink-2">{verdictLine(research.counts)}</span>
            </span>
            <Icon name="chevron" className="text-ink-3" />
          </button>
        </section>
      )}

      <section className="mt-5">
        <h3 className="font-semibold text-ink">
          {filings === null ? 'Filings' : keep.length === 0 && quiet.length === 0
            ? `No filings${since ? ` since ${dayMonth(since)}` : ''}`
            : `${keep.length} material ${keep.length === 1 ? 'filing' : 'filings'}${since ? ` since ${dayMonth(since)}` : ''}`}
        </h3>
        {filings === null && (fromCard.length > 0
          ? <ul className="divide-y divide-line">{fromCard.map((it) => <FilingRow key={it.id} it={it} />)}</ul>
          : <p className="mt-1 text-ink-2">The filings list didn't load in this session.</p>)}
        {keep.length > 0 && <ul className="divide-y divide-line">{keep.map((it) => <FilingRow key={it.id} it={it} />)}</ul>}
        {quiet.length > 0 && (
          <>
            <button onClick={() => setShowRoutine(!showRoutine)} aria-expanded={showRoutine}
                    className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-line text-left text-ink-2">
              {quiet.length} routine {quiet.length === 1 ? 'filing' : 'filings'} hidden
              <Icon name="down" size={14} className={showRoutine ? 'rotate-180' : ''} />
            </button>
            {showRoutine && <ul className="divide-y divide-line">{quiet.map((it) => <FilingRow key={it.id} it={it} />)}</ul>}
          </>
        )}
      </section>

      {!research && (
        <p className="mt-5 text-meta text-ink-3">
          Promised vs delivered isn't recorded for {symbol} in this {STATIC ? 'demo' : 'build yet'}. Locally: <code>./run.sh research {symbol}</code>
        </p>
      )}
    </Sheet>
  )
}
