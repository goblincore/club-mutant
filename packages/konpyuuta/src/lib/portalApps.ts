import { useWindowStore } from '../stores/windowStore'

export const PORTAL_APPS = [
  { app: 'mutanttube', name: 'TinyTubes' },
  { app: 'messenger', name: 'Messenger' },
  { app: 'mutantbook', name: 'Guestbook' },
  { app: 'mutantmail', name: 'Postbox' },
  { app: 'help', name: 'Help' },
  { app: 'guides', name: 'Guides' },
] as const
export type PortalAppId = typeof PORTAL_APPS[number]['app']

export function openPortalApp(app: PortalAppId) {
  const store = useWindowStore.getState()
  const existing = Object.values(store.windows).find((window) => window.app === app)
  if (existing) store.focusWindow(existing.id)
  else store.openWindow(app, { title: PORTAL_APPS.find((entry) => entry.app === app)!.name })
}
