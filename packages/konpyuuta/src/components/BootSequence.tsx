import { useState, useEffect, useRef } from 'react'
import bootMessages from '../data/boot-messages.json'
import { AudioManager } from '../lib/audioManager'

const DEVIL_LOGO = `#>
#>  _______________________________________________________
#> /                                                       |
#> | Time travel initiated... Loading 1995 Unix experience  |
#> \\                                                      |
#>  -------------------------------------------------------
#>                  \\
#>                   \\
#>             ,        ,
#>             /(        )\`
#>             \\ \\___   / |
#>             /- _  \`-/  '
#>            (/\\/ \\ \\   /\\
#>            / /   | \`
#>            O O   ) /    |
#>            \`-^--'\`<     '
#>           (_.)  _  )   /
#>            \`.___/\`    /
#>              \`-----' /
#> <----.     __ / __   \\
#> <----|====O)))==) \\) /====
#> <----'    \`--' \`.__,' \\
#>              |        |
#>               \\       /
#>         ______( (_  / \\______
#>       ,'  ,-----'   |        \\
#>       \`--{__________)        \\/`

// Message types that receive a kernel timestamp prefix
const TIMESTAMP_TYPES = new Set(['kernel', 'cpu', 'fs', 'memory'])

function typeToClass(type: string): string {
  const map: Record<string, string> = {
    kernel:  'boot-kernel',
    cpu:     'boot-cpu',
    memory:  'boot-memory',
    fs:      'boot-fs',
    systemd: 'boot-systemd',
    service: 'boot-service',
    drm:     'boot-drm',
    desktop: 'boot-desktop',
  }
  return map[type] ?? 'boot-default'
}

function pickRandom<T>(arr: T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1))
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(count, arr.length))
}

interface BootLine {
  text: string
  cls: string
}

interface BootSequenceProps {
  onComplete: () => void
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [lines, setLines] = useState<BootLine[]>([])
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom as lines append
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []

    // Build sequence: pick messages from each phase, add timestamps where needed
    let totalTime = 0
    const sequence: BootLine[] = []

    for (const phase of bootMessages.phases) {
      const msgs = pickRandom(phase.messages, phase.min, phase.max)
      for (const msg of msgs) {
        let text = msg.text
        if (TIMESTAMP_TYPES.has(msg.type)) {
          const inc = Math.random() * 0.3 + 0.05
          totalTime += inc
          const ts = totalTime.toFixed(6).padStart(12, ' ')
          text = `[ ${ts} ] ${msg.text}`
        }
        sequence.push({ text, cls: typeToClass(msg.type) })
      }
    }

    // Final success line
    sequence.push({ text: '[    OK    ] CDE Desktop ready ....', cls: 'boot-desktop' })

    const total = sequence.length

    // Schedule each line with 50–250ms varied delay
    let elapsed = 0
    sequence.forEach((line, i) => {
      const delay = elapsed + 50 + Math.floor(Math.random() * 200)
      elapsed = delay
      timeouts.push(
        setTimeout(() => {
          setLines((prev) => [...prev, line])
          setProgress(Math.round(((i + 1) / total) * 100))
        }, delay)
      )
    })

    // After last line: show login prompt, play chime, call onComplete
    const loginDelay = elapsed + 400
    timeouts.push(setTimeout(() => {
      setLines((prev) => [...prev, { text: 'Login: [USER]', cls: 'boot-default' }])
    }, loginDelay))

    const startDelay = loginDelay + 200
    timeouts.push(setTimeout(() => {
      setLines((prev) => [...prev, { text: 'Starting KonpyuuTA...', cls: 'boot-desktop' }])
      setDone(true)
      AudioManager.playStartupChime()
    }, startDelay))

    timeouts.push(setTimeout(() => {
      onComplete()
    }, startDelay + 600))

    return () => timeouts.forEach(clearTimeout)
  }, [onComplete])

  return (
    <div className="cde-boot-screen">
      <div className="cde-boot-output" ref={outputRef}>
        {/* Devil logo — always at top, red */}
        <pre className="boot-logo">{DEVIL_LOGO}</pre>

        {/* Scrolling boot lines */}
        {lines.map((line, i) => (
          <div key={i} className={`cde-boot-line ${line.cls}`}>
            {line.text}
          </div>
        ))}
        {done && <div className="cde-boot-line boot-default cde-boot-cursor">▋</div>}
      </div>

      {/* Progress bar — fixed at bottom like the original */}
      <div className="cde-boot-progress-wrapper">
        <div className="cde-boot-progress-track">
          <div className="cde-boot-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}
