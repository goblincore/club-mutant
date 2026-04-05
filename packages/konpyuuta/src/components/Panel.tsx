import { useState, useEffect } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { useSettingsStore } from '../stores/settingsStore'

function useClock() {
  const [time, setTime] = useState(() => {
    const d = new Date()
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date()
      setTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`)
    }, 10000)  // check every 10s, good enough
    return () => clearInterval(interval)
  }, [])

  return time
}

export function Panel() {
  const windows = useWindowStore((s) => s.windows)
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const currentWorkspace = useWindowStore((s) => s.currentWorkspace)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const unminimizeWindow = useWindowStore((s) => s.unminimizeWindow)
  const switchWorkspace = useWindowStore((s) => s.switchWorkspace)
  const palette = useSettingsStore((s) => s.palette)
  const time = useClock()

  const visibleWindows = Object.values(windows).filter(
    (w) => w.workspace === currentWorkspace
  )

  const handleWindowButtonClick = (id: string) => {
    const win = windows[id]
    if (!win) return
    if (win.minimized) {
      unminimizeWindow(id)
    } else if (id === activeWindowId) {
      minimizeWindow(id)
    } else {
      focusWindow(id)
    }
  }

  return (
    <div className="cde-panel" style={{ backgroundColor: palette.titlebar, color: palette.titlebarText }}>
      {/* Window buttons */}
      <div className="cde-panel-windows">
        {visibleWindows.map((win) => (
          <button
            key={win.id}
            className={`cde-panel-window-btn${win.id === activeWindowId ? ' cde-panel-window-btn--active' : ''}${win.minimized ? ' cde-panel-window-btn--minimized' : ''}`}
            onClick={() => handleWindowButtonClick(win.id)}
          >
            {win.title}
          </button>
        ))}
      </div>

      {/* Workspace pager */}
      <div className="cde-panel-workspaces">
        {[0, 1, 2, 3].map((n) => (
          <button
            key={n}
            className={`cde-panel-workspace-btn${n === currentWorkspace ? ' cde-panel-workspace-btn--active' : ''}`}
            onClick={() => switchWorkspace(n)}
            aria-label={`Workspace ${n + 1}`}
          >
            {n + 1}
          </button>
        ))}
      </div>

      {/* Clock */}
      <div className="cde-panel-clock">{time}</div>
    </div>
  )
}
