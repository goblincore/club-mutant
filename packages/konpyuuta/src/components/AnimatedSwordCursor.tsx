import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import swordLoop from '../assets/cursors/sword.webp?url'
import swordStill from '../assets/cursors/sword.png?url'
import swordLink from '../assets/cursors/sword-link.png?url'

/** A prerendered sprite; the blade tip stays at the actual pointer coordinate. */
export function AnimatedSwordCursor() {
  const marker = useRef<HTMLSpanElement>(null)
  const sprite = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const root = marker.current?.closest('.cde-root') as HTMLElement | null
    const image = sprite.current
    if (!root || !image || !loaded) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mouse = window.matchMedia('(any-pointer: fine)')
    const normalUrl = new URL(swordStill, document.baseURI).href
    const linkUrl = new URL(swordLink, document.baseURI).href
    let frame = 0
    let point: { x: number; y: number; type: string; buttons: number } | null = null
    const hide = () => {
      cancelAnimationFrame(frame); frame = 0
      root.removeAttribute('data-sword-cursor')
      image.style.display = 'none'
    }
    const draw = () => {
      frame = 0
      if (!point || point.type !== 'mouse' || point.buttons || motion.matches || !mouse.matches || document.hidden || document.pointerLockElement) { hide(); return }
      const target = document.elementFromPoint(point.x, point.y)
      if (!target || !root.contains(target) || target.tagName === 'IFRAME') { hide(); return }
      const cursor = getComputedStyle(target).cursor
      const ourHiddenCursor = cursor === 'none' && root.hasAttribute('data-sword-cursor')
      if (!ourHiddenCursor && !cursor.includes(normalUrl) && !cursor.includes(linkUrl)) { hide(); return }
      // Native text, disabled, drag, resize, and iframe states are excluded by
      // their computed cursor. Pointer capture/pressed buttons also stay native.
      image.style.transform = `translate3d(${point.x - 6}px, ${point.y - 6}px, 0)`
      image.style.display = 'block'
      image.dataset.link = cursor.includes(linkUrl) || (!!target.closest('button,a[href],[role="button"]') && ourHiddenCursor) ? 'true' : 'false'
      root.setAttribute('data-sword-cursor', 'animated')
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(draw) }
    const move = (event: PointerEvent) => {
      point = { x: event.clientX, y: event.clientY, type: event.pointerType, buttons: event.buttons }
      queue()
    }
    const press = (event: PointerEvent) => {
      point = { x: event.clientX, y: event.clientY, type: event.pointerType, buttons: event.buttons }
      hide()
    }
    const key = () => { point = null; hide() }
    const leave = () => { point = null; hide() }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', move)
    document.addEventListener('pointerdown', press)
    document.addEventListener('pointercancel', leave)
    document.addEventListener('pointerleave', leave)
    document.addEventListener('scroll', queue, true)
    document.addEventListener('keydown', key)
    document.addEventListener('visibilitychange', leave)
    window.addEventListener('blur', leave)
    window.addEventListener('resize', leave)
    motion.addEventListener('change', leave)
    return () => {
      hide()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', move)
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('pointercancel', leave)
      document.removeEventListener('pointerleave', leave)
      document.removeEventListener('scroll', queue, true)
      document.removeEventListener('keydown', key)
      document.removeEventListener('visibilitychange', leave)
      window.removeEventListener('blur', leave)
      window.removeEventListener('resize', leave)
      motion.removeEventListener('change', leave)
    }
  }, [loaded])

  return <><span ref={marker} hidden />{createPortal(<img ref={sprite} className="sword-cursor-sprite" src={swordLoop} alt="" aria-hidden="true" draggable={false} onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />, document.body)}</>
}
