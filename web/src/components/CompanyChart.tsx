import { useState } from 'react'
import { dayMonth } from '../format'
import { fmtPct, fmtX, type Session } from '../market'

const W = 340, CLOSE_H = 108, LABEL_ROOM = 24, GAP = 10, VOL_H = 40, H = CLOSE_H + GAP + VOL_H, PAD = 8

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`

function PriceLabel({ text, xPct, topPct }: { text: string; xPct: number; topPct: number }) {
  const side = xPct < 20 ? { left: 0 } : xPct > 80 ? { right: 0 } : { left: `${xPct}%`, transform: 'translateX(-50%)' }
  return <span className="pointer-events-none absolute whitespace-nowrap text-meta text-ink-3" style={{ top: `${topPct}%`, ...side }}>{text}</span>
}

/**
 * Close and volume multiple as two aligned panels, one axis each. Dots are material filings on the close
 * they belong to. Tap or drag to read a session; the figure above follows it, starting at the latest.
 */
export function CompanyChart({ sessions, markers, volX, labelFor }: {
  sessions: Session[]; markers: Set<number>; volX: number; labelFor: (i: number) => string | null
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const n = sessions.length
  const at = picked ?? n - 1
  const closes = sessions.map((s) => s[1])
  const lo = Math.min(...closes), hi = Math.max(...closes)
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1))
  const y = (c: number) => (hi === lo ? CLOSE_H / 2 : LABEL_ROOM + ((hi - c) * (CLOSE_H - 2 * LABEL_ROOM)) / (hi - lo))
  const vols = sessions.map((s) => s[3] ?? 0)
  const vMax = Math.max(...vols, volX, 1)
  const vh = (v: number) => (v / vMax) * (VOL_H - 2)
  const barW = Math.max(2, (W - 2 * PAD) / n - 3)
  const path = sessions.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s[1]).toFixed(1)}`).join(' ')
  const [date, close, chg, vx] = sessions[at]
  const filed = labelFor(at)

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPicked(Math.max(0, Math.min(n - 1, Math.round((((e.clientX - r.left) / r.width) * W - PAD) / ((W - 2 * PAD) / Math.max(1, n - 1))))))
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setPicked(Math.max(0, at - 1))
    if (e.key === 'ArrowRight') setPicked(Math.min(n - 1, at + 1))
  }

  return (
    <div>
      <p aria-live="polite">
        <span className={`text-figure font-semibold ${chg === null ? 'text-ink' : chg < 0 ? 'text-down' : chg > 0 ? 'text-up' : 'text-ink'}`}>
          {chg === null ? money(close) : fmtPct(chg)}
        </span>
        <span className="ml-2 text-meta text-ink-3">
          {dayMonth(date)} close{chg !== null && `, ${money(close)}`}{vx !== null && `, ${fmtX(vx)} volume`}
        </span>
      </p>
      <p className="min-h-[18px] text-meta text-ink-3">{filed && `Filed since the previous close: ${filed}`}</p>
      <div className="relative mt-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full select-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" style={{ touchAction: 'pan-y' }} tabIndex={0} onKeyDown={onKey}
           role="img" aria-label={`Close over ${n} sessions, low ${money(lo)}, high ${money(hi)}. Use arrow keys to read a session.`}
           onPointerDown={pick} onPointerMove={(e) => { if (e.buttons || e.pointerType !== 'mouse') pick(e) }}>
        <line x1={x(at)} x2={x(at)} y1={0} y2={H} stroke="var(--line)" strokeWidth={1} />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {[...markers].map((i) => (
          <circle key={i} cx={x(i)} cy={y(closes[i])} r={4} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        {!markers.has(at) && <circle cx={x(at)} cy={y(close)} r={3} fill="var(--ink)" />}
        <g transform={`translate(0 ${CLOSE_H + GAP})`}>
          {vols.map((v, i) => {
            const h = Math.max(1.5, vh(v))
            return <rect key={i} x={x(i) - barW / 2} y={VOL_H - h} width={barW} height={h} rx={Math.min(2, barW / 2)}
                         fill={v >= volX ? 'var(--ink)' : 'var(--ink-3)'} opacity={v >= volX ? 1 : 0.45} />
          })}
          <line x1={0} x2={W} y1={VOL_H} y2={VOL_H} stroke="var(--line)" strokeWidth={1} />
        </g>
      </svg>
      {/* The line never goes above its high or below its low, so these two can't collide with it. */}
      <PriceLabel text={`High ${money(hi)}`} xPct={(x(closes.indexOf(hi)) / W) * 100} topPct={0} />
      <PriceLabel text={`Low ${money(lo)}`} xPct={(x(closes.indexOf(lo)) / W) * 100} topPct={((CLOSE_H - LABEL_ROOM + 2) / H) * 100} />
      </div>
      <p className="mt-0.5 flex justify-between text-meta text-ink-3"><span>{dayMonth(sessions[0][0])}</span><span>{dayMonth(sessions[n - 1][0])}</span></p>
      <p className="mt-1 text-meta text-ink-3">
        {n} {n === 1 ? 'session' : 'sessions'}. Bars are volume against the 20-session average, solid at {volX}× or more, faint below it.
        {markers.size > 0 && ' Dots are material filings.'}
      </p>
    </div>
  )
}
