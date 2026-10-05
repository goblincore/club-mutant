export function AppWordmark({ label }: { label: string }) {
  return <strong className="app-wordmark">{label}<span className="signal-whisper" aria-hidden="true">Éäﾘ</span></strong>
}
export function DoodleStar({ filled = false, className = '' }: { filled?: boolean; className?: string }) {
  return <svg className={`doodle-star ${className}`} viewBox="0 0 64 64" aria-hidden="true"><path d="M32 2c2 26 4 28 30 30-26 2-28 4-30 30C30 36 28 34 2 32c26-2 28-4 30-30Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth=".6" /><circle cx="32" cy="32" r="11" fill="none" stroke="currentColor" strokeWidth=".5" /></svg>
}
