import type { Person } from '../api'

const VERB: Record<Person['change'], string> = {
  appointed: 'joins as', resigned: 'resigns as', ceased: 'steps down as', retiring: 'retires as',
  're-designated': 'becomes', 're-appointed': 're-appointed as',
}
const EXIT = new Set(['resigned', 'ceased', 'retiring'])

/** Who, which role, from when, why: copied from the filing and checked against its text. */
export function People({ people, max = 3 }: { people: Person[]; max?: number }) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  return (
    <ul className="mt-3 space-y-2.5 rounded-xl bg-raised p-3">
      {shown.map((p) => (
        <li key={`${p.person}-${p.change}`} className="text-xs leading-snug">
          <p className="text-ink">
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${EXIT.has(p.change) ? 'bg-hot' : 'bg-good'}`} />
            <span className="font-semibold">{p.person}</span> {VERB[p.change]} {p.role}
            {p.effective && <span className="text-ink-3">, effective {p.effective}</span>}
          </p>
          {p.reason && <p className="mt-0.5 pl-3 text-ink-2">Reason given: “{p.reason}”</p>}
          {p.profile && <p className="mt-0.5 pl-3 text-ink-2">Background (from the filing): {p.profile}</p>}
          <a href={p.url} target="_blank" rel="noopener noreferrer"
             className="mt-0.5 inline-block pl-3 text-ink-3 underline underline-offset-4">p.{p.page} ↗</a>
        </li>
      ))}
      {people.length > max && <li className="text-xs text-ink-3">+{people.length - max} more changes in the filings</li>}
    </ul>
  )
}
