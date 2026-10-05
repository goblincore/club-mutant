import { useState, useRef, useEffect } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { DESKTOP_ICONS } from '../lib/socialIcons'

type ToolSymbol = 'apps' | 'tools' | 'camera' | 'activity' | 'calendar' | 'settings'

function PanelSymbol({ kind }: { kind: ToolSymbol }) {
  return <svg className="signal-panel-symbol" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'apps' && <><ellipse cx="16" cy="16" rx="13" ry="11" transform="rotate(-25 16 16)" /><circle cx="11" cy="11" r="3" /><circle cx="21" cy="11" r="3" /><circle cx="11" cy="21" r="3" /><circle cx="21" cy="21" r="3" /></>}
    {kind === 'tools' && <><path d="M7 6v20M16 6v20M25 6v20" opacity=".5" /><circle cx="7" cy="12" r="3" fill="currentColor" stroke="none" /><circle cx="16" cy="21" r="3" fill="currentColor" stroke="none" /><circle cx="25" cy="9" r="3" fill="currentColor" stroke="none" /></>}
    {kind === 'camera' && <><path d="M5 10h6l2-4h6l2 4h6v15H5Z" /><circle cx="16" cy="17" r="5" /><circle cx="24" cy="13" r=".7" fill="currentColor" /></>}
    {kind === 'activity' && <><rect x="4" y="6" width="24" height="19" rx="5" /><path d="m7 17 5-1 3-6 3 11 3-5h4M11 29h10" /></>}
    {kind === 'calendar' && <><rect x="6" y="7" width="20" height="21" rx="4" /><path d="M11 4v6M21 4v6M6 14h20M11 19h3M18 19h3M11 23h3" /></>}
    {kind === 'settings' && <><circle cx="16" cy="16" r="5" /><path d="M13 4h6l1 5 5 1 3 5-4 4 1 5-5 3-4-3-5 1-3-5 3-4-1-5 4-2Z" /></>}
  </svg>
}

const WORKSPACE_LABELS = ['One', 'Two', 'Three', 'Four']
const SHORTCUTS = [
  { app: 'netscape', label: 'Netscape', title: 'Netscape Navigator', size: { width: 780, height: 580 } },
  { app: 'filemanager', label: 'Files', title: 'File Manager', size: { width: 680, height: 500 } },
  { app: 'mutanttube', label: 'TinyTubes', title: 'TinyTubes', size: { width: 900, height: 650 } },
  { app: 'messenger', label: 'Messenger', title: 'Messenger', size: { width: 800, height: 600 } },
  { app: 'mutantbook', label: 'Guestbook', title: 'Guestbook', size: { width: 800, height: 600 } },
  { app: 'mutantmail', label: 'Postbox', title: 'Postbox', size: { width: 800, height: 600 } },
] as const

export function Panel() {
  const currentWorkspace = useWindowStore((s) => s.currentWorkspace)
  const switchWorkspace = useWindowStore((s) => s.switchWorkspace)
  const windows = useWindowStore((s) => s.windows)
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const [toolsOpen, setToolsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!toolsOpen) return
    const outside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setToolsOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setToolsOpen(false); toolsRef.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [toolsOpen])

  function launch(app: string, opts: Parameters<ReturnType<typeof useWindowStore.getState>['openWindow']>[1]) {
    setToolsOpen(false)
    const store = useWindowStore.getState()
    const existing = Object.values(store.windows).filter((win) => win.app === app && win.workspace === store.currentWorkspace).sort((a, b) => b.zIndex - a.zIndex)[0]
    if (existing) {
      if (opts?.props) store.setWindowProps(existing.id, opts.props)
      if (existing.shaded) store.shadeWindow(existing.id)
      if (existing.minimized) store.unminimizeWindow(existing.id)
      else store.focusWindow(existing.id)
    } else store.openWindow(app, opts)
  }

  return <div className="cde-panel signal-panel" ref={panelRef} role="toolbar" aria-label="Desktop taskbar">
    <button className="signal-launcher signal-dock-button" aria-label="Applications" onClick={() => launch('appmanager', { title: 'Application Manager', size: { width: 600, height: 450 } })}>
      <PanelSymbol kind="apps" /><span className="signal-dock-tip">Applications</span>
    </button>
    <span className="signal-panel-divider" aria-hidden="true" />
    <div className="signal-shortcuts" aria-label="App shortcuts">
      {SHORTCUTS.map(({ app, label, title, size }) => {
        const running = Object.values(windows).some((win) => win.app === app && win.workspace === currentWorkspace)
        const active = windows[activeWindowId ?? '']?.app === app && windows[activeWindowId ?? '']?.workspace === currentWorkspace
        return <button key={app} className="signal-dock-button" aria-label={title} title={label} data-running={running || undefined} data-active={active || undefined} onClick={() => launch(app, { title, size })}>
          <img src={DESKTOP_ICONS[app]} alt="" draggable={false} /><span className="signal-dock-tip">{label}</span><i className="signal-running-light" aria-hidden="true" />
        </button>
      })}
    </div>
    <span className="signal-panel-divider" aria-hidden="true" />
    <div className="signal-spaces" role="group" aria-label="Workspaces">
      {WORKSPACE_LABELS.map((label, index) => {
        const count = Object.values(windows).filter((win) => win.workspace === index).length
        return <button key={label} className="signal-space" aria-label={`Workspace ${label}`} aria-pressed={index === currentWorkspace} title={`Workspace ${label} · ${count} ${count === 1 ? 'window' : 'windows'}`} onClick={() => { setToolsOpen(false); switchWorkspace(index) }}>
          <span>0{index + 1}</span><i data-occupied={count > 0 || undefined} aria-hidden="true" />
        </button>
      })}
    </div>
    <span className="signal-panel-divider" aria-hidden="true" />
    <button ref={toolsRef} className="signal-dock-button signal-tools-button" aria-label="Desktop tools" aria-expanded={toolsOpen} aria-controls="signal-desktop-tools" onClick={() => setToolsOpen((open) => !open)}>
      <PanelSymbol kind="tools" /><span className="signal-dock-tip">Desktop tools</span>
    </button>
    {toolsOpen && <div className="signal-tools-tray" id="signal-desktop-tools" role="region" aria-label="Desktop tools">
      <div className="signal-tools-heading">DESKTOP / TOOLS</div>
      <button onClick={() => launch('settings', { title: 'Style Manager' })}><PanelSymbol kind="settings" /><span>Style Manager<small>Colors, wallpaper, type</small></span></button>
      <button onClick={() => launch('screenshot', { title: 'Screenshot', size: { width: 520, height: 380 } })}><PanelSymbol kind="camera" /><span>Screenshot<small>Capture a window or desktop</small></span></button>
      <button onClick={() => launch('calendar', { title: 'Calendar', size: { width: 280, height: 300 } })}><PanelSymbol kind="calendar" /><span>Calendar</span></button>
      <button onClick={() => launch('processmonitor', { title: 'Process Monitor', size: { width: 640, height: 480 } })}><PanelSymbol kind="activity" /><span>Process Monitor<small>Running applications</small></span></button>
    </div>}
  </div>
}
