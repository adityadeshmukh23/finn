import type { Person } from '../api'
import { Icon } from './Icon'

const VERB: Record<Person['change'], string> = {
  appointed: 'joins as', resigned: 'resigns as', ceased: 'steps down as', retiring: 'retires as',
  're-designated': 'becomes', 're-appointed': 're-appointed as',
}

// PDF extraction splits ordinals: "26 th October". A display fix only; the filing's own date is unchanged.
export const tidyDate = (s: string) => s.replace(/(\d)\s+(st|nd|rd|th)\b/g, '$1$2')

/** Who, which role, from when, why: copied from the filing and checked against its text. */
export function People({ people, max = 3 }: { people: Person[]; max?: number }) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  return (
    <ul className="mt-1 space-y-2 rounded-xl bg-raised px-3 pt-3">
      {shown.map((p) => (
        <li key={`${p.person}-${p.change}`}>
          <p className="text-ink">
            <span className="font-semibold">{p.person}</span> {VERB[p.change]} {p.role}
            {p.effective && <span className="text-ink-3">, effective {tidyDate(p.effective)}</span>}
          </p>
          {p.reason && <p className="mt-0.5 text-meta text-ink-2">Reason given: “{p.reason}”</p>}
          {p.profile && <p className="mt-0.5 text-meta text-ink-2">Background (from the filing): {p.profile}</p>}
          <a href={p.url} target="_blank" rel="noopener noreferrer"
             className="inline-flex min-h-11 min-w-11 items-center gap-1 text-meta text-ink-3 underline underline-offset-4">p.{p.page}<Icon name="external" size={12} /></a>
        </li>
      ))}
      {people.length > max && <li className="pb-3 text-meta text-ink-3">+{people.length - max} more changes in the filings</li>}
    </ul>
  )
}
