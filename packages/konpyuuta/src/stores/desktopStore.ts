import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PORTAL_ICONS } from '../lib/socialIcons'
import { PORTAL_APPS } from '../lib/portalApps'
import type { DesktopIcon, NotificationItem } from '../types'

type BootStatus = 'booting' | 'ready'

interface DesktopStoreState {
  bootStatus: BootStatus
  wallpaper: string | null
  icons: DesktopIcon[]
  notifications: NotificationItem[]

  setBootStatus: (status: BootStatus) => void
  setWallpaper: (path: string | null) => void
  setIcons: (icons: DesktopIcon[]) => void
  addNotification: (n: Omit<NotificationItem, 'id' | 'createdAt'>) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
}

const DEFAULT_ICONS: DesktopIcon[] = PORTAL_APPS.map(({app, name}) => ({id:app, label:name, app, icon:PORTAL_ICONS[app]}))

export const useDesktopStore = create<DesktopStoreState>()(
  persist(
    (set) => ({
      bootStatus: 'booting',
      wallpaper: '/backdrops/CircuitBoards.pm',
      icons: DEFAULT_ICONS,
      notifications: [],

      setBootStatus: (status) => set({ bootStatus: status }),

      setWallpaper: (path) => set({ wallpaper: path }),

      setIcons: (icons) => set({ icons }),

      addNotification: (n) => {
        const item: NotificationItem = {
          ...n,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        }
        set((state) => ({ notifications: [...state.notifications, item] }))
      },

      dismissNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      },

      clearNotifications: () => set({ notifications: [] }),
    }),
    {
      name: 'konpyuuta-desktop',
      partialize: (state) => ({ wallpaper: state.wallpaper }),
    }
  )
)
