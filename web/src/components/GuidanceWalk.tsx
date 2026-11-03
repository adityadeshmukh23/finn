import { useEffect, useRef, useState } from 'react'
import type { Walk, WalkStep } from '../api'
import * as fig from '../fig'
import { delivered, statedOnCall } from '../walk'
import { Icon } from './Icon'

export function Quote({ text }: { text: string }) {
  return <blockquote className="border-l-2 border-line pl-3 italic text-ink-2">“{text}”</blockquote>
}

const at = (n: number) => n.toFixed(1)
const H = 112, TOP = 34, BOTTOM = 84, AXIS = 106, EDGE = 5, STUB = 66, CHAR = 6.8, LINE = 15, CLEAR = 8

interface Mark { x: number; y: number; text: string; width: number }

/** Upper labels step clear of the next one when two sit at one level and would touch. */
function clearOfNext(marks: Mark[]) {
  for (let i = marks.length - 2; i >= 0; i--) {
    const a = marks[i], b = marks[i + 1]
    if (Math.abs(a.y - b.y) < LINE && a.x + a.width > b.x) a.y = b.y - LINE
  }
}

/** The target as a stepped line, drawn only where it changed. One axis, in ink, so a colour can't read as a verdict. The scale doesn't start at zero; every level prints its figure. */
function StepLine({ walk }: { walk: Walk }) {
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(326)
  useEffect(() => {
    if (!box.current) return
    const seen = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    seen.observe(box.current)
    return () => seen.disconnect()
  }, [])

  const d = walk.delivered
  const levels = [...walk.steps.map((s) => s.low), ...(d ? [d.value] : [])]
  const all = [...levels, ...walk.steps.flatMap((s) => (s.high === null ? [] : [s.high]))]
  const lo = Math.min(...all), hi = Math.max(...all)
  // A small move shouldn't fill the chart: the scale spans at least a tenth of the largest figure.
  const span = Math.max(hi - lo, hi * 0.1)
  const floor = lo - (span - (hi - lo)) / 2
  const y = (v: number) => BOTTOM - ((v - floor) * (BOTTOM - TOP)) / span
  const run = (W - 2 * EDGE - (d ? 0 : STUB)) / levels.length
  const x = (i: number) => EDGE + i * run
  const end = x(levels.length)
  const path = levels.map((v, i) => `${i ? `V${at(y(v))}` : `M${at(x(0))} ${at(y(v))}`}H${at(x(i + 1))}`).join('')

  const marks: Mark[] = walk.steps.map((s, i) => {
    const text = fig.target(s, walk.unit)
    return { x: x(i) + CLEAR, y: y(s.high ?? s.low) - 8, text, width: text.length * CHAR }
  })
  if (d) marks.push({ x: x(walk.steps.length) + CLEAR, y: y(d.value) - 8, text: delivered(walk), width: delivered(walk).length * CHAR })
  clearOfNext(marks)
  const said = `${marks.map((m) => m.text).join(', then ')}${d ? '' : ', not yet due'}`

  return (
    <div ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={said}>
        {walk.steps.map((s, i) => s.high !== null && (
          <rect key={i} x={x(i)} width={run} y={y(s.high)} height={y(s.low) - y(s.high)} fill="currentColor" className="text-ink" fillOpacity={0.1} />
        ))}
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-ink" />
        {!d && <path d={`M${at(end)} ${at(y(levels[levels.length - 1]))}H${W - EDGE}`} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="2 5" className="text-ink-3" />}
        {levels.map((v, i) => {
          const last = !!d && i === levels.length - 1
          return <circle key={i} cx={x(i)} cy={y(v)} r={last ? 5 : 4} strokeWidth={2} stroke="currentColor" className={`text-ink ${last ? 'fill-ink' : 'fill-surface'}`} />
        })}
        {marks.map((m) => (
          <text key={m.x} x={Math.min(m.x, W - EDGE - m.width)} y={m.y} className="fill-ink text-meta font-semibold">{m.text}</text>
        ))}
        {walk.steps.map((s, i) => <text key={s.doc} x={x(i)} y={AXIS} className="fill-ink-3 text-meta">{s.call}</text>)}
        {d && <text x={x(walk.steps.length)} y={AXIS} className="fill-ink-3 text-meta">{d.source === 'annual_report' ? 'Reported' : 'Stated'}</text>}
        {!d && <text x={W - EDGE} y={AXIS} textAnchor="end" className="fill-ink-3 text-meta">Not yet due</text>}
      </svg>
    </div>
  )
}

function Row({ value, who, chip, body, page, url }: { value: string; who: string; chip: string | null; body: React.ReactNode; page: number; url: string }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <div className="flex min-h-11 items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{value}</span>
          <span className="block text-meta text-ink-3">{who}</span>
        </span>
        {chip && (
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="min-h-11 min-w-11 shrink-0 text-meta text-ink-2 underline underline-offset-4">{chip}</button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer"
           className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end gap-0.5 whitespace-nowrap text-meta text-ink-2 underline underline-offset-4">p.{page}<Icon name="external" size={12} /></a>
      </div>
      {open && <div className="mb-2 space-y-1">{body}</div>}
    </li>
  )
}

const stepWho = (s: WalkStep) => `${s.call} · ${s.speaker || 'Speaker not recorded'}`

function Delivered({ walk }: { walk: Walk }) {
  const d = walk.delivered!
  const who = statedOnCall(walk) ? `Stated on ${d.title.replace(' earnings call', ' call')} · ${d.speaker || 'Speaker not recorded'}` : d.title
  const working = d.workings?.map((x) => `${x.label} ${fig.croreAmount(x.value)}`).join(' and ')
  return (
    <Row value={`Delivered ${delivered(walk)}`} who={who} chip={d.quote ? 'Quote' : working ? 'Working' : null} page={d.page} url={d.url} body={
      <>
        {d.quote && <Quote text={d.quote} />}
        {d.printed_in && <p className="text-meta text-ink-3">Printed in {d.printed_in === 'million' ? fig.MILLION_UNIT : d.printed_in}: {d.period}, then the year before, after the note number.</p>}
        {working && <p className="text-ink-2">Worked out from {working}.</p>}
      </>
    } />
  )
}

function Steps({ walk }: { walk: Walk }) {
  return (
    <ul className="mt-1 divide-y divide-line border-t border-line">
      {walk.steps.map((s) => (
        <Row key={`${s.doc}-${s.page}`} value={fig.target(s, walk.unit)} who={stepWho(s)} chip="Quote" page={s.page} url={s.url} body={<Quote text={s.quote} />} />
      ))}
      {walk.delivered && <Delivered walk={walk} />}
    </ul>
  )
}

/** One promise followed call by call. The line appears only where a target changed; a target that held is the sentence above, with its steps a tap away. */
export function GuidanceWalk({ walk }: { walk: Walk }) {
  const [steps, setSteps] = useState(false)
  if (walk.group !== 'held_delivered') {
    return <div className="mt-1"><StepLine walk={walk} /><Steps walk={walk} /></div>
  }
  return (
    <div>
      <button onClick={() => setSteps(!steps)} aria-expanded={steps} className="flex min-h-11 items-center gap-1 text-meta text-ink-2 underline underline-offset-4">
        Quotes, speakers and pages<Icon name="down" size={12} className={steps ? 'rotate-180' : ''} />
      </button>
      {steps && <Steps walk={walk} />}
    </div>
  )
}
