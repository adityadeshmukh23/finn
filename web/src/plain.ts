/**
 * Short plain headlines from NSE's filing subjects. Display only: the link still opens the filing.
 * A rule fires only on a shape it fully understands, keeps every name and figure, and otherwise leaves the text alone.
 */
const MONTHS: Record<string, string> = { january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', may: 'May', june: 'Jun', july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec' }
const MONTH = Object.keys(MONTHS).join('|')
const US_DATE = new RegExp(`\\b(${MONTH}) (\\d{1,2}), (\\d{4})\\b`, 'i')
const DAY_DATE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (${MONTH}),? (\\d{4})\\b`, 'i')

function shortDate(s: string): string {
  const us = s.match(US_DATE)
  if (us) return s.replace(US_DATE, `${+us[2]} ${MONTHS[us[1].toLowerCase()]} ${us[3]}`)
  const d = s.match(DAY_DATE)
  if (d) return s.replace(DAY_DATE, `${+d[1]} ${MONTHS[d[2].toLowerCase()]} ${d[3]}`)
  return s
}

const shortRole = (r: string) => r
  .replace(/^an? /i, '')
  .replace(/\s+of the company$/i, '')
  .replace(/Managing Director (?:&|and) (?:CEO|Chief Executive Officer)/i, 'MD & CEO')
  .replace(/Chief Financial Officer/i, 'CFO')
  .replace(/Chief Executive Officer/i, 'CEO')

const TITLE = '(?:(?:Mr|Ms|Mrs|Smt|Shri|Dr)\\.? )?'
const CHANGE = new RegExp(`^(Appointment|Resignation) of ${TITLE}([^,()]+?) as (.+?) of the company w\\.e\\.f\\. (.+)$`, 'i')
const CALL = /^Transcript of Earnings Conference Call on financial results for the (.+?) ended (.+)$/i
const RELEASE = /^(?:Investor )?Press Release on the (?:Financial and Operational )?Performance of the Company for the (.+?) ended (.+)$/i
const TITLED = /^Press Release titled (.+)$/i
const PAID = /approved the payment of (interim|final|special) dividend of Rs\.? ?([\d.]*\d)/i
const DECLARED = /declared (Interim|Final|Special) Dividend of Rs\.? ?([\d.]*\d) per equity share/i

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function plainHeadline(raw: string): string {
  const h = raw.trim().replace(/^Please find enclosed (?:the )?/i, '')
  let m: RegExpMatchArray | null
  if ((m = h.match(CHANGE))) {
    const verb = m[1].toLowerCase() === 'appointment' ? 'appointed' : 'resigns as'
    return `${m[2]} ${verb}${verb === 'appointed' ? ' as' : ''} ${shortRole(m[3])}, effective ${shortDate(m[4])}`
  }
  if ((m = h.match(CALL))) return `Earnings call transcript: ${m[1]} to ${shortDate(m[2])}`
  if ((m = h.match(RELEASE))) return `Press release: ${m[1]} to ${shortDate(m[2])}`
  if ((m = h.match(TITLED))) return `Press release: ${m[1]}`
  if ((m = h.match(PAID))) return `${cap(m[1].toLowerCase())} dividend of Rs. ${m[2]} approved`
  if ((m = h.match(DECLARED))) return `${cap(m[1].toLowerCase())} dividend of Rs. ${m[2]} per share declared`
  return cap(h)
}
