/** A reviewer's way through the app in about two minutes. All of it is recorded data, and each step only opens something the app already has. */
export type TourAction = { kind: 'file'; symbol: string } | { kind: 'go'; hash: string } | { kind: 'ledger' }

export const TOUR: { text: string; action: TourAction }[] = [
  { text: "Open Equitas's file. Its results table was unreadable, so FINN withholds the figures and links the page.", action: { kind: 'file', symbol: 'EQUITASBNK' } },
  { text: 'Open the Kaynes walk: one target followed from call to call. Tap a page link.', action: { kind: 'go', hash: '#research/KAYNES/PQ1FY26-1' } },
  { text: "Open Reliance's file and read the results table's basis and period labels.", action: { kind: 'file', symbol: 'RELIANCE' } },
  { text: 'On Alerts, change a threshold and see which holdings cross it in the recorded closes.', action: { kind: 'go', hash: '#alerts' } },
  { text: 'Open How this was built. This copy replays recordings at $0.00, and a local run has the full cost ledger.', action: { kind: 'ledger' } },
]
