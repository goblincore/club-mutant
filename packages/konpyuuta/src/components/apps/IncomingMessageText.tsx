import { useEffect, useState } from 'react'
import { corruptSignal } from '../../lib/mojibake'
import { useMessengerStore } from '../../stores/messengerStore'

/** The readable original remains in the live log; only its visual copy corrupts. */
export function IncomingMessageText({ text, messageId, receivedAt }: { text: string; messageId: string; receivedAt?: number }) {
  // Capture the arrival on mount so consuming the store token doesn't cancel it.
  const [arrival] = useState(receivedAt)
  const [frame, setFrame] = useState<number | null>(null)
  const consume = useMessengerStore((s) => s.consumeIncomingSignal)

  useEffect(() => {
    if (!arrival) return
    consume(messageId, arrival)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (Date.now() - arrival >= 3000 || motion.matches || document.hidden) return
    let timer: ReturnType<typeof setInterval> | undefined
    const restore = () => { setFrame(null); if (timer) clearInterval(timer) }
    let current = 0
    setFrame(current)
    timer = setInterval(() => { current++; if (current >= 9) restore(); else setFrame(current) }, 70)
    motion.addEventListener('change', restore)
    document.addEventListener('visibilitychange', restore)
    document.addEventListener('pointerdown', restore)
    document.addEventListener('keydown', restore)
    document.addEventListener('focusin', restore)
    return () => {
      restore()
      motion.removeEventListener('change', restore)
      document.removeEventListener('visibilitychange', restore)
      document.removeEventListener('pointerdown', restore)
      document.removeEventListener('keydown', restore)
      document.removeEventListener('focusin', restore)
    }
  }, [arrival, messageId, consume])

  return <span className="incoming-signal" data-incoming-signal={frame !== null ? 'active' : undefined}>
    <span className="incoming-signal-original">{text}</span>
    {frame !== null && <span className="incoming-signal-noise" aria-hidden="true">{corruptSignal(text, Math.max(0, (frame - 1) / 7), frame)}</span>}
  </span>
}
