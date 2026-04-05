import { useState, useEffect } from 'react'
import bootMessages from '../data/boot-messages.json'

interface BootSequenceProps {
  onComplete: () => void
}

function pickRandom<T>(arr: T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1))
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [lines, setLines] = useState<string[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []

    // Build message sequence from all phases, respecting per-phase min/max
    const sequence: string[] = []
    for (const phase of bootMessages.phases) {
      const picked = pickRandom(phase.messages, phase.min, phase.max)
      for (const msg of picked) {
        sequence.push(msg.text)
      }
    }

    // Schedule each message with a random 30–120ms delay
    let elapsed = 0
    for (let i = 0; i < sequence.length; i++) {
      const delay = elapsed + 30 + Math.floor(Math.random() * 91)
      elapsed = delay
      const text = sequence[i]
      timeouts.push(
        setTimeout(() => {
          setLines((prev) => [...prev, text])
        }, delay)
      )
    }

    // After last message, add login lines and call onComplete
    const loginDelay = elapsed + 600
    timeouts.push(
      setTimeout(() => {
        setLines((prev) => [...prev, 'Login: [USER]'])
      }, loginDelay)
    )

    const startDelay = loginDelay + 200
    timeouts.push(
      setTimeout(() => {
        setLines((prev) => [...prev, 'Starting KonpyuuTA...'])
        setDone(true)
      }, startDelay)
    )

    timeouts.push(
      setTimeout(() => {
        onComplete()
      }, startDelay + 400)
    )

    return () => timeouts.forEach(clearTimeout)
  }, [onComplete])

  return (
    <div className="cde-boot-screen">
      <div className="cde-boot-output">
        {lines.map((line, i) => (
          <div key={i} className="cde-boot-line">{line}</div>
        ))}
        {done && <div className="cde-boot-line cde-boot-cursor">▋</div>}
      </div>
    </div>
  )
}
