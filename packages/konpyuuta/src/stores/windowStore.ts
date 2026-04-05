import { create } from 'zustand'
import type { WindowState } from '../types'

interface WindowStoreState {
  windows: Record<string, WindowState>
  activeWindowId: string | null
  currentWorkspace: number
  nextZIndex: number

  openWindow: (app: string, opts?: Partial<Omit<WindowState, 'id' | 'app'>>) => string
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  moveWindow: (id: string, pos: { x: number; y: number }) => void
  resizeWindow: (id: string, size: { width: number; height: number }) => void
  minimizeWindow: (id: string) => void
  unminimizeWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  shadeWindow: (id: string) => void
  switchWorkspace: (n: number) => void
  setWindowProps: (id: string, props: Record<string, unknown>) => void
}

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: {},
  activeWindowId: null,
  currentWorkspace: 0,
  nextZIndex: 100,

  openWindow: (app, opts = {}) => {
    const id = crypto.randomUUID()
    const { nextZIndex, currentWorkspace } = get()
    const newWindow: WindowState = {
      id,
      app,
      title: opts.title ?? app,
      position: opts.position ?? { x: 80 + Math.floor(Math.random() * 80), y: 60 + Math.floor(Math.random() * 60) },
      size: opts.size ?? { width: 800, height: 600 },
      zIndex: nextZIndex,
      minimized: opts.minimized ?? false,
      maximized: opts.maximized ?? false,
      shaded: opts.shaded ?? false,
      workspace: opts.workspace ?? currentWorkspace,
      props: opts.props,
    }
    set((state) => ({
      windows: { ...state.windows, [id]: newWindow },
      activeWindowId: id,
      nextZIndex: state.nextZIndex + 1,
    }))
    return id
  },

  closeWindow: (id) => {
    set((state) => {
      const { [id]: _removed, ...rest } = state.windows
      return {
        windows: rest,
        activeWindowId: state.activeWindowId === id ? null : state.activeWindowId,
      }
    })
  },

  focusWindow: (id) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: {
          ...state.windows,
          [id]: { ...win, zIndex: state.nextZIndex },
        },
        activeWindowId: id,
        nextZIndex: state.nextZIndex + 1,
      }
    })
  },

  moveWindow: (id, pos) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: { ...state.windows, [id]: { ...win, position: pos } },
      }
    })
  },

  resizeWindow: (id, size) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: { ...state.windows, [id]: { ...win, size } },
      }
    })
  },

  minimizeWindow: (id) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: { ...state.windows, [id]: { ...win, minimized: true } },
        activeWindowId: state.activeWindowId === id ? null : state.activeWindowId,
      }
    })
  },

  unminimizeWindow: (id) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: { ...state.windows, [id]: { ...win, minimized: false, zIndex: state.nextZIndex } },
        activeWindowId: id,
        nextZIndex: state.nextZIndex + 1,
      }
    })
  },

  maximizeWindow: (id) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: { ...state.windows, [id]: { ...win, maximized: !win.maximized } },
      }
    })
  },

  shadeWindow: (id) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: { ...state.windows, [id]: { ...win, shaded: !win.shaded } },
      }
    })
  },

  switchWorkspace: (n) => {
    set({ currentWorkspace: n })
  },

  setWindowProps: (id, props) => {
    set((state) => {
      const win = state.windows[id]
      if (!win) return {}
      return {
        windows: { ...state.windows, [id]: { ...win, props: { ...win.props, ...props } } },
      }
    })
  },
}))
