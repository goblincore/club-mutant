// Shared types for KonpyuuTA React package

export interface WindowState {
  id: string
  title: string
  app: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
  minimized: boolean
  maximized: boolean
  shaded: boolean
  workspace: number
  props?: Record<string, unknown>
}

export interface DesktopIcon {
  id: string
  label: string
  icon: string          // path to icon image
  app: string           // app name to open
  appProps?: Record<string, unknown>
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  icon?: string
  app?: string          // which app to open on click
  appProps?: Record<string, unknown>
  createdAt: number
}

export interface KonpyuuTAContextValue {
  nakamaClient?: unknown
  colyseusRoom?: unknown
  authStore?: unknown
  env: {
    youtubeApiUrl?: string
  }
}
