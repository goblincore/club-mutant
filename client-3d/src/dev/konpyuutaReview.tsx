import { createRoot } from 'react-dom/client'
import { KonpyuuTAShell } from '../ui/konpyuuta/KonpyuuTAShell'
import { usePanelStore } from '../stores/panelStore'
import { useWindowStore } from '../../../packages/konpyuuta/src/stores/windowStore'
import { openPortalApp } from '../../../packages/konpyuuta/src/lib/portalApps'

// Real service wiring, development only. No substituted data or intercepted requests.
if (import.meta.env.DEV) {
  usePanelStore.setState({ osActive: true })
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('app')
  const choices = { help: 'Help', guides: 'Guides', mutanttube: 'TinyTubes', mutantbook: 'Guestbook', messenger: 'Messenger', mutantmail: 'Postbox' }
  const app = requested && requested in choices ? requested as keyof typeof choices : 'mutanttube'
  if (requested === 'home' || requested === 'netscape') useWindowStore.getState().showHome()
  else if (app === 'messenger') openPortalApp('messenger')
  else if (!Object.values(useWindowStore.getState().windows).some((win) => win.app === app)) useWindowStore.getState().openWindow(app, {
    title: choices[app], position: { x: 20, y: 64 },
    size: { width: Math.min(1000, window.innerWidth - 40), height: Math.min(720, window.innerHeight - 180) },
  })
  createRoot(document.getElementById('root')!).render(<><KonpyuuTAShell />{params.get('capture') !== '1' && <div style={{position:'fixed',top:28,left:0,right:0,zIndex:100000,padding:'6px 12px',background:'#081309',color:'#b3cd95',font:'10px monospace'}}>Live social preview · Real services · Drafts stay on this device</div>}</>)
}
