import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Timeline } from '../company'
import { plainHeadline as p } from '../plain'

describe('plainHeadline', () => {
  it('management changes lead with the person', () => {
    expect(p('Resignation of Mr. P N Vasudevan as Managing Director & CEO of the company w.e.f. October 29, 2026')).toBe('P N Vasudevan resigns as MD & CEO, effective 29 Oct 2026')
    expect(p('Appointment of Ms Rinkoo Somani as Chief Financial Officer of the company w.e.f. October 27, 2026')).toBe('Rinkoo Somani appointed as CFO, effective 27 Oct 2026')
    expect(p('Appointment of Mr Vineet Taneja as an Additional Non-Executive Independent Director of the Company of the company w.e.f. October 24, 2026')).toBe('Vineet Taneja appointed as Additional Non-Executive Independent Director, effective 24 Oct 2026')
  })
  it('strips letter boilerplate', () => {
    expect(p('Transcript of Earnings Conference Call on financial results for the quarter and half year ended September 30, 2026')).toBe('Earnings call transcript: quarter and half year to 30 Sep 2026')
    expect(p('Please find enclosed the Press Release on the performance of the Company for the quarter and half year ended 30th September 2026')).toBe('Press release: quarter and half year to 30 Sep 2026')
    expect(p('Press Release titled Bajaj Electricals Announces Evolution Of Board Leadership')).toBe('Press release: Bajaj Electricals Announces Evolution Of Board Leadership')
  })
  it('keeps the dividend figure', () => {
    expect(p('Board of Directors at its meeting held on October 28, 2026, declared Interim Dividend of Rs. 3 per equity share')).toBe('Interim dividend of Rs. 3 per share declared')
    expect(p('The Board of Directors at their meeting held today i.e., 29th October 2026, has, inter alia, approved the payment of interim dividend of Rs. 5.75 (Rupees five and paise seventy-…')).toBe('Interim dividend of Rs. 5.75 approved')
  })
  it('leaves anything it does not recognise alone', () => {
    const s = 'NCLAT allowed the appeal filed by the company and set aside the order of NCLT Ahmedabad Bench.'
    expect(p(s)).toBe(s)
    expect(p('PAT ₹29,250 cr, +32.1% YoY; revenue +28.6%')).toBe('PAT ₹29,250 cr, +32.1% YoY; revenue +28.6%')
  })
  it('on every recorded headline: no number appears that was not in the original, and it never grows', () => {
    const tl = JSON.parse(readFileSync(join(__dirname, '../../public/demo/timeline.json'), 'utf8')) as Timeline
    const nums = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, ''))
    const heads = new Set(Object.values(tl).flat().map((r) => r.headline))
    expect(heads.size).toBeGreaterThan(50)
    for (const h of heads) {
      const out = p(h)
      for (const n of nums(out)) expect(nums(h), `${n} in "${out}" from "${h}"`).toContain(n)
      expect(out.length, h).toBeLessThanOrEqual(h.length)
    }
  })
})
