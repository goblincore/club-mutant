import { create } from 'zustand'

interface OS5kWindowState {
  id: string
  appId: string
  title: string
  icon: string
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  maximized: boolean
}

interface OS5kState {
  windows: Map<string, OS5kWindowState>
  windowOrder: string[]  // z-order stack, last = top/focused
  bootPhase: 'off' | 'booting' | 'desktop'
  activeVideo: { videoId: string; title: string } | null

  openApp: (appId: string, title: string, icon: string, width: number, height: number) => string
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  unmaximizeWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, width: number, height: number) => void
  setBootPhase: (phase: 'off' | 'booting' | 'desktop') => void
  setActiveVideo: (video: { videoId: string; title: string } | null) => void
  closeAllWindows: () => void
}

const STAGGER_OFFSET = 30

export const useOS5kStore = create<OS5kState>((set, get) => ({
  windows: new Map(),
  windowOrder: [],
  bootPhase: 'off',
  activeVideo: null,

  openApp: (appId, title, icon, width, height) => {
    const id = crypto.randomUUID()
    const { windows } = get()
    const count = windows.size
    const x = 80 + count * STAGGER_OFFSET
    const y = 60 + count * STAGGER_OFFSET

    const win: OS5kWindowState = {
      id,
      appId,
      title,
      icon,
      x,
      y,
      width,
      height,
      minimized: false,
      maximized: false,
    }

    set((s) => {
      const next = new Map(s.windows)
      next.set(id, win)
      return { windows: next, windowOrder: [...s.windowOrder, id] }
    })

    return id
  },

  closeWindow: (id) => {
    set((s) => {
      const next = new Map(s.windows)
      next.delete(id)
      return {
        windows: next,
        windowOrder: s.windowOrder.filter((wid) => wid !== id),
      }
    })
  },

  focusWindow: (id) => {
    set((s) => ({
      windowOrder: [...s.windowOrder.filter((wid) => wid !== id), id],
    }))
  },

  minimizeWindow: (id) => {
    set((s) => {
      const next = new Map(s.windows)
      const win = next.get(id)
      if (win) next.set(id, { ...win, minimized: true })
      return { windows: next }
    })
  },

  restoreWindow: (id) => {
    set((s) => {
      const next = new Map(s.windows)
      const win = next.get(id)
      if (win) next.set(id, { ...win, minimized: false })
      return { windows: next }
    })
  },

  maximizeWindow: (id) => {
    set((s) => {
      const next = new Map(s.windows)
      const win = next.get(id)
      if (win) next.set(id, { ...win, maximized: true })
      return { windows: next }
    })
  },

  unmaximizeWindow: (id) => {
    set((s) => {
      const next = new Map(s.windows)
      const win = next.get(id)
      if (win) next.set(id, { ...win, maximized: false })
      return { windows: next }
    })
  },

  moveWindow: (id, x, y) => {
    set((s) => {
      const next = new Map(s.windows)
      const win = next.get(id)
      if (win) next.set(id, { ...win, x, y })
      return { windows: next }
    })
  },

  resizeWindow: (id, width, height) => {
    set((s) => {
      const next = new Map(s.windows)
      const win = next.get(id)
      if (win) next.set(id, { ...win, width, height })
      return { windows: next }
    })
  },

  setBootPhase: (phase) => set({ bootPhase: phase }),

  setActiveVideo: (video) => set({ activeVideo: video }),

  closeAllWindows: () => set({ windows: new Map(), windowOrder: [] }),
}))
