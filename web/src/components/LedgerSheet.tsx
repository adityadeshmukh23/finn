import { useEffect, useState } from 'react'
import { fetchLedger, STATIC, type Ledger } from '../api'
import { usd } from '../format'
import { Sheet } from './Sheet'

export function LedgerSheet({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Ledger | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!STATIC) fetchLedger().then(setData).catch((e) => setErr(e.message))
  }, [])

  if (STATIC) {
    return (
      <Sheet title="Cost ledger" onClose={onClose}>
        <p className="text-figure font-semibold text-ink">$0.00</p>
        <p className="mt-1 text-ink-2">
          Replay mode makes no model calls and holds no API key. The briefing is ranked by rules, so it costs nothing to build.
        </p>
        <p className="mt-3 text-meta text-ink-3">
          Run FINN locally to see the live ledger: every model call with its tokens, cost, the free-tier limits and the $5 hard cap.
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet title="Cost ledger" onClose={onClose}>
      {err && <p className="text-flag">Couldn't load the ledger: {err}</p>}
      {!data && !err && <div className="skeleton h-24" />}
      {data && (
        <div className="space-y-5">
          <div>
            <p className="text-figure font-semibold text-ink">{usd(data.spent_usd)}</p>
            <p className="text-ink-2">spent of the {usd(data.budget_usd)} hard cap</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-ink-2" style={{ width: `${Math.min(100, (data.spent_usd / data.budget_usd) * 100)}%` }} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-raised p-3">
              <dt className="text-ink-3">Mode</dt>
              <dd className="font-semibold text-ink">{data.mode === 'live' ? 'Live model calls' : 'Mock / recorded'}</dd>
            </div>
            <div className="rounded-xl bg-raised p-3">
              <dt className="text-ink-3">Today</dt>
              <dd className="font-semibold text-ink">{data.today.live_calls} calls · {usd(data.today.usd)}</dd>
            </div>
          </dl>
          <ul className="space-y-2">
            {data.slots.map((s) => (
              <li key={s.slot} className="flex items-baseline justify-between gap-3">
                <span className="text-ink-2">
                  <span className="font-semibold capitalize text-ink">{s.slot}</span> · {s.model}
                  {s.free && <span className="text-ink-3"> · free tier</span>}
                  {!s.live && <span className="text-ink-3"> · no key, mock</span>}
                </span>
                <span className="whitespace-nowrap text-ink">{s.calls_today}{s.rpd ? ` / ${s.rpd}` : ''} today</span>
              </li>
            ))}
          </ul>
          {data.by_purpose.length === 0 ? (
            <p className="text-ink-2">
              No live model calls yet. The briefing is ranked by rules, so it costs nothing to build.
            </p>
          ) : (
            <table className="w-full">
              <thead className="text-left text-ink-3">
                <tr><th className="pb-2 font-medium">Task</th><th className="pb-2 font-medium">Model</th><th className="pb-2 text-right font-medium">Calls</th><th className="pb-2 text-right font-medium">Cost</th></tr>
              </thead>
              <tbody>
                {data.by_purpose.map((r) => (
                  <tr key={r.purpose + r.model} className="border-t border-line">
                    <td className="py-2 text-ink">{r.purpose}</td>
                    <td className="py-2 text-ink-2">{r.model.replace('claude-', '')}</td>
                    <td className="py-2 text-right text-ink">{r.calls}</td>
                    <td className="py-2 text-right text-ink">{usd(r.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.by_source.recorded && (
            <p className="text-meta text-ink-3">{data.by_source.recorded.calls} answers replayed from recordings at no cost.</p>
          )}
          {data.public_demo && (
            <p className="text-meta text-ink-3">Public demo: live analysis is rate-limited per visitor and per day.</p>
          )}
        </div>
      )}
    </Sheet>
  )
}
