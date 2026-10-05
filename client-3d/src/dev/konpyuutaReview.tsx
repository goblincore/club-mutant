import { createRoot } from 'react-dom/client'
import { KonpyuuTAShell } from '../ui/konpyuuta/KonpyuuTAShell'
import { usePanelStore } from '../stores/panelStore'
import { useDesktopStore } from '../../../packages/konpyuuta/src/stores/desktopStore'
import { useWindowStore } from '../../../packages/konpyuuta/src/stores/windowStore'

// Real service wiring, development only. No substituted data or intercepted requests.
if (import.meta.env.DEV) {
  useDesktopStore.getState().setBootStatus('ready')
  usePanelStore.setState({ osActive: true })
  const requested = new URLSearchParams(window.location.search).get('app')
  const choices = { mutanttube: 'TinyTubes', mutantbook: 'Guestbook', messenger: 'Messenger', mutantmail: 'Postbox' }
  const app = requested && requested in choices ? requested as keyof typeof choices : 'mutanttube'
  if (!Object.values(useWindowStore.getState().windows).some((win) => win.app === app)) useWindowStore.getState().openWindow(app, {
    title: choices[app], position: { x: 20, y: 64 },
    size: { width: Math.min(1000, window.innerWidth - 40), height: Math.min(720, window.innerHeight - 180) },
  })
  createRoot(document.getElementById('root')!).render(<><KonpyuuTAShell /><div style={{position:'fixed',top:28,left:0,right:0,zIndex:100000,padding:'6px 12px',background:'#081309',color:'#b3cd95',font:'10px monospace'}}>Live social preview · Real services · Drafts stay on this device</div></>)
}
