import type { ResultRow, Results } from '../api'
import { plainNote } from '../format'
import { Icon } from './Icon'
import * as fig from '../fig'

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-3" title="Not meaningful: missing figure or a loss in the base period">{fig.NOT_MEANINGFUL}</span>
  const { text, sign } = fig.pctChange(v)
  return <span className={sign === 'down' ? 'text-down' : sign === 'up' ? 'text-up' : 'text-ink'}>{text}</span>
}

function Row({ label, row, note }: { label: string; row: ResultRow | null; note?: string }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-1.5 text-left font-normal text-ink-2">{label}</th>
      {row ? (
        <>
          <td className="whitespace-nowrap py-1.5 pl-2 text-right font-semibold text-ink">{fig.crore(row.current)}</td>
          <td className="whitespace-nowrap py-1.5 pl-2 text-right"><Pct v={row.qoq_pct} /></td>
          <td className="whitespace-nowrap py-1.5 pl-2 text-right"><Pct v={row.yoy_pct} /></td>
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
    return <p className="mt-1 rounded-xl bg-raised p-3 text-ink-2">{plainNote(r.note)}. The filing has the figures.</p>
  }
  const source = (
    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center justify-end gap-1 whitespace-nowrap underline underline-offset-4">p.{r.page}<Icon name="external" size={12} /></a>
  )
  if (r.confidence === 'low') {
    return (
      <div className="mt-1 rounded-xl bg-raised px-3 pt-3 text-ink-2">
        <p className="font-semibold text-flag">Low confidence, figures withheld</p>
        <p>{plainNote(r.confidence_note)}</p>
        <p className="text-meta text-ink-3">The table is on {source}</p>
      </div>
    )
  }
  return (
    <div className="mt-1 rounded-xl bg-raised px-2.5 pb-3 min-[360px]:px-3">
      <div className="flex items-center justify-between gap-2 text-meta text-ink-3">
        <span><span className="font-semibold capitalize text-ink-2">{fig.basis(r.basis)}</span> · {r.unit} · {fig.period(r.period, r.quarter)}</span>
        {source}
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-meta text-ink-3">
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
      <p className="mt-2 text-meta text-ink-3">
        {r.margins.ebitda !== null && <>EBITDA margin {fig.margin(r.margins.ebitda)} · </>}
        {r.margins.pat !== null && <>PAT margin {fig.margin(r.margins.pat)} · </>}
        {r.revenue_how && <>Revenue is the {r.revenue_how}. </>}
        {!r.lender && 'EBITDA = PBT + finance costs + D&A − other income, computed by FINN. '}
        {r.confidence === 'medium' && <span className="text-flag">Medium confidence: {plainNote(r.confidence_note)}</span>}
      </p>
    </div>
  )
}
