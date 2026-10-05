import { useWindowStore } from '../../stores/windowStore'
import { DESKTOP_ICONS } from '../../lib/socialIcons'

const APPS = [
  { id: 'mutanttube', label: 'TinyTubes', icon: DESKTOP_ICONS.mutanttube },
  { id: 'mutantbook', label: 'Guestbook', icon: DESKTOP_ICONS.mutantbook },
  { id: 'messenger', label: 'Messenger', icon: DESKTOP_ICONS.messenger },
  { id: 'mutantmail', label: 'Postbox', icon: DESKTOP_ICONS.mutantmail },
  { id: 'netscape', label: 'NEETscape', icon: DESKTOP_ICONS.netscape },
  { id: 'filemanager', label: 'File Manager', icon: DESKTOP_ICONS.filemanager },
  { id: 'processmonitor', label: 'Process Monitor', icon: '/icons/apps/org.xfce.taskmanager.png' },
  { id: 'calendar', label: 'Calendar', icon: '/icons/apps/calendar.svg' },
  { id: 'manviewer', label: 'Man Viewer', icon: '/icons/apps/man.png' },
  { id: 'settings', label: 'Style Manager', icon: DESKTOP_ICONS.settings },
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
