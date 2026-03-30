import { create } from 'zustand'
import type { Notification } from '@heroiclabs/nakama-js'
import {
  listNotifications,
  deleteNotifications,
  sendFriendRequest,
  removeFriend,
} from '../network/nakamaClient'

const POLL_INTERVAL = 60_000

interface NotificationState {
  notifications: Notification[]
  polling: boolean
  startPolling: () => void
  stopPolling: () => void
  fetch: () => Promise<void>
  acceptFriend: (notif: Notification) => Promise<void>
  declineFriend: (notif: Notification) => Promise<void>
  dismiss: (notif: Notification) => Promise<void>
}

let _pollTimer: ReturnType<typeof setInterval> | null = null

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  polling: false,

  fetch: async () => {
    try {
      const notifs = await listNotifications(20)
      set({ notifications: notifs })
    } catch { /* silent */ }
  },

  startPolling: () => {
    if (_pollTimer) return
    get().fetch()
    _pollTimer = setInterval(() => get().fetch(), POLL_INTERVAL)
    set({ polling: true })
  },

  stopPolling: () => {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
    set({ polling: false })
  },

  acceptFriend: async (notif) => {
    try {
      await sendFriendRequest([notif.sender_id!], [])
      await deleteNotifications([notif.id!])
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== notif.id) }))
    } catch { /* silent */ }
  },

  declineFriend: async (notif) => {
    try {
      await removeFriend(notif.sender_id!)
      await deleteNotifications([notif.id!])
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== notif.id) }))
    } catch { /* silent */ }
  },

  dismiss: async (notif) => {
    try {
      await deleteNotifications([notif.id!])
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== notif.id) }))
    } catch { /* silent */ }
  },
}))
