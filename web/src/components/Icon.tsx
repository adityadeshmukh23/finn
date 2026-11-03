/** The whole icon set: inline SVG, 1.5 px stroke, inherits text colour. No icon font, no emoji. */
const PATHS = {
  today: 'M4 6h16M4 12h16M4 18h10',
  book: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  research: 'M6 3h9l4 4v5M15 3v4h4M6 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5M16.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 19l2.5 2.5',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 21h4',
  check: 'M5 12.5 10 17.5 19.5 7',
  bookmark: 'M7 4h10v16.5l-5-3.5-5 3.5V4Z',
  close: 'M6 6l12 12M18 6 6 18',
  external: 'M14 5h5v5M19 5l-8.5 8.5M17 14v5H5V7h5',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  down: 'M6 9l6 6 6-6',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.5v.5',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <path d={PATHS[name]} />
    </svg>
  )
}
