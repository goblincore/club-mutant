import '../styles/liquid.css'
import '../styles/portal.css'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { BootSequence } from './BootSequence'
import { PortalMessenger } from './PortalMessenger'
import { usePortalStore } from '../stores/portalStore'
import { useMessengerStore } from '../stores/messengerStore'

interface KonpyuuTADesktopProps { onShutdown: () => void }

// The boot is theatrical; the home remains a simple social portal.
export function KonpyuuTADesktop({ onShutdown }: KonpyuuTADesktopProps) {
  const [booting, setBooting] = useState(true)
  const finishBoot = useCallback(() => setBooting(false), [])
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 980px)').matches)
  const messengerOpen = usePortalStore((s) => s.messengerOpen)
  const messengerFocused = usePortalStore((s) => s.messengerFocused)
  const [buddyWidth, setBuddyWidth] = useState(300)
  const windows = useWindowStore((state) => state.windows)
  const activeId = useWindowStore((state) => state.activeWindowId)
  const active = activeId ? windows[activeId] : null
  const app = active && active.app !== 'messenger' && PORTAL_APPS.find((entry) => entry.app === active.app)
  const showMessenger = !booting && messengerOpen && (wide || !app || messengerFocused)
  const lastApp = useRef<string | null>(null)
  useEffect(() => {
    if (app) { lastApp.current = app.app; AudioManager.windowOpen() }
  }, [activeId, app])
  useEffect(() => {
    const query = window.matchMedia('(min-width: 980px)')
    const update = () => setWide(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    // Default to the buddy list on each visit, without stealing keyboard focus.
    usePortalStore.setState({ messengerOpen: true, messengerFocused: false })
    useMessengerStore.getState().setActiveConversation(null)
  }, [])

  return <div style={{ '--buddy-width': `${buddyWidth}px` } as CSSProperties} className={`cde-root liquid-signal portal-shell${showMessenger ? ' portal-with-buddy' : ''}`} onPointerDownCapture={(event) => {
    if (!(event.target as HTMLElement).closest('.portal-buddy')) usePortalStore.getState().focusMessenger(false)
  }} onFocusCapture={(event) => {
    if (!(event.target as HTMLElement).closest('.portal-buddy')) usePortalStore.getState().focusMessenger(false)
  }}>
    {!booting && <><PortalWallpaper animate={!app} />
    <TopBar onShutdown={onShutdown} />
    {app && active ? <PortalAppFrame key={active.id} id={active.id} title={app.name}>
      <AppRouter windowId={active.id} app={app.app} props={active.props} />
    </PortalAppFrame> : <PortalHome returnTo={lastApp.current} />}</>}
    <PortalMessenger visible={showMessenger} onWidthChange={setBuddyWidth} />
    {booting && <BootSequence onComplete={finishBoot} />}
    <NotificationPopup />
    <AnimatedSwordCursor />
  </div>
}
