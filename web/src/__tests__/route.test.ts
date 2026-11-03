import { describe, expect, it } from 'vitest'
import { parseHash } from '../route'

describe('parseHash', () => {
  it('routes tabs', () => {
    expect(parseHash('')).toEqual({ tab: 'today', symbol: null })
    expect(parseHash('#book').tab).toBe('book')
    expect(parseHash('#alerts').tab).toBe('alerts')
    expect(parseHash('#research')).toEqual({ tab: 'research', symbol: null })
  })
  it('keeps research deep links working', () => {
    expect(parseHash('#research/bel')).toEqual({ tab: 'research', symbol: 'BEL' })
  })
  it('a walk link names its row, and its id keeps its case', () => {
    expect(parseHash('#research/KAYNES/PQ1FY26-1')).toEqual({ tab: 'research', symbol: 'KAYNES', row: 'PQ1FY26-1' })
  })
  it('falls back to Today on junk', () => expect(parseHash('#nope').tab).toBe('today'))
})
