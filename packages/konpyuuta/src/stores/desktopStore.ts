import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DESKTOP_ICONS } from '../lib/socialIcons'
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
  { id: 'netscape', label: 'NEETscape', icon: DESKTOP_ICONS.netscape, app: 'netscape' },
  { id: 'mutanttube', label: 'TinyTubes', icon: DESKTOP_ICONS.mutanttube, app: 'mutanttube' },
  { id: 'mutantbook', label: 'Guestbook', icon: DESKTOP_ICONS.mutantbook, app: 'mutantbook' },
  { id: 'messenger', label: 'Messenger', icon: DESKTOP_ICONS.messenger, app: 'messenger' },
  { id: 'mutantmail', label: 'Postbox', icon: DESKTOP_ICONS.mutantmail, app: 'mutantmail' },
  { id: 'settings', label: 'Style Manager', icon: DESKTOP_ICONS.settings, app: 'settings' },
  { id: 'filemanager', label: 'File Manager', icon: DESKTOP_ICONS.filemanager, app: 'filemanager' },
]

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
