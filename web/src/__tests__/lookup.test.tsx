import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Person } from '../api'
import { People } from '../components/People'
import { backgroundSearch } from '../lookup'

const person: Person = { person: 'A Name', role: 'CFO', change: 'appointed', effective: '', reason: 'SECRET REASON', profile: 'SECRET PROFILE', page: 3, url: 'https://example.com/f.pdf' }

describe('Look up background', () => {
  it('searches for the person and the company, and nothing else', () => {
    const url = new URL(backgroundSearch('P N Vasudevan', 'Equitas & Co'))
    expect(url.origin + url.pathname).toBe('https://www.google.com/search')
    expect([...url.searchParams.keys()]).toEqual(['q'])
    expect(url.searchParams.get('q')).toBe('P N Vasudevan Equitas & Co')
  })

  it('is a plain link in a new tab, and says FINN checked nothing', () => {
    const html = renderToStaticMarkup(<People people={[person]} company="Some Company" />)
    const link = html.match(/<a [^>]*google[^>]*>/)![0]
    expect(link).toContain('target="_blank"')
    expect(link).toContain('rel="noopener noreferrer"')
    expect(link).toContain('aria-label="Search the web for background on A Name; not checked by FINN"')
    expect(decodeURIComponent(link.match(/q=([^"]*)/)![1])).toBe('A Name Some Company')
    expect(link).not.toContain('SECRET')
    expect(html).toContain('Look up background')
    expect(html).toContain('not checked by FINN')
  })

  it('leaves the filing’s own profile showing', () => {
    expect(renderToStaticMarkup(<People people={[person]} company="Some Company" />)).toContain('Background (from the filing): SECRET PROFILE')
  })

  it('never fetches', () => {
    expect(String(backgroundSearch)).not.toMatch(/fetch|XMLHttp/)
  })
})
