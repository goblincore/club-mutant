import { useEffect, useState, useRef } from 'react'

interface OS5000kBootProps {
  onComplete: () => void
}

const BOOT_LINES = [
  { text: 'MutantBIOS v3.14', delay: 0 },
  { text: '', delay: 100 },
  { text: 'Testing RAM ... 640K OK', delay: 200 },
  { text: 'Detecting peripherals ...', delay: 500 },
  { text: '  > Keyboard .......... found', delay: 700 },
  { text: '  > Sound Blaster ..... found', delay: 850 },
  { text: '  > Network ........... connected', delay: 1000 },
  { text: '', delay: 1100 },
  { text: 'Loading OS5000k v2.0 ...', delay: 1200 },
  { text: 'PROGRESS', delay: 1300 },  // special: renders progress bar
  { text: '', delay: 2400 },
]

const TOTAL_DURATION = 2600

export function OS5000kBoot({ onComplete }: OS5000kBootProps) {
  const [visibleLines, setVisibleLines] = useState(0)
  const [progress, setProgress] = useState(0)
  const mountTime = useRef(Date.now())

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    BOOT_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), line.delay))
    })

    // Progress bar animation (from 1300ms to 2400ms)
    const progressStart = 1300
    const progressEnd = 2400
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - mountTime.current
      if (elapsed >= progressEnd) {
        setProgress(100)
        clearInterval(progressTimer)
      } else if (elapsed >= progressStart) {
        setProgress(Math.min(100, ((elapsed - progressStart) / (progressEnd - progressStart)) * 100))
      }
    }, 30)

    // Complete
    timers.push(setTimeout(onComplete, TOTAL_DURATION))

    return () => {
      timers.forEach(clearTimeout)
      clearInterval(progressTimer)
    }
  }, [onComplete])

  return (
    <div className="fixed inset-0 bg-black flex flex-col p-8 font-mono overflow-hidden" style={{ zIndex: 40 }}>
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
      }} />

      {/* Boot text */}
      <div className="relative z-10">
        {BOOT_LINES.slice(0, visibleLines).map((line, i) => {
          if (line.text === 'PROGRESS') {
            const barWidth = 30
            const filled = Math.round((progress / 100) * barWidth)
            const empty = barWidth - filled
            return (
              <div key={i} className="text-[14px] leading-6 text-green-400">
                [{'\u2588'.repeat(filled)}{'\u2591'.repeat(empty)}] {Math.round(progress)}%
              </div>
            )
          }
          return (
            <div key={i} className="text-[14px] leading-6 text-green-400" style={{ textShadow: '0 0 8px rgba(74, 222, 128, 0.4)' }}>
              {line.text || '\u00A0'}
            </div>
          )
        })}

        {/* Blinking cursor */}
        {visibleLines < BOOT_LINES.length && (
          <span className="text-green-400 animate-pulse text-[14px]">{'\u258C'}</span>
        )}
      </div>
    </div>
  )
}
