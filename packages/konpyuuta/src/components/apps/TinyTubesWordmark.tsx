import { useId } from 'react'

/** Custom tubular lettering rather than a system-font logo. */
export function TinyTubesWordmark() {
  const id = useId()
  return <strong className="app-wordmark tt-wordmark">
    <span className="tt-wordmark-text">TinyTubes</span>
    <svg viewBox="0 0 248 36" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-metal`} gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="26">
          <stop offset="0" stopColor="#f1ffd9" /><stop offset=".35" stopColor="#d9ffab" />
          <stop offset=".5" stopColor="#729642" /><stop offset=".64" stopColor="#c5ff74" /><stop offset="1" stopColor="#8cba53" />
        </linearGradient>
        <mask id={`${id}-seam`}><rect width="248" height="36" fill="white" /><path d="M0 18h248" stroke="black" strokeWidth="1.1" /></mask>
      </defs>
      <g transform="translate(8 5) skewX(-12)" stroke={`url(#${id}-metal)`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" mask={`url(#${id}-seam)`}>
        <path d="M2 2h19M11.5 2v24" />
        <path d="M31 2v24" />
        <path d="M42 26V2h2l17 24h2V2" />
        <path d="m73 2 8 11 8-11M81 13v13" />
        <path d="M103 2h19M112.5 2v24" />
        <path d="M132 2v17q0 7 8 7h3q8 0 8-7V2" />
        <path d="M162 26V2h11q8 0 8 6 0 6-8 6h-11m11 0q9 0 9 6t-9 6h-11" />
        <path d="M210 2h-17v24h17m-17-12h14" />
        <path d="M235 2h-11q-7 0-7 6t7 6h4q7 0 7 6t-7 6h-12" />
      </g>
    </svg>
  </strong>
}
