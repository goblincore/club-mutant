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
  { id: 'netscape', label: 'Netscape', icon: '/icons/apps/netscape_classic.png', app: 'netscape' },
  { id: 'lynx', label: 'Lynx', icon: '/icons/apps/Lynx.svg', app: 'lynx' },
  { id: 'mutanttube', label: 'MutantTube', icon: '/icons/apps/mutanttube.svg', app: 'mutanttube' },
  { id: 'mutantbook', label: 'MutantBook', icon: '/icons/apps/mutantbook.svg', app: 'mutantbook' },
  { id: 'messenger', label: 'Messenger', icon: '/icons/apps/messenger.svg', app: 'messenger' },
  { id: 'mutantmail', label: 'MutantMail', icon: '/icons/apps/mutantmail.svg', app: 'mutantmail' },
  { id: 'settings', label: 'Style Manager', icon: '/icons/apps/org.xfce.settings.manager.png', app: 'settings' },
  { id: 'filemanager', label: 'File Manager', icon: '/icons/apps/filemanager.png', app: 'filemanager' },
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
