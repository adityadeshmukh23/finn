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

export function when(ts: string, ref: Date): string {
  const t = new Date(ts)
  const mins = Math.round((ref.getTime() - t.getTime()) / 60000)
  if (mins >= 0 && mins < 60) return `${Math.max(mins, 1)}m ago`
  if (mins >= 0 && mins < 24 * 60) return `${Math.round(mins / 60)}h ago`
  return t.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST })
}

export function clock(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST,
  })
}

export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST })
}

export const usd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)
