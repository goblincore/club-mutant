import { useEffect, useRef, type ReactNode } from 'react'
import { useWindowStore } from '../stores/windowStore'

export function PortalAppFrame({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const home = useRef<HTMLButtonElement>(null)
  useEffect(() => { home.current?.focus({ preventScroll: true }) }, [id])
  return <section className="portal-app-frame" aria-label={title}>
    <header className="portal-app-bar">
      <button ref={home} onClick={() => useWindowStore.getState().showHome()} aria-label="Return to home"><span aria-hidden="true">↙</span> Home</button>
      <span>{title}</span>
    </header>
    <div className="portal-app-body">{children}</div>
  </section>
}
