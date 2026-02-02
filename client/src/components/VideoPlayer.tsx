import { useRef } from 'react'
import ReactPlayer from 'react-player/youtube'
import IconButton from '@mui/material/IconButton'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import { EmptyVideo } from './YoutubePlayer.styles'

interface VideoPlayerProps {
  url: string
  isPlaying: boolean
  isMuted: boolean
  isHidden: boolean
  videoBackgroundEnabled: boolean
  canToggleBackground: boolean
  onReady: () => void
  onEnded: () => void
  onBufferEnd: () => void
  onToggleBackground: () => void
}

export function VideoPlayer({
  url,
  isPlaying,
  isMuted,
  isHidden,
  videoBackgroundEnabled,
  canToggleBackground,
  onReady,
  onEnded,
  onBufferEnd,
  onToggleBackground,
}: VideoPlayerProps) {
  const playerRef = useRef<any>(null)

  const hiddenStyle = isHidden
    ? {
        position: 'fixed' as const,
        left: -10000,
        top: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none' as const,
        overflow: 'hidden' as const,
      }
    : undefined

  if (!url) {
    if (isHidden) return null
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <EmptyVideo>Room Stream</EmptyVideo>
        <IconButton
          aria-label={videoBackgroundEnabled ? 'disable video background' : 'enable video background'}
          disabled={!canToggleBackground}
          onClick={onToggleBackground}
          size="small"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'rgba(255, 255, 255, 0.9)',
            padding: 4,
            borderRadius: 8,
          }}
        >
          {videoBackgroundEnabled ? (
            <FullscreenExitIcon fontSize="small" />
          ) : (
            <FullscreenIcon fontSize="small" />
          )}
        </IconButton>
      </div>
    )
  }

  return (
    <div style={hiddenStyle}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <ReactPlayer
          ref={playerRef}
          onReady={onReady}
          onEnded={onEnded}
          onBufferEnd={onBufferEnd}
          width="200px"
          height="130px"
          playing={isPlaying}
          muted={isMuted}
          url={url}
        />
        <IconButton
          aria-label={videoBackgroundEnabled ? 'disable video background' : 'enable video background'}
          disabled={!canToggleBackground}
          onClick={onToggleBackground}
          size="small"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'rgba(255, 255, 255, 0.9)',
            padding: 4,
            borderRadius: 8,
          }}
        >
          {videoBackgroundEnabled ? (
            <FullscreenExitIcon fontSize="small" />
          ) : (
            <FullscreenIcon fontSize="small" />
          )}
        </IconButton>
      </div>
    </div>
  )
}
