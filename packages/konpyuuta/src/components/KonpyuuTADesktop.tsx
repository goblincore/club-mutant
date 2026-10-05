import '../styles/liquid.css'
import '../styles/portal.css'
import { useEffect, useRef } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { PORTAL_APPS } from '../lib/portalApps'
import { TopBar } from './TopBar'
import { PortalHome } from './PortalHome'
import { PortalWallpaper } from './PortalWallpaper'
import { PortalAppFrame } from './PortalAppFrame'
import { NotificationPopup } from './NotificationPopup'
import { AppRouter } from './AppRouter'
import { AnimatedSwordCursor } from './AnimatedSwordCursor'
import { AudioManager } from '../lib/audioManager'

interface KonpyuuTADesktopProps { onShutdown: () => void }

// Public export retained for the host; this is now a portal, with no OS boot,
// utilities, workspaces, taskbar, or draggable window chrome.
export function KonpyuuTADesktop({ onShutdown }: KonpyuuTADesktopProps) {
  const windows = useWindowStore((state) => state.windows)
  const activeId = useWindowStore((state) => state.activeWindowId)
  const active = activeId ? windows[activeId] : null
  const app = active && PORTAL_APPS.find((entry) => entry.app === active.app)
  const lastApp = useRef<string | null>(null)
  useEffect(() => {
    if (app) { lastApp.current = app.app; AudioManager.windowOpen() }
  }, [activeId, app])

  return <div className="cde-root liquid-signal portal-shell">
    <PortalWallpaper animate={!app} />
    <TopBar onShutdown={onShutdown} />
    {app && active ? <PortalAppFrame id={active.id} title={app.name}>
      <AppRouter windowId={active.id} app={app.app} props={active.props} />
    </PortalAppFrame> : <PortalHome returnTo={lastApp.current} />}
    <NotificationPopup />
    <AnimatedSwordCursor />
  </div>
}
