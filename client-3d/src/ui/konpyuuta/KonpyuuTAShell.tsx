import { useEffect, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'

const KONPYUUTA_URL = '/konpyuuta/'

export function KonpyuuTAShell() {
  const osActive = useUIStore((s) => s.osActive)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Listen for shutdown from the Astro app
  useEffect(() => {
    if (!osActive) return
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'shutdown') {
        useUIStore.getState().setOsActive(false)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [osActive])

  // Send auth tokens to the Astro app once the iframe loads
  const handleIframeLoad = () => {
    const { token, refreshToken } = useAuthStore.getState()
    iframeRef.current?.contentWindow?.postMessage({
      type: 'boot',
      nakamaToken: token,
      refreshToken,
      nakamaHost: import.meta.env.VITE_NAKAMA_HOST ?? 'localhost',
      nakamaPort: import.meta.env.VITE_NAKAMA_PORT ?? '7350',
      useSSL: import.meta.env.VITE_NAKAMA_USE_SSL === 'true',
      youtubeApiUrl: import.meta.env.VITE_YOUTUBE_API_URL ?? 'http://localhost:8081',
    }, '*')
  }

  if (!osActive) return null

  return (
    <iframe
      ref={iframeRef}
      src={KONPYUUTA_URL}
      onLoad={handleIframeLoad}
      title="KonpyuuTA Desktop"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        zIndex: 40,
      }}
    />
  )
}
