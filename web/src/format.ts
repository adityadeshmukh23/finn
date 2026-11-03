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

/** Counts of verdicts, led by what was checked. "Met 0 of 1" hid that the one was partially met. */
export function verdictLine(c: { met: number; partially: number; missed: number; too_vague: number }): string {
  const checkable = c.met + c.partially + c.missed
  if (checkable === 0) return c.too_vague > 0 ? `No checkable promise yet, ${c.too_vague} too vague` : 'No checkable promise yet'
  const parts = [c.met && `${c.met} met`, c.partially && `${c.partially} partially`, c.missed && `${c.missed} missed`].filter(Boolean)
  return `${parts.join(', ')}, of ${checkable} checkable`
}

/** Recorded results notes, in an investor's words. The recordings stay as they were written. */
export function plainNote(note: string): string {
  if (/^Model found no quarterly table/i.test(note)) return "FINN couldn't find a quarterly table in the pages it read"
  if (/scanned image/i.test(note)) return "The results PDF is a scanned image, so FINN couldn't read the figures"
  const m = note.match(/^(\d+) figure\(s\) not found on the page were dropped\.$/)
  if (m) return `${m[1]} ${m[1] === '1' ? "figure isn't" : "figures aren't"} shown because FINN couldn't find ${m[1] === '1' ? 'it' : 'them'} on the page.`
  return note
}
