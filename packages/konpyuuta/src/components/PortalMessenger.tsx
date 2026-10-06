import { useEffect, useRef } from 'react'
import { usePortalStore } from '../stores/portalStore'
import { SOCIAL_ICONS } from '../lib/socialIcons'
import { Messenger } from './apps/Messenger'
import { PanelResizeHandle, usePanelSize } from './PanelResizeHandle'
import '../styles/buddy.css'

export function PortalMessenger({ visible, onWidthChange }: { visible: boolean; onWidthChange: (width: number) => void }) {
  const focused = usePortalStore((s) => s.messengerFocused)
  const panel = useRef<HTMLElement>(null)
  const wasFocused = useRef(false)
  const { style, resize } = usePanelSize(panel, { width: 280, height: 360 }, true, 540)
  useEffect(() => {
    const element = panel.current
    if (!element || !visible) return
    const observer = new ResizeObserver(() => onWidthChange(element.getBoundingClientRect().width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible, onWidthChange])
  useEffect(() => {
    if (visible && focused && !wasFocused.current && !panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true })
    wasFocused.current = visible && focused
  }, [visible, focused])
  return <aside ref={panel} tabIndex={-1} hidden={!visible} style={style} className={`portal-buddy${focused ? ' portal-buddy-focused' : ''}`} aria-label="Messenger" onPointerDownCapture={() => usePortalStore.getState().focusMessenger(true)} onFocusCapture={() => usePortalStore.getState().focusMessenger(true)}>
    <header className="portal-buddy-bar"><img src={SOCIAL_ICONS.messenger} alt="" /><strong>Messenger</strong><button aria-label="Close Messenger" title="Close Messenger" onClick={() => usePortalStore.getState().closeMessenger()}>×</button></header>
    <div className="portal-buddy-body"><Messenger isOpen={visible} focused={focused} compact /></div>
    <PanelResizeHandle panel={panel} resize={resize} name="Messenger" anchorRight />
  </aside>
}
