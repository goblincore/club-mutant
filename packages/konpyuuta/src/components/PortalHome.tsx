import { useLayoutEffect, useRef } from 'react'
import { PORTAL_ICONS, PORTAL_ICON_LOOPS } from '../lib/socialIcons'
import { openPortalApp, PORTAL_APPS } from '../lib/portalApps'

export function PortalHome({ returnTo }: { returnTo: string | null }) {
  const home = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (returnTo) home.current?.querySelector<HTMLButtonElement>(`[data-app="${returnTo}"]`)?.focus({ preventScroll: true })
  }, [returnTo])
  return <main ref={home} className="portal-home" aria-label="NEETscape home">
    <div className="portal-signals">{PORTAL_APPS.map(({ app, name }) => <div key={app} className="portal-signal-anchor">
      <button className="portal-signal" data-app={app} aria-label={`Open ${name}`} onClick={() => openPortalApp(app)}>
        <span className="portal-icon-glow" aria-hidden="true" />
        <picture><source media="(prefers-reduced-motion: reduce)" srcSet={PORTAL_ICONS[app]} /><source type="image/webp" srcSet={PORTAL_ICON_LOOPS[app]} /><img src={PORTAL_ICONS[app]} alt="" draggable={false} /></picture>
        <span className="portal-signal-name">{name}</span>
      </button>
    </div>)}</div>
  </main>
}
