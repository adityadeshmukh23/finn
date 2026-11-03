import { useMemo, useState } from 'react'
import type { Card, ResearchEntry } from '../api'
import { filedForSession, filingsAsOf, groupSameDay, latestPeople, latestResults, material, routine, sessionsAsOf, type FilingGroup, type TimelineItem } from '../company'
import { CATEGORY_LABEL, verdictLine } from '../format'
import type { Session } from '../market'
import { CompanyChart } from './CompanyChart'
import { filingLine } from '../plain'
import { Icon } from './Icon'
import { People } from './People'
import { ResultsTable } from './ResultsTable'
import { Sheet } from './Sheet'
import * as fig from '../fig'

const category = (c: string) => CATEGORY_LABEL[c] ?? c

function GroupRow({ g }: { g: FilingGroup }) {
  const [open, setOpen] = useState(false)
  if (g.items.length === 1) return <FilingRow it={g.items[0]} />
  return (
    <li>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-11 w-full items-start gap-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-meta text-ink-3"><span className="font-semibold text-ink-2">{category(g.category)}</span> · {fig.day(g.day)} · {g.items.length} filings</span>
          <span className="block text-ink">{filingLine(g.lead)}</span>
        </span>
        <Icon name="down" size={14} className={`mt-1 text-ink-3 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <ul className="mb-2 divide-y divide-line border-l-2 border-line pl-3">{g.items.map((it) => <FilingRow key={it.id} it={it} />)}</ul>}
    </li>
  )
}

function FilingRow({ it }: { it: TimelineItem }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-meta text-ink-3"><span className="font-semibold text-ink-2">{category(it.category)}</span> · {fig.clock(it.ts)}</span>
        <span className="block text-ink">{filingLine(it)}</span>
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
  sector: string
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
export function CompanySheet({ symbol, name, sector, card, filings, sessions, end, since, volX, research, onResearch, onClose }: Props) {
  const [showRoutine, setShowRoutine] = useState(false)
  const past = useMemo(() => (filings ? filingsAsOf(filings, end) : []), [filings, end])
  const closes = useMemo(() => sessionsAsOf(sessions, end), [sessions, end])
  const last = closes[closes.length - 1]
  const keep = material(past), quiet = routine(past)

  const byIndex = useMemo(() => {
    const m = new Map<number, TimelineItem[]>()
    closes.forEach((s, i) => {
      const filed = filedForSession(keep, sessions, s[0])
      if (filed.length) m.set(i, filed)
    })
    return m
  }, [keep, closes, sessions])

  const fromCard = card ? [card.lead, ...card.items].filter((it) => it.category !== 'market') : []
  const leadRead = card?.lead.read ?? null
  const resultsAt = latestResults(past)
  const results = card?.results && card.lead.category === 'results' ? card.results : resultsAt?.results
  const peopleAt = latestPeople(past)
  const people = card?.people?.length ? card.people : peopleAt?.people

  return (
    <Sheet title={symbol} onClose={onClose}>
      <p className="-mt-2 text-meta text-ink-3">{name}{sector ? ` · ${sector}` : ''}</p>

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
          <h3 className="font-semibold text-ink">{category(card.lead.category)}, {fig.day(card.lead.ts)}</h3>
          <p className="mt-1 text-ink">{filingLine(card.lead)}</p>
          <blockquote className="mt-2 border-l-2 border-line pl-3 italic text-ink-2">“{leadRead.quote}”</blockquote>
          <a href={`${card.lead.url}#page=${leadRead.page}`} target="_blank" rel="noopener noreferrer"
             className="inline-flex min-h-11 min-w-11 items-center gap-1 text-meta text-ink-3 underline underline-offset-4">
            Checked against p.{leadRead.page}<Icon name="external" size={12} />
          </a>
        </section>
      )}

      {results && (
        <section className="mt-5">
          <h3 className="font-semibold text-ink">Latest results{resultsAt ? `, filed ${fig.day(resultsAt.ts)}` : ''}</h3>
          <ResultsTable r={results} />
        </section>
      )}

      {people && people.length > 0 && (
        <section className="mt-5">
          <h3 className="font-semibold text-ink">Latest management change{peopleAt ? `, filed ${fig.day(peopleAt.ts)}` : ''}</h3>
          <People people={people} filed={card?.people?.length ? card.lead.ts : peopleAt?.ts} />
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
            ? `No filings${since ? ` since ${fig.day(since)}` : ''}`
            : `${keep.length} material ${keep.length === 1 ? 'filing' : 'filings'}${since ? ` since ${fig.day(since)}` : ''}`}
        </h3>
        {filings === null && (fromCard.length > 0
          ? <ul className="divide-y divide-line">{fromCard.map((it) => <FilingRow key={it.id} it={it} />)}</ul>
          : <p className="mt-1 text-ink-2">The filings list didn't load in this session.</p>)}
        {keep.length > 0 && <ul className="divide-y divide-line">{groupSameDay(keep).map((g) => <GroupRow key={`${g.day}${g.category}`} g={g} />)}</ul>}
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
        <section className="mt-5">
          <h3 className="font-semibold text-ink">Management's promises aren't checked yet</h3>
          <p className="mt-1 text-ink-2">FINN hasn't read {name}'s earnings calls yet, so there is no promised vs delivered view.</p>
        </section>
      )}
    </Sheet>
  )
}
