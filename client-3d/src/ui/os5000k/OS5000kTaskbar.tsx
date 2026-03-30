import { useEffect, useState } from 'react'
import { useOS5kStore } from '../../stores/os5000kStore'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { win98, W98 } from './win98Styles'
import { useNotificationStore } from '../../stores/notificationStore'
import type { Notification } from '@heroiclabs/nakama-js'

export function OS5000kTaskbar() {
  const windows = useOS5kStore((s) => s.windows)
  const windowOrder = useOS5kStore((s) => s.windowOrder)
  const [time, setTime] = useState('')
  const [startOpen, setStartOpen] = useState(false)

  const notifications = useNotificationStore((s) => s.notifications)
  const [notifOpen, setNotifOpen] = useState(false)
  const acceptFriend = useNotificationStore((s) => s.acceptFriend)
  const declineFriend = useNotificationStore((s) => s.declineFriend)
  const dismiss = useNotificationStore((s) => s.dismiss)

  // Start polling when taskbar mounts (OS is active)
  useEffect(() => {
    useNotificationStore.getState().startPolling()
    return () => useNotificationStore.getState().stopPolling()
  }, [])

  const unread = notifications.length

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
      <div style={{ ...win98.systemTray, position: 'relative' }}>
        {/* Notification bell */}
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'default',
            position: 'relative',
            padding: '0 2px',
            fontSize: 13,
            lineHeight: 1,
          }}
          title="Notifications"
          onClick={(e) => { e.stopPropagation(); setNotifOpen((o) => !o) }}
        >
          🔔
          {unread > 0 && (
            <span style={{
              position: 'absolute',
              top: -4,
              right: -2,
              background: '#ef4444',
              color: '#fff',
              borderRadius: '50%',
              fontSize: 9,
              width: 14,
              height: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
            }}>{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: W98.black }}>{time}</span>

        {/* Notification panel — Win98 style popup above system tray */}
        {notifOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 26,
              right: 0,
              width: 260,
              background: W98.gray,
              ...win98.raised,
              zIndex: 10001,
              fontFamily: 'monospace',
              maxHeight: 300,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel title */}
            <div style={{ ...win98.titleActive, fontSize: 11, height: 18, flexShrink: 0 }}>
              🔔 Notifications
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '12px 8px', fontSize: 11, color: '#808080', textAlign: 'center' }}>
                  No notifications
                </div>
              ) : (
                notifications.map((notif: Notification) => (
                  <div key={notif.id} style={{ padding: '6px 8px', borderBottom: '1px solid #b0b0b0' }}>
                    <div style={{ fontSize: 11, marginBottom: 4 }}>{notif.subject}</div>
                    {notif.code === 2 ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={{ ...win98.button, fontSize: 10, padding: '1px 6px', flex: 1 }} onClick={() => acceptFriend(notif)}>Accept</button>
                        <button style={{ ...win98.button, fontSize: 10, padding: '1px 6px', flex: 1 }} onClick={() => declineFriend(notif)}>Decline</button>
                      </div>
                    ) : (
                      <button style={{ ...win98.button, fontSize: 10, padding: '1px 6px' }} onClick={() => dismiss(notif)}>Dismiss</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
