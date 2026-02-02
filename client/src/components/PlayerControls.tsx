import IconButton from '@mui/material/IconButton'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { Controls } from './YoutubePlayer.styles'

interface PlayerControlsProps {
  isPlaying: boolean
  isStreaming: boolean
  canControl: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
}

export function PlayerControls({
  isPlaying,
  isStreaming,
  canControl,
  onPlayPause,
  onPrev,
  onNext,
}: PlayerControlsProps) {
  return (
    <Controls>
      <IconButton
        aria-label="previous track"
        size="small"
        disabled={!canControl}
        onClick={onPrev}
      >
        <SkipPreviousIcon fontSize="inherit" />
      </IconButton>

      <IconButton
        aria-label={isPlaying ? 'pause' : 'play'}
        size="small"
        disabled={!isStreaming && !canControl}
        onClick={onPlayPause}
      >
        {isPlaying ? <PauseIcon fontSize="inherit" /> : <PlayArrowIcon fontSize="inherit" />}
      </IconButton>

      <IconButton
        aria-label="next track"
        size="small"
        disabled={!canControl}
        onClick={onNext}
      >
        <SkipNextIcon fontSize="inherit" />
      </IconButton>
    </Controls>
  )
}
