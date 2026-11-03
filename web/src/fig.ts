/**
 * Every number and date the app writes, in one place, so a figure can't read one way on one screen and another way on the
 * next. Nothing here calculates: it only writes down what it's given. A test fails on a raw format anywhere else.
 */
const IST = 'Asia/Kolkata'
const LOCALE = 'en-IN'
const MINUS = '−'    // U+2212, the width of a plus, never a hyphen

export type Sign = 'up' | 'down' | 'none'

export const MISSING = '–'
export const NOT_MEANINGFUL = 'n.m.'
export const CRORE_UNIT = '₹ crore'
export const MILLION_UNIT = '₹ million'

/** One decimal, and no sign on what rounds to zero: "−0.0%" says more than the number does. Colour takes the same sign, so it can't disagree. */
export function pctChange(n: number): { text: string; sign: Sign } {
  const t = Math.abs(n).toFixed(1)
  if (t === '0.0') return { text: `${t}%`, sign: 'none' }
  return n > 0 ? { text: `+${t}%`, sign: 'up' } : { text: `${MINUS}${t}%`, sign: 'down' }
}

export const pct = (n: number) => pctChange(n).text

/** A share of revenue: always one decimal, so 17.0% and 8.8% line up. */
export const margin = (n: number) => `${n.toFixed(1)}%`

/** Volume against its average: whole from 10× up, else one decimal. */
export const multiple = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(1)}×`

/** A setting or a count, as it stands: "solid at 2×", "Revised 2×". Not a measurement, so no decimals are added. */
export const times = (n: number) => `${n}×`

/** The investor's price line: "±4%". */
export const plusMinusPct = (n: number) => `±${n}%`

/** A close. Paise under ₹1,000, where they're a visible share of the price; whole rupees from there up. */
export function price(n: number): string {
  const rupees = Math.round(n * 100) / 100
  const digits = rupees >= 1000 ? 0 : 2
  return `₹${rupees.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** ₹ crore in Indian grouping, without the unit: whole from 100 up, else up to one decimal. */
export function crore(v: number | null): string {
  if (v === null) return MISSING
  const t = Math.abs(v).toLocaleString(LOCALE, { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 })
  return v < 0 ? `${MINUS}${t}` : t
}

/** "₹3,626 cr". */
export const croreAmount = (v: number) => `₹${crore(v)} cr`

/** Delivered against a margin or growth target, in percentage points: "+1.2 pts". */
export function points(n: number): string {
  const t = Math.abs(n).toFixed(1)
  return t === '0.0' ? `${t} pts` : `${n > 0 ? '+' : MINUS}${t} pts`
}

/** Delivered as a share of an amount target: "80.6%". */
export const ofTarget = (n: number) => `${n.toFixed(1)}%`

/** What management said, as it said it: "₹1,000 cr+", "27%", "about ₹4,000 cr minimum", "₹3,500–4,000 cr". Stated figures keep their own decimals. */
export function target(t: { low: number; high: number | null; floor: boolean; about: boolean }, unit: '%' | 'crore'): string {
  const write = (s: string) => (unit === '%' ? `${s}%` : `₹${s} cr`)
  const n = (v: number) => (unit === '%' ? String(v) : crore(v))
  if (t.high !== null) return write(`${n(t.low)}–${n(t.high)}`)
  const one = write(n(t.low))
  if (t.about) return t.floor ? `about ${one} minimum` : `about ${one}`
  return t.floor ? `${one}+` : one
}

export const usd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)

/** "Sep 2026 qtr", from the quarter's end. Where the label isn't a date FINN can read, the filing's own words. */
export const period = (end: string | null | undefined, label: string) => (end ? `${end} qtr` : `qtr to ${label}`)

/** Which table the figures came from, always said beside them. */
export const basis = (b: 'consolidated' | 'standalone' | 'unknown' | string) => b

// en-IN writes September as "Sept"; every other label here, the quarters included, uses three letters.
const threeLetterMonth = (s: string) => s.replace('Sept', 'Sep')

/** Always an explicit time in IST, never "6h ago": this is a recording, and relative time would read as live. */
export function clock(ts: string): string {
  return threeLetterMonth(new Date(ts).toLocaleString(LOCALE, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST,
  }))
}

/** "30 Oct" from an ISO date or timestamp. */
export function day(ts: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ts) ? `${ts}T12:00:00+05:30` : ts
  return threeLetterMonth(new Date(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', timeZone: IST }))
}

/** "1 Nov 2026". */
export const dayYear = (ts: string) =>
  threeLetterMonth(new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }))

const MONTH_PRINTED = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const ORDINAL = '(?:st|nd|rd|th)?'
const PRINTED_DATE = new RegExp(`\\b(?:${MONTH_PRINTED} (\\d{1,2})${ORDINAL},? (\\d{4})|(\\d{1,2}) ?${ORDINAL}[ -]${MONTH_PRINTED}\\.?,?[ -](\\d{4}))\\b`, 'gi')
const MONTH_INDEX = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Dates as filings print them ("October 30, 2026", "26 th October, 2026", "03-Nov-2026") written as `day` writes them.
 * The year goes only when it's the year of the filing: "effective 1 Apr" filed in October would read as a date gone by.
 * With no filing date to compare with, it stays. Anything that isn't a real date is left as printed.
 */
export function printedDates(text: string, filed?: string): string {
  return text.replace(PRINTED_DATE, (whole, monA, dayA, yearA, dayB, monB, yearB) => {
    const [mon, d, y] = monA ? [monA, +dayA, yearA] : [monB, +dayB, yearB]
    const m = MONTH_INDEX.indexOf(mon.slice(0, 3).toLowerCase())
    if (new Date(Date.UTC(+y, m, d)).getUTCDate() !== d) return whole
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return filed?.startsWith(y) ? day(iso) : dayYear(`${iso}T12:00:00+05:30`)
  })
}

/** "Sunday 11 Oct", from an ISO date. */
export const weekdayDay = (iso: string) =>
  threeLetterMonth(new Date(`${iso}T12:00:00+05:30`).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short', timeZone: IST }).replace(',', ''))

/** Today's date in IST as YYYY-MM-DD. */
export const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: IST })

/** "PAT ₹29,250 cr, +32.1% YoY; revenue +28.6% YoY (Sep 2026 qtr, consolidated)" to "PAT ₹29,250 cr (Sep 2026 qtr, consolidated)". */
export const headlineFigureOnly = (headline: string) => headline.replace(/^(PAT ₹[\d,.−]+ cr)[,;].*?( \([^)]*\))?$/, '$1$2')

/** The same headline without the PAT change, for a row that shows that change beside it. */
export const headlineWithoutYoY = (headline: string) => headline.replace(/, [+−][\d.]+% YoY/, '')
