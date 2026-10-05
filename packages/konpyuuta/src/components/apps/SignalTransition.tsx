import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { corruptSignal } from '../../lib/mojibake'

type Fragment = { text: string; x: number; y: number; width: number; height: number; font: string; lineHeight: string; letterSpacing: string; color: string; align: string }

/** A decorative encoding pass over visible text. Originals stay in the DOM for
 * assistive technology; inputs and stored content are never rewritten. */
export function SignalTransition({ trigger, selective = false, enabled = true }: { trigger: string; selective?: boolean; enabled?: boolean }) {
  const layer = useRef<HTMLDivElement>(null)
  const [fragments, setFragments] = useState<Fragment[]>([])
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const scope = layer.current?.parentElement
    if (!scope || !enabled) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    let interval: ReturnType<typeof setInterval> | undefined
    let observer: MutationObserver | undefined
    let resize: ResizeObserver | undefined
    const restore = () => {
      scope.removeAttribute('data-signal-active'); setFragments([])
      if (interval) clearInterval(interval)
      observer?.disconnect(); resize?.disconnect()
    }
    const start = requestAnimationFrame(() => {
      const box = scope.getBoundingClientRect()
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
      const next: Fragment[] = []
      let node: Node | null
      while ((node = walker.nextNode()) && next.length < 160) {
        const parent = node.parentElement
        const text = node.textContent ?? ''
        if (!parent || !text.trim() || parent.closest('input, textarea, select, iframe, [aria-hidden="true"], [aria-live], [role="status"], [role="alert"], [class*="sr-only"], .signal-layer')) continue
        if (selective && !parent.closest('[data-signal-text]')) continue
        const style = getComputedStyle(parent)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        const range = document.createRange(); range.selectNodeContents(node)
        const rect = range.getBoundingClientRect()
        if (rect.width <= 2 || rect.height <= 2 || rect.bottom < box.top || rect.top > box.bottom || rect.right < box.left || rect.left > box.right) continue
        next.push({ text, x: rect.left - box.left, y: rect.top - box.top, width: rect.width, height: rect.height, font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, color: style.color, align: style.textAlign })
      }
      if (!next.length) return
      setFrame(0); setFragments(next)
      scope.setAttribute('data-signal-active', selective ? 'selected' : 'true')
      // Async results can change geometry mid-pass. Abort instead of displaying
      // ghost text at the old coordinates; our own decorative updates are ignored.
      observer = new MutationObserver((records) => {
        if (records.some((record) => {
          const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target as Element : record.target.parentElement
          return !element?.closest('.signal-layer')
        })) restore()
      })
      observer.observe(scope, { childList: true, characterData: true, subtree: true })
      let firstResize = true
      resize = new ResizeObserver(() => { if (firstResize) firstResize = false; else restore() })
      resize.observe(scope)
      let current = 0
      interval = setInterval(() => {
        current++
        if (current >= 14) restore()
        else setFrame(current)
      }, 70)
    })
    motion.addEventListener('change', restore)
    // A click/focus interrupts the effect immediately, keeping controls usable.
    scope.addEventListener('pointerdown', restore)
    scope.addEventListener('focusin', restore)
    scope.addEventListener('keydown', restore)
    document.addEventListener('visibilitychange', restore)
    scope.addEventListener('scroll', restore, true)
    return () => {
      cancelAnimationFrame(start); restore()
      motion.removeEventListener('change', restore)
      scope.removeEventListener('pointerdown', restore)
      scope.removeEventListener('focusin', restore)
      scope.removeEventListener('keydown', restore)
      document.removeEventListener('visibilitychange', restore)
      scope.removeEventListener('scroll', restore, true)
    }
  }, [trigger, selective, enabled])

  return <div ref={layer} className="signal-layer" aria-hidden="true">{fragments.map((fragment, index) => <span key={index} style={{ left: fragment.x, top: fragment.y, width: fragment.width + 4, height: fragment.height + 2, font: fragment.font, lineHeight: fragment.lineHeight, letterSpacing: fragment.letterSpacing, '--fragment-color': fragment.color, textAlign: fragment.align } as CSSProperties}>{corruptSignal(fragment.text, Math.max(0, (frame - 4) / 9), frame)}</span>)}</div>
}
