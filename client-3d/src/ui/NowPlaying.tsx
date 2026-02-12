import { useRef, useEffect, useState, useCallback } from 'react'
import ReactPlayer from 'react-player/youtube'

import { getNetwork } from '../network/NetworkManager'
import { useMusicStore } from '../stores/musicStore'
import { useBoothStore } from '../stores/boothStore'
import { useGameStore } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60

  return `${m}:${s.toString().padStart(2, '0')}`
}

export function NowPlaying() {
  const stream = useMusicStore((s) => s.stream)
  const videoBackground = useBoothStore((s) => s.videoBackgroundEnabled)
  const toggleVideo = useBoothStore((s) => s.toggleVideoBackground)
  const currentDjSessionId = useBoothStore((s) => s.currentDjSessionId)
  const djQueue = useBoothStore((s) => s.djQueue)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const isCurrentDJ = currentDjSessionId === mySessionId
  const muted = useUIStore((s) => s.muted)

  const playerRef = useRef<ReactPlayer>(null)
  const [elapsed, setElapsed] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)

  const isPlaying = stream.isPlaying && !!stream.currentLink

  // When the current DJ's song ends, notify the server to advance rotation
  const handleEnded = useCallback(() => {
    if (!isCurrentDJ) return

    console.log('[NowPlaying] Song ended, sending djTurnComplete')
    getNetwork().djTurnComplete()
  }, [isCurrentDJ])

  // Seek to correct offset on stream start (late-join sync)
  useEffect(() => {
    if (!stream.isPlaying || !stream.startTime || !playerRef.current) return

    const offsetSec = (Date.now() - stream.startTime) / 1000

    if (offsetSec > 1) {
      playerRef.current.seekTo(offsetSec, 'seconds')
    }
  }, [stream.currentLink, stream.startTime, stream.isPlaying])

  // Track elapsed time and total duration
  useEffect(() => {
    if (!isPlaying || !stream.startTime) {
      setElapsed(0)
      setTotalDuration(0)
      return
    }

    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - stream.startTime) / 1000)))

      const dur = playerRef.current?.getDuration?.()

      if (dur && typeof dur === 'number' && dur > 0) {
        setTotalDuration(Math.floor(dur))
      }
    }

    tick()
    const id = setInterval(tick, 1000)

    return () => clearInterval(id)
  }, [isPlaying, stream.startTime, stream.currentLink])

  // Build "up next" text
  const nextDJ = djQueue.length > 1 ? djQueue[1] : null
  const upNextText = nextDJ ? `Up next: ${nextDJ.name}` : null

  // Time display
  const timeText =
    isPlaying && totalDuration > 0
      ? `${formatTime(elapsed)} / ${formatTime(totalDuration)}`
      : isPlaying
        ? formatTime(elapsed)
        : null

  // Show for current DJ even when stopped (so they can hit play),
  // or for anyone when something is playing
  if (!isPlaying && !isCurrentDJ) {
    return null
  }

  return (
    <>
      {/* Hidden audio player */}
      {isPlaying && (
        <div className="fixed -left-[9999px] -top-[9999px] w-1 h-1 overflow-hidden">
          <ReactPlayer
            ref={playerRef}
            url={stream.currentLink!}
            playing={stream.isPlaying}
            volume={muted ? 0 : 0.5}
            width={1}
            height={1}
            onEnded={handleEnded}
            config={{
              playerVars: {
                autoplay: 1,
                controls: 0,
              },
            }}
          />
        </div>
      )}

      {/* Mini player bar */}
      <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 min-w-[320px] max-w-[500px]">
        {/* DJ controls: play/stop toggle + skip (only for current DJ) */}
        {isCurrentDJ && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {isPlaying ? (
              <button
                onClick={() => getNetwork().djStop()}
                className="w-7 h-7 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded transition-colors"
                title="Stop"
              >
                <span className="text-[12px] text-red-400">■</span>
              </button>
            ) : (
              <button
                onClick={() => getNetwork().djPlay()}
                className="w-7 h-7 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded transition-colors"
                title="Play"
              >
                <span className="text-[12px] text-green-400">▶</span>
              </button>
            )}

            <button
              onClick={() => getNetwork().djTurnComplete()}
              className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 rounded transition-colors"
              title="Skip to next"
            >
              <span className="text-[12px] text-white/90">▶▶</span>
            </button>
          </div>
        )}

        {/* Track info */}
        <div className="min-w-0 flex-1">
          {isPlaying ? (
            <>
              <div className="text-[13px] font-mono text-white truncate">
                {stream.currentDjName ? `${stream.currentDjName} — ` : ''}
                {stream.currentTitle ?? '♪ untitled'}
              </div>

              <div className="text-[11px] font-mono text-white/60 truncate">
                {timeText}
                {timeText && upNextText && ' • '}
                {upNextText}
              </div>
            </>
          ) : (
            <div className="text-[13px] font-mono text-white/60">stopped — press ▶ to play</div>
          )}
        </div>

        {/* Video background toggle — only when playing */}
        {isPlaying && (
          <button
            onClick={toggleVideo}
            className={`w-7 h-7 flex items-center justify-center border rounded transition-colors flex-shrink-0 ${
              videoBackground
                ? 'bg-purple-500/30 border-purple-500/50 text-purple-300'
                : 'bg-white/10 border-white/20 text-white/60 hover:text-white'
            }`}
            title={videoBackground ? 'Hide video background' : 'Show video background'}
          >
            <span className="text-[13px]">📹</span>
          </button>
        )}
      </div>
    </>
  )
}
