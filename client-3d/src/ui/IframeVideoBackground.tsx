import { useRef, useEffect } from 'react'
import ReactPlayer from 'react-player/youtube'

import { useMusicStore } from '../stores/musicStore'

/**
 * Fullscreen iframe YouTube player rendered BEHIND the transparent 3D canvas.
 * Mounted/unmounted by App.tsx based on videoBgMode === 'iframe'.
 */
export function IframeVideoBackground() {
  const stream = useMusicStore((s) => s.stream)
  const playerRef = useRef<ReactPlayer>(null)

  // Seek to correct offset on mount / stream change
  useEffect(() => {
    if (!stream.isPlaying || !stream.startTime || !playerRef.current) return

    const offsetSec = (Date.now() - stream.startTime) / 1000

    if (offsetSec > 1) {
      playerRef.current.seekTo(offsetSec, 'seconds')
    }
  }, [stream.currentLink, stream.startTime, stream.isPlaying])

  if (!stream.currentLink) return null

  return (
    <ReactPlayer
      ref={playerRef}
      url={stream.currentLink}
      playing={stream.isPlaying}
      volume={0}
      muted
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
      }}
      config={{
        playerVars: {
          autoplay: 1,
          controls: 0,
        },
      }}
    />
  )
}
