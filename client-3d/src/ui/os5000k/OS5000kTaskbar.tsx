import { useEffect, useState } from 'react'
import { useOS5kStore } from '../../stores/os5000kStore'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { win98, W98 } from './win98Styles'

export function OS5000kTaskbar() {
  const windows = useOS5kStore((s) => s.windows)
  const windowOrder = useOS5kStore((s) => s.windowOrder)
  const [time, setTime] = useState('')
  const [startOpen, setStartOpen] = useState(false)

  useEffect(() => {
    const update = () => {
      const d = new Date()
      setTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [])

  const focusedId = windowOrder.length > 0 ? windowOrder[windowOrder.length - 1] : null

  const handleShutDown = () => {
    setStartOpen(false)
    useOS5kStore.getState().requestShutdown()
  }

  const handleLogOut = () => {
    setStartOpen(false)
    useOS5kStore.getState().confirmShutdown()
    useUIStore.getState().setOsActive(false)
    useAuthStore.getState().logout()
  }

  return (
    <div
      style={{ ...win98.taskbar, position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 9999 }}
      onClick={() => startOpen && setStartOpen(false)}
    >
      {/* Start button */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...win98.button, fontWeight: 'bold', padding: '1px 8px', height: 22 }}
          onClick={(e) => { e.stopPropagation(); setStartOpen((o) => !o) }}
        >
          ⊞ Start
        </button>
        {startOpen && (
          <div style={{
            position: 'absolute',
            bottom: 26,
            left: 0,
            background: W98.gray,
            ...win98.raised,
            minWidth: 140,
            zIndex: 10000,
            fontFamily: 'monospace',
            fontSize: 11,
          }}>
            {[
              { label: '🔴 Shut Down…', action: handleShutDown },
              { label: '🚪 Log Out', action: handleLogOut },
            ].map(({ label, action }) => (
              <div
                key={label}
                onClick={action}
                style={{ padding: '6px 12px', cursor: 'default', color: W98.black }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#000080'; (e.currentTarget as HTMLDivElement).style.color = '#fff' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; (e.currentTarget as HTMLDivElement).style.color = W98.black }}
              >{label}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 18, background: W98.mid, margin: '0 2px' }} />

      {/* Window buttons */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
        {Array.from(windows.values()).map((win) => {
          const focused = win.id === focusedId && !win.minimized
          return (
            <button
              key={win.id}
              onClick={() => {
                if (win.minimized) useOS5kStore.getState().restoreWindow(win.id)
                useOS5kStore.getState().focusWindow(win.id)
              }}
              style={{
                ...win98.button,
                ...(focused ? win98.sunken : win98.raised),
                height: 22,
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: win.minimized ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 6px',
              }}
            >
              <span style={{ fontSize: 12 }}>{win.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{win.title}</span>
            </button>
          )
        })}
      </div>

      {/* System tray */}
      <div style={win98.systemTray}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: W98.black }}>{time}</span>
      </div>
    </div>
  )
}
