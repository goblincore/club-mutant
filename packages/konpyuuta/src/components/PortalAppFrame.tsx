import { useEffect, useRef, type ReactNode } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { PanelResizeHandle, usePanelSize } from './PanelResizeHandle'

export function PortalAppFrame({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const home = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const { style, resize } = usePanelSize(panel, { width: 300, height: 280 })
  useEffect(() => { home.current?.focus({ preventScroll: true }) }, [id])
  return <section ref={panel} style={style} className="portal-app-frame" aria-label={title}>
    <header className="portal-app-bar">
      <button ref={home} onClick={() => useWindowStore.getState().showHome()} aria-label="Return to home"><span aria-hidden="true">↙</span> Home</button>
      <span>{title}</span>
    </header>
    <div className="portal-app-body">{children}</div>
    <PanelResizeHandle panel={panel} resize={resize} name={title} />
  </section>
}
