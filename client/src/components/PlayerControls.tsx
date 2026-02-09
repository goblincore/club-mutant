import IconButton from '@mui/material/IconButton'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import StopIcon from '@mui/icons-material/Stop'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { Controls } from './YoutubePlayer.styles'

interface PlayerControlsProps {
  isStreaming: boolean
  canControl: boolean
  onPlay: () => void
  onStop: () => void
  onNext: () => void
}

export function PlayerControls({
  isStreaming,
  canControl,
  onPlay,
  onStop,
  onNext,
}: PlayerControlsProps) {
  return (
    <Controls>
      {isStreaming ? (
        <IconButton aria-label="stop" size="small" onClick={onStop}>
          <StopIcon fontSize="inherit" />
        </IconButton>
      ) : (
        <IconButton aria-label="play" size="small" disabled={!canControl} onClick={onPlay}>
          <PlayArrowIcon fontSize="inherit" />
        </IconButton>
      )}

      <IconButton aria-label="next track" size="small" disabled={!canControl} onClick={onNext}>
        <SkipNextIcon fontSize="inherit" />
      </IconButton>
    </Controls>
  )
}
