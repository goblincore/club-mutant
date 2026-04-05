import { useEffect } from 'react'
import { useDesktopStore } from '../stores/desktopStore'
import { useWindowStore } from '../stores/windowStore'
import type { NotificationItem } from '../types'

interface NotificationToastProps {
  notification: NotificationItem
}

function NotificationToast({ notification }: NotificationToastProps) {
  const dismiss = useDesktopStore((s) => s.dismissNotification)
  const openWindow = useWindowStore((s) => s.openWindow)

  useEffect(() => {
    const t = setTimeout(() => dismiss(notification.id), 5000)
    return () => clearTimeout(t)
  }, [notification.id, dismiss])

  const handleClick = () => {
    if (notification.app) {
      openWindow(notification.app, { props: notification.appProps })
    }
    dismiss(notification.id)
  }

  return (
    <div className="cde-notification" onClick={handleClick}>
      {notification.icon && (
        <img src={notification.icon} alt="" className="cde-notification-icon" />
      )}
      <div className="cde-notification-content">
        <div className="cde-notification-title">{notification.title}</div>
        <div className="cde-notification-body">{notification.body}</div>
      </div>
      <button
        className="cde-notification-close"
        onClick={(e) => { e.stopPropagation(); dismiss(notification.id) }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

export function NotificationPopup() {
  const notifications = useDesktopStore((s) => s.notifications)

  if (notifications.length === 0) return null

  return (
    <div className="cde-notifications-container">
      {notifications.map((n) => (
        <NotificationToast key={n.id} notification={n} />
      ))}
    </div>
  )
}
