import { useWindowStore } from '../stores/windowStore'

export function Panel() {
  const currentWorkspace = useWindowStore((s) => s.currentWorkspace)
  const switchWorkspace = useWindowStore((s) => s.switchWorkspace)
  const openWindow = useWindowStore((s) => s.openWindow)

  const workspaceLabels = ['One', 'Two', 'Three', 'Four']

  return (
    <div className="cde-panel">
      {/* Left handle */}
      <div className="cde-handle" aria-label="Move Panel">
        <div className="handle-grip" />
      </div>

      {/* Apps button */}
      <div className="cde-control-wrapper">
        <div className="subpanel-arrow-spacer" />
        <button className="cde-control" aria-label="Applications" onClick={() => openWindow('appmanager', { title: 'Application Manager', size: { width: 600, height: 450 } })}>
          <div className="control-content">
            <div className="control-icon">
              <img src="/icons/apps/linux_penguin.png" alt="Applications" />
            </div>
            <div className="control-label">Apps</div>
          </div>
        </button>
      </div>

      {/* Utilities button */}
      <div className="cde-control-wrapper">
        <button className="subpanel-arrow" aria-label="Utilities Menu">
          <img src="/icons/actions/go-up.png" alt="" />
        </button>
        <button className="cde-control" aria-label="Utilities" onClick={() => {}}>
          <div className="control-content">
            <div className="control-icon">
              <img src="/icons/system/applications-other.png" alt="Utilities" />
            </div>
            <div className="control-label">Utilities</div>
          </div>
        </button>
      </div>

      {/* Style Manager button */}
      <div className="cde-control-wrapper">
        <button className="subpanel-arrow" aria-label="Style Manager Menu">
          <img src="/icons/actions/go-up.png" alt="" />
        </button>
        <button
          className="cde-control"
          aria-label="Style Manager"
          onClick={() => openWindow('settings', { title: 'Style Manager' })}
        >
          <div className="control-content">
            <div className="control-icon">
              <img src="/icons/apps/org.xfce.settings.manager.png" alt="Style Manager" />
            </div>
            <div className="control-label">Style<br />Manager</div>
          </div>
        </button>
      </div>

      {/* Browser button */}
      <div className="cde-control-wrapper">
        <button className="subpanel-arrow" aria-label="Browser Menu">
          <img src="/icons/actions/go-up.png" alt="" />
        </button>
        <button className="cde-control" aria-label="Browser" onClick={() => openWindow('netscape', { title: 'Netscape Navigator', size: { width: 780, height: 580 } })}>
          <div className="control-content">
            <div className="control-icon">
              <img src="/icons/apps/konqueror.png" alt="Browser" />
            </div>
            <div className="control-label">Browser</div>
          </div>
        </button>
      </div>

      {/* Workspace area: lock + pager + exit */}
      <div className="cde-workspace-area">
        <div className="cde-side-controls">
          <button className="cde-small-btn" aria-label="Lock">
            <img src="/icons/actions/lock.png" alt="Lock" />
          </button>
        </div>

        <div className="cde-workspace-switch" role="tablist" aria-label="Workspaces">
          {workspaceLabels.map((label, i) => (
            <button
              key={i}
              className={`workspace-btn${i === currentWorkspace ? ' active' : ''}`}
              onClick={() => switchWorkspace(i)}
              role="tab"
              aria-label={`Workspace ${label}`}
              aria-selected={i === currentWorkspace}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="cde-side-controls">
          <button className="cde-small-btn" aria-label="Exit">
            <img src="/icons/actions/exit.png" alt="Exit" />
          </button>
        </div>
      </div>

      {/* File Manager button */}
      <div className="cde-control-wrapper">
        <div className="subpanel-arrow-spacer" />
        <button className="cde-control" aria-label="File Manager" onClick={() => openWindow('filemanager', { title: 'File Manager', size: { width: 680, height: 500 } })}>
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
        <button className="cde-control" aria-label="Screenshot" onClick={() => {}}>
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
        <button className="cde-control" aria-label="Process Monitor" onClick={() => openWindow('processmonitor', { title: 'Process Monitor', size: { width: 640, height: 480 } })}>
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
  )
}
