import { useState, useEffect, useCallback } from 'react'
import {
  listNotifications,
  deleteNotifications,
  sendFriendRequest,
  removeFriend,
} from '../network/nakamaClient'
import type { Notification } from '@heroiclabs/nakama-js'

const POLL_INTERVAL = 60_000 // 60s

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  const fetchNotifications = useCallback(async () => {
    try {
      const notifs = await listNotifications(20)
      setNotifications(notifs)
    } catch {
      /* silent — not authenticated or network error */
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const unreadCount = notifications.length

  const handleOpen = () => {
    setOpen(true)
    fetchNotifications()
  }

  const handleAcceptFriend = async (notif: Notification) => {
    try {
      await sendFriendRequest([notif.sender_id!], [])
      await deleteNotifications([notif.id!])
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
    } catch { /* silent */ }
  }

  const handleDeclineFriend = async (notif: Notification) => {
    try {
      await removeFriend(notif.sender_id!)
      await deleteNotifications([notif.id!])
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
    } catch { /* silent */ }
  }

  const handleDismiss = async (notif: Notification) => {
    try {
      await deleteNotifications([notif.id!])
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
    } catch { /* silent */ }
  }

  return (
    <>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        title="notifications"
        className="relative w-9 h-9 rounded-full flex items-center justify-center
                   border-2 transition-all duration-200"
        style={{
          backgroundColor: 'rgba(0,0,0,0.7)',
          borderColor: 'rgba(57,255,20,0.6)',
          boxShadow: '0 0 12px rgba(57,255,20,0.3)',
          color: '#39ff14',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 20px rgba(57,255,20,0.6)'
          e.currentTarget.style.borderColor = '#39ff14'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 0 12px rgba(57,255,20,0.3)'
          e.currentTarget.style.borderColor = 'rgba(57,255,20,0.6)'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: '#ef4444', color: 'white' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {open && (
        <div
          className="fixed inset-0 flex items-start justify-end pt-14 pr-3"
          style={{ zIndex: 200 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="w-72 rounded-xl border-2 p-4 font-mono flex flex-col gap-3"
            style={{
              backgroundColor: 'rgba(0,0,0,0.92)',
              backdropFilter: 'blur(16px)',
              borderColor: 'rgba(57,255,20,0.4)',
              boxShadow: '0 0 40px rgba(57,255,20,0.15)',
              maxHeight: 'calc(100vh - 80px)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-white/70 text-xs font-bold uppercase tracking-wider">notifications</span>
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white text-base transition-colors"
                style={{ fontFamily: 'monospace' }}
              >×</button>
            </div>

            {notifications.length === 0 ? (
              <p className="text-white/30 text-xs text-center py-4">no notifications</p>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className="rounded-lg p-3 flex flex-col gap-2"
                    style={{ backgroundColor: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.15)' }}
                  >
                    <p className="text-white/80 text-xs">{notif.subject}</p>
                    {/* Code 2 = received friend request */}
                    {notif.code === 2 ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptFriend(notif)}
                          className="flex-1 py-1 rounded text-xs font-bold transition-colors"
                          style={{ backgroundColor: 'rgba(57,255,20,0.15)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.4)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.3)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.15)' }}
                        >accept</button>
                        <button
                          onClick={() => handleDeclineFriend(notif)}
                          className="flex-1 py-1 rounded text-xs font-bold transition-colors"
                          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)' }}
                        >decline</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDismiss(notif)}
                        className="text-right text-white/30 hover:text-white/60 text-[10px] transition-colors"
                      >dismiss</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
