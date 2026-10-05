import { useId } from 'react'

export function AppWordmark({ label }: { label: string }) {
  return <strong className="app-wordmark">{label}<svg viewBox="0 0 180 10" aria-hidden="true"><path d="M3 5c40-4 77 3 110 0s45-1 63 1M9 8c47-1 97 1 150-2" /></svg></strong>
}

const STAR = 'M31 5L39 24 59 25 44 38 49 58 31 47 13 58 18 38 3 25 23 23Z'

/** Two imperfect outlines and clipped pencil strokes, rather than a solid icon. */
export function DoodleStar({ filled = false, className = '' }: { filled?: boolean; className?: string }) {
  const clipId = useId()
  return <svg className={`doodle-star ${className}`} viewBox="0 0 64 64" aria-hidden="true">
    {filled && <>
      <defs><clipPath id={clipId}><path d={STAR} /></clipPath></defs>
      <path d={STAR} fill="currentColor" opacity=".15" stroke="none" />
      <g clipPath={`url(#${clipId})`} opacity=".65" strokeWidth="2.3">
        {Array.from({ length: 19 }, (_, i) => <path key={i} d={`M${-25 + i * 5} 64Q${5 + i * 4} 31 ${26 + i * 5} 0`} />)}
        <path d="M8 32l37-12-27 23 29-10-22 20 16-4M24 19l12 15-9 13" opacity=".5" />
      </g>
    </>}
    <path d={STAR} fill="none" strokeWidth="2.7" />
    <path d="M30 6l10 19 18 1-15 12 5 19-17-9-17 10 3-19L4 26l20-2z" fill="none" strokeWidth="1.2" opacity=".45" />
  </svg>
}
