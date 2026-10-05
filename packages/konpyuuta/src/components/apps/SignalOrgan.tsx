import { useId } from 'react'

/** Refractive signal membrane: no face or mascot, just an unfamiliar organism. */
export function SignalOrgan({ compact = false }: { compact?: boolean }) {
  const id = useId()
  return <svg className={`signal-organ${compact ? ' signal-organ-compact' : ''}`} viewBox="0 0 300 190" aria-hidden="true">
    <defs>
      <radialGradient id={id}><stop stopColor="#f3ffd9" /><stop offset=".22" stopColor="#b6ff45" /><stop offset=".5" stopColor="#387a22" /><stop offset=".77" stopColor="#081b12" /><stop offset="1" stopColor="#8d72b4" /></radialGradient>
      <filter id={`${id}-light`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
    </defs>
    <ellipse className="signal-halo" cx="152" cy="105" rx="98" ry="36" fill="none" stroke="#a8ff42" strokeWidth="3" filter={`url(#${id}-light)`} opacity=".6" />
    <g className="signal-membrane"><path d="M44 96C27 53 106 15 162 41c34 16 80-9 91 26 25 73-79 33-95 88-19 46-33-27-66-21-26 4-33-19-48-38Z" fill={`url(#${id})`} stroke="#a7ba86" strokeWidth=".7" />
      <path d="M54 91c13-45 89-36 119-22s43-21 64-5M70 111c18 18 47-15 70 11s21 13 30-3" fill="none" stroke="#dfffa7" strokeWidth="1.2" opacity=".6" />
      <ellipse cx="145" cy="90" rx="34" ry="20" fill="#030a07" transform="rotate(-19 145 90)" /><path d="M115 86c12-14 41-22 59-10" fill="none" stroke="#ceff88" opacity=".7" />
    </g>
    <g fill="#c7ff97"><circle cx="71" cy="46" r="2" /><circle cx="231" cy="128" r="1.5" /><circle cx="101" cy="151" r="1" /></g>
  </svg>
}

export function SignalAvatar({ seed = 'signal', className = '' }: { seed?: string; className?: string }) {
  const hash = [...seed].reduce((sum, char) => (Math.imul(sum, 31) + char.codePointAt(0)!) >>> 0, 0)
  const id = useId()
  return <svg className={`signal-avatar ${className}`} viewBox="0 0 44 44" aria-hidden="true">
    <defs><radialGradient id={id} cx="30%" cy="20%"><stop stopColor="#efffe6" /><stop offset=".35" stopColor={['#baff64', '#94e7d1', '#c9a7ff', '#dded9a'][hash % 4]} /><stop offset=".66" stopColor="#344c33" /><stop offset="1" stopColor="#080d0c" /></radialGradient></defs>
    <path d="M7 13C9 1 30 3 36 15c9 17-5 26-19 24C4 38 2 22 7 13Z" fill={`url(#${id})`} stroke="#bdd79b" strokeWidth=".6" transform={`rotate(${hash % 360} 22 22)`} />
    <ellipse cx="22" cy="22" rx="12" ry="5" fill="none" stroke="#d8ffcd" strokeWidth=".7" transform={`rotate(${hash % 180} 22 22)`} opacity=".65" />
  </svg>
}
