import { useDesktopStore } from '../stores/desktopStore'
import { useWindowStore } from '../stores/windowStore'
import { useSettingsStore } from '../stores/settingsStore'
import { BootSequence } from './BootSequence'
import { Desktop } from './Desktop'
import { TopBar } from './TopBar'
import { Panel } from './Panel'
import { Window } from './Window'
import { NotificationPopup } from './NotificationPopup'

interface KonpyuuTADesktopProps {
  onShutdown: () => void
}

export function KonpyuuTADesktop({ onShutdown }: KonpyuuTADesktopProps) {
  const bootStatus = useDesktopStore((s) => s.bootStatus)
  const setBootStatus = useDesktopStore((s) => s.setBootStatus)
  const windows = useWindowStore((s) => s.windows)
  const currentWorkspace = useWindowStore((s) => s.currentWorkspace)
  const palette = useSettingsStore((s) => s.palette)

  const handleBootComplete = () => {
    setBootStatus('ready')
  }

  // Apply CDE palette as CSS custom properties on the root element
  // These will cascade down to all CDE components via CSS variables
  const paletteVars: React.CSSProperties = {
    '--cde-bg': palette.background,
    '--cde-fg': palette.foreground,
    '--cde-highlight': palette.highlight,
    '--cde-shadow': palette.shadow,
    '--cde-titlebar': palette.titlebar,
    '--cde-titlebar-text': palette.titlebarText,
  } as React.CSSProperties

  if (bootStatus === 'booting') {
    return (
      <div className="cde-root" style={paletteVars}>
        <BootSequence onComplete={handleBootComplete} />
      </div>
    )
  }

  // Get windows visible in current workspace
  const visibleWindows = Object.values(windows).filter(
    (w) => w.workspace === currentWorkspace
  )

  return (
    <div className="cde-root" style={paletteVars}>
      <TopBar onShutdown={onShutdown} />
      <Desktop />
      {/* Render all visible windows */}
      {visibleWindows.map((win) => (
        <Window key={win.id} id={win.id}>
          {/* App content rendered by a separate AppRouter component — placeholder for now */}
          <div className="cde-app-placeholder">
            <p>{win.app}</p>
          </div>
        </Window>
      ))}
      <NotificationPopup />
      <Panel />
    </div>
  )
}
