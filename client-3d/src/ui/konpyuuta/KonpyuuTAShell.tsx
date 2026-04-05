import { KonpyuuTADesktop } from '@club-mutant/konpyuuta'
import { KonpyuuTAProvider } from '@club-mutant/konpyuuta/context'
import { useUIStore } from '../../stores/uiStore'
import '../../../../packages/konpyuuta/src/styles/cde.css'

export function KonpyuuTAShell() {
  const osActive = useUIStore((s) => s.osActive)

  if (!osActive) return null

  return (
    <KonpyuuTAProvider
      env={{
        youtubeApiUrl: import.meta.env.VITE_YOUTUBE_API_URL,
      }}
    >
      <KonpyuuTADesktop onShutdown={() => useUIStore.getState().setOsActive(false)} />
    </KonpyuuTAProvider>
  )
}
