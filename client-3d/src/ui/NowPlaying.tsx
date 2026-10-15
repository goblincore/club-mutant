import { useRef, useEffect, useState, useCallback } from 'react'
import ReactPlayer from 'react-player/youtube'

import { getNetwork } from '../network/NetworkManager'
import { useMusicStore } from '../stores/musicStore'
import { useBoothStore } from '../stores/boothStore'
import { useGameStore } from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useDreamStore } from '../dream/dreamStore'
import { resyncPlayerTo, seekPlayerToOffset } from './playerSeek'
import { PlayerFace } from './skin/PlayerFace'

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
  const isInQueue = useBoothStore((s) => s.isInQueue)
  const musicMode = useGameStore((s) => s.musicMode)
  const isCurrentDJ = currentDjSessionId === mySessionId
  const muted = useSettingsStore((s) => s.muted)
  const musicVolume = useSettingsStore((s) => s.musicVolume)
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume)
  const isDreaming = useDreamStore((s) => s.isDreaming)

  const isJukeboxMode = musicMode === 'jukebox' || musicMode === 'personal'

  const playerRef = useRef<ReactPlayer>(null)
  const [elapsed, setElapsed] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const lastEndedStreamIdRef = useRef<number>(-1)

  const isPlaying = stream.isPlaying && !!stream.currentLink

  // When the current track ends, notify the server.
  // For DJ queue mode: only the current DJ reports.
  // For jukebox/personal mode: any client can report (server deduplicates via streamId).
  const handleEnded = useCallback(() => {
    const sid = stream.streamId
    const current = useMusicStore.getState().stream
    if (!current.isPlaying || current.streamId !== sid) return

    if (lastEndedStreamIdRef.current === sid) {
      console.log('[NowPlaying] Ignoring duplicate onEnded for streamId', sid)
      return
    }

    lastEndedStreamIdRef.current = sid

    if (isJukeboxMode) {
      console.log('[NowPlaying] Jukebox track ended (streamId=%d), sending jukeboxTrackComplete', sid)
      getNetwork().jukeboxTrackComplete(sid)
    } else {
      if (!isCurrentDJ) return
      console.log('[NowPlaying] DJ track ended (streamId=%d), sending djTurnComplete', sid)
      getNetwork().djTurnComplete(sid)
    }
  }, [isCurrentDJ, isJukeboxMode, stream.streamId])

  // Seek to correct offset on stream start (late-join sync)
  useEffect(() => {
    if (!stream.isPlaying || !stream.startTime || !playerRef.current) return

    const offsetSec = (Date.now() - stream.startTime) / 1000

    seekPlayerToOffset(playerRef.current, offsetSec)
  }, [stream.currentLink, stream.startTime, stream.isPlaying, stream.streamId])

  // F10: re-apply the late-join seek once the player is actually ready.
  // A seekTo issued before the YouTube iframe is ready can silently expire
  // (react-player's pending seek has a ~5s TTL — slow networks or blocked
  // autoplay exceed it), leaving playback at 0:00 with no correction.
  const handleReadyOrStart = useCallback(() => {
    const s = useMusicStore.getState().stream
    const player = playerRef.current
    if (!s.isPlaying || s.streamId !== stream.streamId || !s.startTime || !player) return

    const expectedSec = (Date.now() - s.startTime) / 1000
    const actualSec = player.getCurrentTime?.() ?? 0

    if (expectedSec > 1 && Math.abs(actualSec - expectedSec) > 2) {
      console.log(
        '[NowPlaying] Player ready %ds behind stream — re-seeking to %ds',
        Math.round(expectedSec - actualSec),
        Math.round(expectedSec)
      )
      resyncPlayerTo(player, expectedSec)
    }
  }, [stream.streamId])

  // F10: periodic position-drift check — compares the ACTUAL player position
  // against expected elapsed and re-seeks when they diverge. Catches expired
  // initial seeks and YouTube buffering stalls, which the timestamp-only tick
  // correction in musicHandlers.ts can never see.
  useEffect(() => {
    if (!isPlaying) return

    const id = setInterval(() => {
      const s = useMusicStore.getState().stream
      const player = playerRef.current
      if (!s.isPlaying || !s.startTime || !player) return

      const expectedSec = (Date.now() - s.startTime) / 1000
      const actualSec = player.getCurrentTime?.()

      if (typeof actualSec !== 'number' || !isFinite(actualSec)) return

      if (Math.abs(actualSec - expectedSec) > 2) {
        console.log(
          '[NowPlaying] Position drift: expected %ds, actual %ds — resyncing',
          Math.round(expectedSec),
          Math.round(actualSec)
        )
        resyncPlayerTo(player, expectedSec)
      }
    }, 5000)

    return () => clearInterval(id)
  }, [isPlaying, stream.streamId])

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

  // Build "up next" text (DJ queue mode only — jukebox returns early above)
  const nextDJ = djQueue.length > 1 ? djQueue[1] : null
  const upNextText = nextDJ
    ? `Up next: ${nextDJ.name}${nextDJ.sessionId?.startsWith('npc-dj:') ? ' [BOT]' : ''}`
    : null

  // Time display
  const timeText =
    isPlaying && totalDuration > 0
      ? `${formatTime(elapsed)} / ${formatTime(totalDuration)}`
      : isPlaying
        ? formatTime(elapsed)
        : null

  // Jukebox/personal mode: only render the hidden audio player — the DjQueuePanel
  // handles all visible UI (playlist, controls, status) to avoid duplicate controls.
  if (isJukeboxMode) {
    if (!isPlaying) return null
    return (
      <div className="fixed -left-[9999px] -top-[9999px] w-1 h-1 overflow-hidden">
        <ReactPlayer
          key={stream.streamId}
          ref={playerRef}
          url={stream.currentLink!}
          playing={stream.isPlaying}
          volume={muted || isDreaming ? 0 : musicVolume}
          width={1}
          height={1}
          onEnded={handleEnded}
          onReady={handleReadyOrStart}
          onStart={handleReadyOrStart}
          config={{
            playerVars: {
              autoplay: 1,
              controls: 0,
            },
          }}
        />
      </div>
    )
  }

  // DJ queue mode: show for DJs in queue or when something is playing
  if (!isPlaying && !isCurrentDJ && !isInQueue) return null

  // Controls: play/stop/skip only for current DJ or DJs in queue when stopped
  const showControls = isCurrentDJ || (isInQueue && !isPlaying)

  return (
    <>
      {/* Hidden audio player */}
      {isPlaying && (
        <div className="fixed -left-[9999px] -top-[9999px] w-1 h-1 overflow-hidden">
          <ReactPlayer
            key={stream.streamId}
            ref={playerRef}
            url={stream.currentLink!}
            playing={stream.isPlaying}
            volume={muted || isDreaming ? 0 : musicVolume}
            width={1}
            height={1}
            onEnded={handleEnded}
            onReady={handleReadyOrStart}
            onStart={handleReadyOrStart}
            config={{
              playerVars: {
                autoplay: 1,
                controls: 0,
              },
            }}
          />
        </div>
      )}

      <PlayerFace
        title={stream.currentTitle ?? 'untitled'}
        subtitle={[timeText, upNextText].filter(Boolean).join(' · ')}
        isPlaying={isPlaying}
        showControls={showControls}
        videoBackground={videoBackground}
        elapsed={elapsed}
        duration={totalDuration || stream.duration || 0}
        volume={musicVolume}
        muted={muted}
        onPlay={() => getNetwork().djPlay()}
        onStop={() => getNetwork().djStop()}
        onSkip={() => getNetwork().djSkipTurn(stream.streamId)}
        onToggleVideo={toggleVideo}
        onVolumeChange={setMusicVolume}
      />
    </>
  )
}
