export const CATEGORY_LABEL: Record<string, string> = {
  management_change: 'Management',
  results: 'Results',
  'M&A': 'M&A',
  litigation: 'Legal',
  credit_rating: 'Rating',
  pledging: 'Pledge',
  fund_raise: 'Fund raise',
  capex: 'Capex',
  press_release: 'News',
  earnings_call: 'Concall',
  dividend: 'Dividend',
  bonus_split: 'Bonus / split',
  insider_trading: 'Insider',
  investor_meetings: 'Meetings',
  agm_egm: 'AGM',
  unclassified: 'Other',
  market: 'Price / volume',
}

const IST = 'Asia/Kolkata'

/** Always an explicit time, never "6h ago": this is a recording, and relative time would read as live. */
export function clock(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST,
  })
}

/** "30 Oct" from an ISO date or timestamp. */
export function dayMonth(ts: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ts) ? `${ts}T12:00:00+05:30` : ts
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST })
}

/** Counts of verdicts, led by what was checked. "Met 0 of 1" hid that the one was partially met. */
export function verdictLine(c: { met: number; partially: number; missed: number; too_vague: number }): string {
  const checkable = c.met + c.partially + c.missed
  if (checkable === 0) return c.too_vague > 0 ? `No checkable promise yet, ${c.too_vague} too vague` : 'No checkable promise yet'
  const parts = [c.met && `${c.met} met`, c.partially && `${c.partially} partially`, c.missed && `${c.missed} missed`].filter(Boolean)
  return `${parts.join(', ')}, of ${checkable} checkable`
}

export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST })
}

export const usd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)
