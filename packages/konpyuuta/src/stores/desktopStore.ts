import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

const DEFAULT_ICONS: DesktopIcon[] = [
  { id: 'netscape', label: 'Netscape', icon: '/icons/apps/netscape.png', app: 'netscape' },
  { id: 'mutanttube', label: 'MutantTube', icon: '/icons/apps/mutanttube.png', app: 'netscape', appProps: { url: 'mutanttube' } },
  { id: 'mutantbook', label: 'MutantBook', icon: '/icons/apps/mutantbook.png', app: 'netscape', appProps: { url: 'mutantbook' } },
  { id: 'messenger', label: 'Messenger', icon: '/icons/apps/messenger.png', app: 'messenger' },
  { id: 'settings', label: 'Settings', icon: '/icons/apps/settings.png', app: 'settings' },
  { id: 'appmanager', label: 'App Manager', icon: '/icons/apps/appmanager.png', app: 'appmanager' },
]

export const useDesktopStore = create<DesktopStoreState>()(
  persist(
    (set) => ({
      bootStatus: 'booting',
      wallpaper: null,
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
