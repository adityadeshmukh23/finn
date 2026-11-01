import { expect, it } from 'vitest'
import { tidyDate } from '../components/People'

it('joins ordinals that PDF extraction split', () => {
  expect(tidyDate('26 th October, 2026')).toBe('26th October, 2026')
  expect(tidyDate('October 27, 2026')).toBe('October 27, 2026')
})
