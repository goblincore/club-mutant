import { useRef, useEffect, useState } from 'react'
import ReactPlayer from 'react-player/youtube'

import { useMusicStore } from '../stores/musicStore'
import { useBoothStore } from '../stores/boothStore'

export function NowPlaying() {
  const stream = useMusicStore((s) => s.stream)
  const videoBackground = useBoothStore((s) => s.videoBackgroundEnabled)
  const videoBgMode = useBoothStore((s) => s.videoBgMode)
  const videoBgLabel = useBoothStore((s) => s.videoBgLabel)
  const toggleVideo = useBoothStore((s) => s.toggleVideoBackground)
  const playerRef = useRef<ReactPlayer>(null)
  const [minimized, setMinimized] = useState(false)

  const isPlaying = stream.isPlaying && !!stream.currentLink

  // Seek to correct offset on stream start (late-join sync)
  useEffect(() => {
    if (!stream.isPlaying || !stream.startTime || !playerRef.current) return

    const offsetSec = (Date.now() - stream.startTime) / 1000

    if (offsetSec > 1) {
      playerRef.current.seekTo(offsetSec, 'seconds')
    }
  }, [stream.currentLink, stream.startTime, stream.isPlaying])

  // Auto-expand when a new track starts
  useEffect(() => {
    if (isPlaying) setMinimized(false)
  }, [stream.currentLink])

  return (
    <>
      {/* Hidden audio player (only when playing) */}
      {isPlaying && (
        <div className="fixed -left-[9999px] -top-[9999px] w-1 h-1 overflow-hidden">
          <ReactPlayer
            ref={playerRef}
            url={stream.currentLink!}
            playing={stream.isPlaying}
            volume={0.5}
            width={1}
            height={1}
            config={{
              playerVars: {
                autoplay: 1,
                controls: 0,
              },
            }}
          />
        </div>
      )}

      {/* Now playing bar */}
      {minimized ? (
        // Minimized: just a small clickable pill
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm border border-white/10 rounded-full px-2 py-1.5 hover:border-white/30 transition-colors"
          title="Expand now playing"
        >
          <div
            className={`relative w-5 h-5 rounded-full flex-shrink-0 ${
              isPlaying
                ? 'bg-gradient-to-br from-purple-500 to-pink-500 animate-spin'
                : 'bg-white/10'
            }`}
            style={{ animationDuration: '3s' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-black/80 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>

          {isPlaying && (
            <span className="text-[9px] font-mono text-white/50 max-w-[80px] truncate">
              {stream.currentTitle ?? '♪'}
            </span>
          )}
        </button>
      ) : (
        // Expanded: full bar
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 max-w-[400px]">
          {/* Disc icon / minimize button */}
          <button
            onClick={() => setMinimized(true)}
            className="relative w-6 h-6 rounded-full flex-shrink-0 hover:ring-1 hover:ring-white/20 transition-all"
            title="Minimize"
          >
            <div
              className={`w-6 h-6 rounded-full ${
                isPlaying
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 animate-spin'
                  : 'bg-white/10'
              }`}
              style={{ animationDuration: '3s' }}
            >
              <div className="w-2 h-2 rounded-full bg-black/80 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
          </button>

          <div className="min-w-0 flex-1">
            {isPlaying ? (
              <>
                <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider">
                  {stream.currentDjName ? `${stream.currentDjName} playing` : 'now playing'}
                </div>

                <div className="text-[11px] font-mono text-white truncate">
                  {stream.currentTitle ?? '♪ untitled'}
                </div>
              </>
            ) : (
              <div className="text-[11px] font-mono text-white/30 italic">
                silence... the booth awaits a dj ♪
              </div>
            )}
          </div>

          {/* Video background toggle (only when playing) */}
          {isPlaying && (
            <button
              onClick={toggleVideo}
              className={`px-2 py-0.5 text-[9px] font-mono border rounded transition-colors flex-shrink-0 ${
                videoBackground
                  ? 'bg-purple-500/30 border-purple-500/50 text-purple-300'
                  : 'bg-white/10 border-white/20 text-white/40 hover:text-white'
              }`}
              title={videoBackground ? 'Hide video background' : 'Show video background'}
            >
              {videoBackground ? `video: ${videoBgLabel || videoBgMode}` : 'video'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
