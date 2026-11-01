import { describe, expect, it } from 'vitest'
import { swipeDismisses, swipeMayStart } from '../swipe'

describe('swipe', () => {
  it('leaves the left edge to the iOS back gesture', () => {
    expect(swipeMayStart(10)).toBe(false)
    expect(swipeMayStart(23)).toBe(false)
    expect(swipeMayStart(24)).toBe(true)
  })
  it('dismisses left only', () => {
    expect(swipeDismisses(200, 100, 375)).toBe(false)
    expect(swipeDismisses(-80, 500, 375)).toBe(true)
  })
  it('asks for less on a small screen', () => {
    expect(swipeDismisses(-65, 800, 320)).toBe(true)
    expect(swipeDismisses(-65, 800, 430)).toBe(false)
  })
  it('accepts a fast flick but not a slow nudge', () => {
    expect(swipeDismisses(-40, 50, 375)).toBe(true)
    expect(swipeDismisses(-40, 500, 375)).toBe(false)
  })
})
