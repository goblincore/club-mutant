import { useState, useRef, useEffect, useCallback } from 'react'
import { useWindowStore } from '../stores/windowStore'

type SubpanelId = 'utilities' | 'style' | 'browser' | null

const WORKSPACE_LABELS = ['One', 'Two', 'Three', 'Four']

export function Panel() {
  const currentWorkspace = useWindowStore((s) => s.currentWorkspace)
  const switchWorkspace = useWindowStore((s) => s.switchWorkspace)
  const openWindow = useWindowStore((s) => s.openWindow)
  const windows = useWindowStore((s) => s.windows)
  const [openSubpanel, setOpenSubpanel] = useState<SubpanelId>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Count windows per workspace
  const windowCounts = WORKSPACE_LABELS.map((_, i) =>
    Object.values(windows).filter((w) => w.workspace === i && !w.minimized).length
  )

  // Close subpanel on outside click
  useEffect(() => {
    if (!openSubpanel) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenSubpanel(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openSubpanel])

  const toggleSubpanel = useCallback((id: SubpanelId) => {
    setOpenSubpanel((prev) => (prev === id ? null : id))
  }, [])

  function doScreenshot() {
    setOpenSubpanel(null)
    openWindow('screenshot', { title: 'Screenshot', size: { width: 520, height: 380 } })
  }

  function openApp(app: string, opts: Parameters<typeof openWindow>[1]) {
    setOpenSubpanel(null)
    openWindow(app, opts)
  }

  return (
    <>
      <div className="cde-panel" ref={panelRef}>
        {/* Left handle */}
        <div className="cde-handle" aria-label="Move Panel">
          <div className="handle-grip" />
        </div>

        {/* Apps button */}
        <div className="cde-control-wrapper">
          <div className="subpanel-arrow-spacer" />
          <button className="cde-control" aria-label="Applications" onClick={() => openApp('appmanager', { title: 'Application Manager', size: { width: 600, height: 450 } })}>
            <div className="control-content">
              <div className="control-icon">
                <img src="/icons/apps/linux_penguin.png" alt="Applications" />
              </div>
              <div className="control-label">Apps</div>
            </div>
          </button>
        </div>

        {/* Utilities button */}
        <div className="cde-control-wrapper" style={{ position: 'relative' }}>
          <button
            className={`subpanel-arrow${openSubpanel === 'utilities' ? ' active' : ''}`}
            aria-label="Utilities Menu"
            onClick={() => toggleSubpanel('utilities')}
          >
            <img src="/icons/actions/go-up.png" alt="" />
          </button>
          <button className="cde-control" aria-label="Utilities" onClick={() => openApp('processmonitor', { title: 'Process Monitor', size: { width: 640, height: 480 } })}>
            <div className="control-content">
              <div className="control-icon">
                <img src="/icons/system/applications-other.png" alt="Utilities" />
              </div>
              <div className="control-label">Utilities</div>
            </div>
          </button>
          {openSubpanel === 'utilities' && (
            <div className="cde-subpanel">
              <div className="cde-subpanel-item" onClick={() => openApp('processmonitor', { title: 'Process Monitor', size: { width: 640, height: 480 } })}>
                <img src="/icons/apps/org.xfce.taskmanager.png" alt="" />
                <span>Process Monitor</span>
              </div>
              <div className="cde-subpanel-item" onClick={() => openApp('calendar', { title: 'Calendar', size: { width: 280, height: 300 } })}>
                <img src="/icons/apps/office-calendar.png" alt="" />
                <span>Calendar</span>
              </div>
              <div className="cde-subpanel-item" onClick={doScreenshot}>
                <img src="/icons/apps/org.xfce.screenshooter.png" alt="" />
                <span>Screenshot</span>
              </div>
            </div>
          )}
        </div>

        {/* Style Manager button */}
        <div className="cde-control-wrapper" style={{ position: 'relative' }}>
          <button
            className={`subpanel-arrow${openSubpanel === 'style' ? ' active' : ''}`}
            aria-label="Style Manager Menu"
            onClick={() => toggleSubpanel('style')}
          >
            <img src="/icons/actions/go-up.png" alt="" />
          </button>
          <button
            className="cde-control"
            aria-label="Style Manager"
            onClick={() => openApp('settings', { title: 'Style Manager' })}
          >
            <div className="control-content">
              <div className="control-icon">
                <img src="/icons/apps/org.xfce.settings.manager.png" alt="Style Manager" />
              </div>
              <div className="control-label">Style<br />Manager</div>
            </div>
          </button>
          {openSubpanel === 'style' && (
            <div className="cde-subpanel">
              <div className="cde-subpanel-item" onClick={() => openApp('settings', { title: 'Style Manager', props: { tab: 'color' } })}>
                <img src="/icons/apps/org.xfce.settings.manager.png" alt="" />
                <span>Color…</span>
              </div>
              <div className="cde-subpanel-item" onClick={() => openApp('settings', { title: 'Style Manager', props: { tab: 'backdrop' } })}>
                <img src="/icons/apps/org.xfce.settings.manager.png" alt="" />
                <span>Backdrop…</span>
              </div>
              <div className="cde-subpanel-item" onClick={() => openApp('settings', { title: 'Style Manager', props: { tab: 'font' } })}>
                <img src="/icons/apps/org.xfce.settings.manager.png" alt="" />
                <span>Font…</span>
              </div>
            </div>
          )}
        </div>

        {/* Browser button */}
        <div className="cde-control-wrapper" style={{ position: 'relative' }}>
          <button
            className={`subpanel-arrow${openSubpanel === 'browser' ? ' active' : ''}`}
            aria-label="Browser Menu"
            onClick={() => toggleSubpanel('browser')}
          >
            <img src="/icons/actions/go-up.png" alt="" />
          </button>
          <button className="cde-control" aria-label="Browser" onClick={() => openApp('netscape', { title: 'Netscape Navigator', size: { width: 780, height: 580 } })}>
            <div className="control-content">
              <div className="control-icon">
                <img src="/icons/apps/konqueror.png" alt="Browser" />
              </div>
              <div className="control-label">Browser</div>
            </div>
          </button>
          {openSubpanel === 'browser' && (
            <div className="cde-subpanel">
              <div className="cde-subpanel-item" onClick={() => openApp('netscape', { title: 'Netscape Navigator', size: { width: 780, height: 580 } })}>
                <img src="/icons/apps/netscape_classic.png" alt="" />
                <span>Netscape Navigator</span>
              </div>
              <div className="cde-subpanel-item" onClick={() => openApp('lynx', { title: 'Lynx', size: { width: 700, height: 500 } })}>
                <img src="/icons/apps/lynx.png" alt="" />
                <span>Lynx Text Browser</span>
              </div>
              <div className="cde-subpanel-item" onClick={() => openApp('mutanttube', { title: 'MutantTube', size: { width: 900, height: 650 } })}>
                <img src="/icons/apps/mutanttube.svg" alt="" />
                <span>MutantTube</span>
              </div>
            </div>
          )}
        </div>

        {/* Workspace area: pager */}
        <div className="cde-workspace-area">
          <div className="cde-workspace-switch" role="tablist" aria-label="Workspaces">
            {WORKSPACE_LABELS.map((label, i) => (
              <button
                key={i}
                className={`workspace-btn${i === currentWorkspace ? ' active' : ''}`}
                onClick={() => switchWorkspace(i)}
                role="tab"
                aria-label={`Workspace ${label}`}
                aria-selected={i === currentWorkspace}
              >
                <span className="workspace-btn-label">{label}</span>
                {windowCounts[i] > 0 && (
                  <span className="workspace-btn-count">{windowCounts[i]}w</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* File Manager button */}
        <div className="cde-control-wrapper">
          <div className="subpanel-arrow-spacer" />
          <button className="cde-control" aria-label="File Manager" onClick={() => openApp('filemanager', { title: 'File Manager', size: { width: 680, height: 500 } })}>
            <div className="control-content">
              <div className="control-icon">
                <img src="/icons/apps/filemanager.png" alt="File Manager" />
              </div>
              <div className="control-label">File<br />Manager</div>
            </div>
          </button>
        </div>

        {/* Screenshot button */}
        <div className="cde-control-wrapper">
          <div className="subpanel-arrow-spacer" />
          <button className="cde-control" aria-label="Screenshot" onClick={doScreenshot}>
            <div className="control-content">
              <div className="control-icon">
                <img src="/icons/apps/org.xfce.screenshooter.png" alt="Screenshot" />
              </div>
              <div className="control-label">Screenshot</div>
            </div>
          </button>
        </div>

        {/* Process Monitor button */}
        <div className="cde-control-wrapper">
          <div className="subpanel-arrow-spacer" />
          <button className="cde-control" aria-label="Process Monitor" onClick={() => openApp('processmonitor', { title: 'Process Monitor', size: { width: 640, height: 480 } })}>
            <div className="control-content">
              <div className="control-icon">
                <img src="/icons/apps/org.xfce.taskmanager.png" alt="Process Monitor" />
              </div>
              <div className="control-label">Process Monitor</div>
            </div>
          </button>
        </div>

        {/* Right handle */}
        <div className="cde-handle" aria-label="Move Panel">
          <div className="handle-grip" />
        </div>
      </div>
    </>
  )
}
