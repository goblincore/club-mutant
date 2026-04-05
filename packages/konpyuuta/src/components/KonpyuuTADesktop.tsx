import { useEffect, useRef } from 'react'
import { useDesktopStore } from '../stores/desktopStore'
import { useWindowStore } from '../stores/windowStore'
import { useSettingsStore } from '../stores/settingsStore'
import fontsData from '../data/fonts.json'
import { BootSequence } from './BootSequence'
import { Desktop } from './Desktop'
import { TopBar } from './TopBar'
import { Panel } from './Panel'
import { Window } from './Window'
import { NotificationPopup } from './NotificationPopup'
import { AppRouter } from './AppRouter'
import { AudioManager } from '../lib/audioManager'

interface KonpyuuTADesktopProps {
  onShutdown: () => void
}

export function KonpyuuTADesktop({ onShutdown }: KonpyuuTADesktopProps) {
  const bootStatus = useDesktopStore((s) => s.bootStatus)
  const setBootStatus = useDesktopStore((s) => s.setBootStatus)
  const windows = useWindowStore((s) => s.windows)
  const currentWorkspace = useWindowStore((s) => s.currentWorkspace)
  const palette = useSettingsStore((s) => s.palette)
  const fontPreset = useSettingsStore((s) => s.fontPreset)
  const prevWindowIds = useRef<Set<string>>(new Set())

  // Play window-open sound when a new window appears
  useEffect(() => {
    const currentIds = new Set(Object.keys(windows))
    for (const id of currentIds) {
      if (!prevWindowIds.current.has(id)) {
        AudioManager.windowOpen()
        break // one sound per batch
      }
    }
    prevWindowIds.current = currentIds
  }, [windows])

  useEffect(() => {
    const root = document.querySelector('.cde-root') as HTMLElement | null
    if (!root) return
    const fonts = fontsData as Record<string, Record<string, string>>
    const vars = fonts[fontPreset] ?? fonts['__default__'] ?? {}
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [fontPreset])

  const handleBootComplete = () => {
    setBootStatus('ready')
  }

  // Apply CDE palette as CSS custom properties using the original variable names
  const paletteVars: React.CSSProperties = {
    '--titlebar-color': palette.titlebar,
    '--titlebar-text-color': palette.titlebarText,
    '--window-color': palette.background,
    '--topbar-color': palette.background,
    '--dock-color': palette.background,
    '--button-bg': palette.background,
    '--button-active': palette.shadow,
    '--border-light': palette.highlight,
    '--border-dark': palette.shadow,
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
          <AppRouter app={win.app} props={win.props} />
        </Window>
      ))}
      <NotificationPopup />
      <Panel />
    </div>
  )
}
