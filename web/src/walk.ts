import type { Walk, WalkGap } from './api'
import * as fig from './fig'

/**
 * The words of a guidance walk. Arithmetic only: what was said, what was delivered, and the gap. No word here says why,
 * and a test runs every walk against a list of intent words.
 */
export const title = (w: Walk) => (w.label.includes(w.due) ? w.label : `${w.label}, ${w.due}`)

/** "KAYNES · Consolidated revenue, FY26": a walk's name wherever it stands, since a row can open with the company off screen. */
export const named = (w: Walk) => `${w.symbol} · ${title(w)}`

export const delivered = (w: Walk) => (w.delivered ? (w.unit === '%' ? fig.margin(w.delivered.value) : fig.croreAmount(w.delivered.value)) : '')

const gap = (g: WalkGap) => (g.kind === 'points' ? fig.points(g.value) : `${fig.ofTarget(g.value)} of target`)

const against = (g: WalkGap, which: string) => (g.kind === 'points' ? `${fig.points(g.value)} on ${which}` : `${fig.ofTarget(g.value)} of ${which}`)

export const statedOnCall = (w: Walk) => w.delivered?.source === 'transcript'

/** The one line a walk leads with. */
export function lead(w: Walk): string {
  if (w.group === 'held_delivered') {
    const stated = statedOnCall(w) ? ', stated on call' : ''
    return `Held on ${w.steps.length} calls: ${fig.target(w.steps[0], w.unit)}. Delivered ${delivered(w)}, ${gap(w.vs_first!)}${stated}`
  }
  if (w.group === 'revised_delivered') return `${against(w.vs_first!, 'the first promise')}, ${against(w.vs_last!, 'the last statement')}`
  return `Revised on the ${lastRevision(w)} call. Not yet due`
}

export const lastRevision = (w: Walk) => [...w.steps].reverse().find((s) => s.change === 'revised')?.call ?? w.steps[0].call

/** The whole walk on one line, for the front door. */
export const trail = (w: Walk) => [...w.steps.map((s) => fig.target(s, w.unit)), ...(w.delivered ? [delivered(w)] : [])].join(' → ')
