import { createRoot } from 'react-dom/client'
import { useMemo, useEffect } from 'react'
import { KonpyuuTAProvider } from '../../../packages/konpyuuta/src/context/KonpyuuTAContext'
import { KonpyuuTADesktop } from '../../../packages/konpyuuta/src/components/KonpyuuTADesktop'
import { useDesktopStore } from '../../../packages/konpyuuta/src/stores/desktopStore'
import { useWindowStore } from '../../../packages/konpyuuta/src/stores/windowStore'
import { createPlaylistService } from '../ui/konpyuuta/playlistService'
import { useAuthStore } from '../stores/authStore'
import { createMailService } from '../services/mailService'
import { connectSocket } from '../network/nakamaClient'
import '../../../packages/konpyuuta/src/styles/cde.css'

function LiveReview() {
  const username = useAuthStore((s) => s.username)
  const userId = useAuthStore((s) => s.userId)
  const playlistService = useMemo(createPlaylistService, [])
  const mailService = useMemo(createMailService, [])
  useEffect(() => { if (userId) void connectSocket().catch(() => {}) }, [userId])
  return (
    <KonpyuuTAProvider
      username={username}
      userId={userId}
      playlistService={playlistService}
      mailService={mailService}
      env={{ youtubeApiUrl: import.meta.env.VITE_YOUTUBE_SERVICE_URL || 'http://localhost:8081' }}
    >
      <KonpyuuTADesktop onShutdown={() => { window.location.href = '/' }} />
      <div style={{ position: 'fixed', top: 28, left: 0, right: 0, zIndex: 100000, padding: '6px 12px', background: '#fff7d9', color: '#34344f', font: '11px monospace' }}>
        Live social preview · Real video results and letter delivery · Drafts stay on this device
      </div>
    </KonpyuuTAProvider>
  )
}

// A Vite development entry only; the production build still uses index.html.
// Use real search/import requests and the shared library, never override fetch.
if (import.meta.env.DEV) {
  useDesktopStore.getState().setBootStatus('ready')
  const app = new URLSearchParams(window.location.search).get('app') === 'mutantmail' ? 'mutantmail' : 'mutanttube'
  if (!Object.values(useWindowStore.getState().windows).some((win) => win.app === app)) useWindowStore.getState().openWindow(app, {
    title: app === 'mutantmail' ? 'Postbox' : 'TinyTubes',
    position: { x: 20, y: 64 },
    size: {
      width: Math.min(1000, window.innerWidth - 40),
      height: Math.min(720, window.innerHeight - 180),
    },
  })
  createRoot(document.getElementById('root')!).render(<LiveReview />)
}
