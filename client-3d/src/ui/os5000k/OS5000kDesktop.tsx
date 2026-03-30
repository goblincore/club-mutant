import type { CSSProperties } from 'react'
import { useOS5kStore } from '../../stores/os5000kStore'
import { OS5K_APPS } from './os5kAppRegistry'

export function OS5000kDesktop() {
  const openApp = useOS5kStore((s) => s.openApp)
  const wallpaper = useOS5kStore((s) => (s as any).wallpaper)

  const handleOpenApp = (app: typeof OS5K_APPS[number]) => {
    openApp(app.id, app.name, app.icon, app.width, app.height)
  }

  const bgStyle: CSSProperties = wallpaper
    ? wallpaper.type === 'image'
      ? { backgroundImage: `url(${wallpaper.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : wallpaper.type === 'color'
        ? { background: wallpaper.value }
        : { background: wallpaper.value }  // preset — CSS string
    : { background: '#008080' }  // Win98 default teal

  return (
    <div className="absolute inset-0 select-none" style={bgStyle}>
      {/* Icon grid */}
      <div style={{ padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'flex-start' }}>
        {OS5K_APPS.map((app) => (
          <button
            key={app.id}
            onDoubleClick={() => handleOpenApp(app)}
            title={app.description}
            style={{
              width: 72,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 4px',
              cursor: 'default',
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,128,0.4)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <span style={{ fontSize: 28 }}>{app.icon}</span>
            <span style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#fff',
              textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000',
              textAlign: 'center',
              lineHeight: 1.2,
              wordBreak: 'break-word',
            }}>{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
