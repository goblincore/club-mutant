import type { CSSProperties } from 'react'

export type BeastieKind = 'goblin' | 'moth' | 'troll' | 'imp'

/** Authored little inhabitants; stable IDs keep a friend's face consistent. */
export function WeeBeastie({ seed = 'hello', kind, className = '' }: { seed?: string; kind?: BeastieKind; className?: string }) {
  const raw = [...seed].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261)
  const hash = (raw ^ (raw >>> 16)) >>> 0
  const species = kind ?? (['goblin', 'moth', 'troll', 'imp'] as const)[hash % 4]
  return <svg viewBox="0 0 40 44" className={`wee-beastie wee-beastie-${species} ${className}`} aria-hidden="true" style={{ '--buddy-delay': `${-(hash % 8)}s` } as CSSProperties}>
    <ellipse cx="20" cy="41" rx="15" ry="2" fill="#58494e" opacity=".13" />
    <g stroke="#58494e" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      {species === 'goblin' && <>
        <path d="M12 34l-2 6 8-1 1-5m5 0 1 6 8-1-5-5" fill="#7a665a" />
        <path d="M11 24q9-6 18 0l3 11q-12 5-24 0Z" fill="#c88169" />
        <path d="M12 14L2 10l4 11 7 1m15-8 10-4-4 11-7 1" fill="#a3b982" />
        <path d="M11 11q10-7 18 1l-1 12q-8 8-16 0Z" fill="#b6ca93" />
        <path d="M10 12q1-10 15-10l-3 5 10 3-2 5Z" fill="#758cac" />
        <path d="M11 10l19 3m-12 13 6 1-3 2" fill="none" />
        <path d="M21 17l-3 6 9-2" fill="#b6ca93" />
        <path d="M21 27v2" stroke="#fff9e7" strokeWidth="2" />
        <path d="M11 26l18 8" fill="none" stroke="#e9d5a9" strokeWidth="3" />
        <path d="M24 29l10 1-1 8-10-1Z" fill="#d8b57d" />
        <path d="M25 31l4 3 4-2" fill="none" />
        <g className="beastie-eyes" fill="#58494e" stroke="none"><path d="M14 17h3v3h-3zm11 1h3v2h-3z" /></g>
      </>}
      {species === 'moth' && <>
        <path d="M17 21Q-2 7 4 28l10 6m9-13Q42 7 36 28l-10 6" fill="#ddd0e8" />
        <path d="M6 19l7 7m21-7-7 7" stroke="#a79cb5" fill="none" />
        <path d="M17 14l-5-9m11 9 5-9" fill="none" />
        <circle cx="12" cy="5" r="2" fill="#d8b57d" /><circle cx="28" cy="5" r="2" fill="#d8b57d" />
        <path d="M12 18q0-9 8-9t8 9v11q0 9-8 9t-8-9Z" fill="#ebca8b" />
        <path d="M13 27l14 1m-12 8-2 4m12-4 2 4" fill="none" />
        <path d="M13 26l14 2-1 7-14-2Z" fill="#fff9e7" /><path d="M14 27l5 5 7-3" fill="none" />
        <g className="beastie-eyes" fill="#58494e" stroke="none"><path d="M15 17h3v4h-3zm7 0h3v4h-3z" /></g>
        <path d="M18 23h4" fill="none" />
      </>}
      {species === 'troll' && <>
        <path d="M8 29l-3 9h12l2-8m4 0 1 8h12l-5-9" fill="#829c9a" />
        <path d="M8 16L5 6l9 7m12 0 9-7-3 11" fill="#e5c58b" />
        <path d="M5 20q0-10 15-10t15 10v10q-3 8-15 8T5 30Z" fill="#a9bfc0" />
        <path d="M6 28l8-2 6 3 6-3 8 2v8H6Z" fill="#778aa4" />
        <path d="M17 34h6" stroke="#e5c58b" strokeWidth="3" />
        <path d="M16 13l4-5 5 5" fill="#a9bfc0" />
        <ellipse cx="20" cy="20" rx="7" ry="5" fill="#fff9e7" />
        <g className="beastie-eyes" fill="#58494e" stroke="none"><rect x="19" y="17" width="3" height="6" /></g>
        <path d="M16 28h8m-1 0v2" fill="none" /><path d="M10 25h2m16 0h2" stroke="#c88169" />
      </>}
      {species === 'imp' && <>
        <path d="M16 34l-4 6h7m5-6 4 6h-6" fill="#7a665a" />
        <path d="M12 25q7-5 15 0l-2 12H15Z" fill="#8da18c" />
        <path d="M12 11l-4-8 9 5m8 2 6-7-1 11" fill="#d9a077" />
        <path d="M11 12L3 17l8 3m17-8 9 5-9 3" fill="#d9a077" />
        <path d="M11 12q8-8 17 0l-1 10-7 7-8-7Z" fill="#e8bc90" />
        <path d="M16 7l2-5 5 1 1 5" fill="#758cac" />
        <path d="M19 18l-3 4 7-1m-5 4h4" fill="none" />
        <path d="M28 29q11 11 6-4" fill="none" stroke="#d9a077" strokeWidth="2" />
        <path d="M10 30h7v7h-7z" fill="#fff9e7" /><path d="M11 31l3 3 2-2" fill="none" />
        <g className="beastie-eyes" fill="#58494e" stroke="none"><path d="M13 16h3v3h-3zm10 0h3v3h-3z" /></g>
      </>}
    </g>
  </svg>
}
