import { useEffect, useRef, type ReactNode } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { PanelResizeHandle, usePanelSize } from './PanelResizeHandle'
import type { PortalAppId } from '../lib/portalApps'
import '../styles/appSkins.css'

export function PortalAppFrame({ id, app, title, children }: { id: string; app: PortalAppId; title: string; children: ReactNode }) {
  const home = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const { style, resize } = usePanelSize(panel, { width: 340, height: 380 })
  useEffect(() => { home.current?.focus({ preventScroll: true }) }, [id])
  return <section ref={panel} style={style} className="portal-app-frame" data-app={app} aria-label={title}>
    <header className="portal-app-bar">
      <button ref={home} onClick={() => useWindowStore.getState().showHome()} aria-label="Return to home"><span aria-hidden="true">↙</span> Home</button>
      <span>{title}</span>
    </header>
    <div className="portal-app-body">{children}</div>
    <PanelResizeHandle panel={panel} resize={resize} name={title} />
  </section>
}
