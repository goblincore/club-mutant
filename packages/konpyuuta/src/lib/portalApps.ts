import { useWindowStore } from '../stores/windowStore'
import { usePortalStore } from '../stores/portalStore'
import { useMessengerStore } from '../stores/messengerStore'

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
  if (app === 'messenger') {
    useMessengerStore.getState().setActiveConversation(null)
    usePortalStore.getState().openMessenger()
    return
  }
  usePortalStore.getState().focusMessenger(false)
  const store = useWindowStore.getState()
  const existing = Object.values(store.windows).find((window) => window.app === app)
  if (existing) store.focusWindow(existing.id)
  else store.openWindow(app, { title: PORTAL_APPS.find((entry) => entry.app === app)!.name })
}
