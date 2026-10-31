import type { ResultRow, Results } from '../api'

const inr = (v: number | null) =>
  v === null ? '–' : v.toLocaleString('en-IN', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 })

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-3" title="Not meaningful: missing figure or a loss in the base period">n.m.</span>
  return <span className={v < 0 ? 'text-hot' : 'text-good'}>{v > 0 ? '+' : v < 0 ? '−' : ''}{Math.abs(v).toFixed(1)}%</span>
}

function Row({ label, row, note }: { label: string; row: ResultRow | null; note?: string }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-1.5 pr-2 text-left font-medium text-ink-2">{label}</th>
      {row ? (
        <>
          <td className="py-1.5 text-right font-semibold text-ink">{inr(row.current)}</td>
          <td className="py-1.5 text-right"><Pct v={row.qoq_pct} /></td>
          <td className="py-1.5 text-right"><Pct v={row.yoy_pct} /></td>
        </>
      ) : (
        <td colSpan={3} className="py-1.5 text-right text-ink-3">{note}</td>
      )}
    </tr>
  )
}

/** Revenue, EBITDA, PBT, PAT: this quarter, QoQ and YoY. Figures were matched on the cited page; maths is ours. */
export function ResultsTable({ r }: { r: Results }) {
  if (r.status !== 'extracted') {
    return <p className="mt-3 rounded-xl bg-raised p-3 text-xs leading-snug text-ink-2">{r.note}. Open the filing for the figures.</p>
  }
  const source = (
    <a href={r.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap underline underline-offset-4">p.{r.page} ↗</a>
  )
  if (r.confidence === 'low') {
    return (
      <p className="mt-3 rounded-xl bg-raised p-3 text-xs leading-snug text-ink-2">
        <span className="font-semibold text-ink">Low confidence, figures not shown.</span> {r.confidence_note} Check the table on {source}.
      </p>
    )
  }
  return (
    <div className="mt-3 rounded-xl bg-raised p-3">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-ink-3">
        <span>
          <span className="font-semibold uppercase tracking-wide text-ink-2">{r.basis}</span> · {r.unit} · qtr to {r.quarter}
        </span>
        {source}
      </div>
      <table className="tabular mt-1.5 w-full text-xs">
        <thead>
          <tr className="text-[11px] text-ink-3">
            <th className="pb-1 text-left font-normal"><span className="sr-only">Metric</span></th>
            <th className="pb-1 text-right font-normal">This qtr</th>
            <th className="pb-1 text-right font-normal">QoQ</th>
            <th className="pb-1 text-right font-normal">YoY</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Revenue" row={r.rows.revenue} />
          <Row label="EBITDA" row={r.rows.ebitda} note={r.lender ? 'n/a for lenders' : '–'} />
          <Row label="PBT" row={r.rows.pbt} />
          <Row label="PAT" row={r.rows.pat} />
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">
        {r.margins.ebitda !== null && <>EBITDA margin {r.margins.ebitda}% · </>}
        {r.margins.pat !== null && <>PAT margin {r.margins.pat}% · </>}
        {!r.lender && 'EBITDA = PBT + finance costs + D&A − other income, computed by FINN. '}
        {r.confidence === 'medium' && <span className="text-warn">Medium confidence: {r.confidence_note}</span>}
      </p>
    </div>
  )
}
