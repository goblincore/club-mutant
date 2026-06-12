import { useWindowStore } from '../../stores/windowStore'

const APPS = [
  { id: 'netscape', label: 'Netscape Navigator', icon: '/icons/apps/netscape_classic.png' },
  { id: 'filemanager', label: 'File Manager', icon: '/icons/apps/filemanager.png' },
  { id: 'lynx', label: 'Lynx Browser', icon: '/icons/apps/Lynx.svg' },
  { id: 'processmonitor', label: 'Process Monitor', icon: '/icons/apps/org.xfce.taskmanager.png' },
  { id: 'calendar', label: 'Calendar', icon: '/icons/apps/calendar.svg' },
  { id: 'manviewer', label: 'Man Viewer', icon: '/icons/apps/man.png' },
  { id: 'settings', label: 'Style Manager', icon: '/icons/apps/org.xfce.settings.manager.png' },
]

const MENU_ITEMS = ['Application', 'Edit', 'View', 'Help']

export function AppManager() {
  const openWindow = useWindowStore(s => s.openWindow)

  return (
    <div className="am-root">
      <div className="am-menubar">
        {MENU_ITEMS.map(item => (
          <button key={item} className="menu-button">
            {item}
          </button>
        ))}
      </div>
      <div className="am-icon-grid">
        {APPS.map(app => (
          <button
            key={app.id}
            className="am-app-icon"
            onDoubleClick={() => openWindow(app.id, { title: app.label })}
          >
            <img
              src={app.icon}
              alt={app.label}
              onError={e => (e.currentTarget.style.display = 'none')}
            />
            <span>{app.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
