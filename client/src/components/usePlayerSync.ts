import { useRef, useState, useEffect, useCallback } from 'react'
import { timeSync } from '../services/TimeSync'
import { phaserEvents, Event } from '../events/EventCenter'
import type Game from '../scenes/Game'

interface UsePlayerSyncOptions {
  game: Game
  link: string | null
  streamId: number
  startTime: number
  isAmbient: boolean
  globallyMuted: boolean
  onSetAmbientMuted: (muted: boolean) => void
}

export function usePlayerSync({
  game,
  link,
  streamId,
  startTime,
  isAmbient,
  globallyMuted,
  onSetAmbientMuted,
}: UsePlayerSyncOptions) {
  const playerRef = useRef<any>(null)
  const [isBuffering, setIsBuffering] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)

  const computeExpectedSeconds = useCallback(() => {
    if (!link) return 0
    return Math.max(0, (timeSync.getServerNowMs() - startTime) / 1000)
  }, [link, startTime])

  const resyncPlayer = useCallback(() => {
    const expectedSeconds = computeExpectedSeconds()
    playerRef.current?.seekTo(expectedSeconds, 'seconds')
  }, [computeExpectedSeconds])

  // Visibility/focus resync
  useEffect(() => {
    if (!link) return

    let hasPendingTickResync = false

    const resyncWithFreshTime = (armTickResync: boolean) => {
      game.network.requestTimeSyncNow()

      window.setTimeout(() => {
        resyncPlayer()
      }, 150)

      window.setTimeout(() => {
        resyncPlayer()
      }, 900)

      hasPendingTickResync = armTickResync
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      resyncWithFreshTime(true)
    }

    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return
      resyncWithFreshTime(true)
    }

    const handlePageShow = () => {
      if (document.visibilityState !== 'visible') return
      resyncWithFreshTime(true)
    }

    const handleTick = (payload: { streamId: number; startTime: number; serverNowMs: number }) => {
      if (!hasPendingTickResync) return
      if (document.visibilityState !== 'visible') return
      if (!payload || payload.streamId !== streamId) return
      if (payload.startTime !== startTime) return

      hasPendingTickResync = false
      resyncWithFreshTime(false)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    phaserEvents.on(Event.MUSIC_STREAM_TICK, handleTick)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
      phaserEvents.off(Event.MUSIC_STREAM_TICK, handleTick)
    }
  }, [game.network, link, resyncPlayer, startTime, streamId])

  // Drift correction
  useEffect(() => {
    if (!link) return
    if (!isPlaying) return

    const intervalId = window.setInterval(() => {
      const expectedSeconds = computeExpectedSeconds()
      const actualSeconds =
        typeof playerRef.current?.getCurrentTime === 'function'
          ? (playerRef.current.getCurrentTime() as number)
          : null

      if (typeof actualSeconds !== 'number' || !Number.isFinite(actualSeconds)) {
        return
      }

      const driftSeconds = actualSeconds - expectedSeconds

      if (!Number.isFinite(driftSeconds)) return
      if (Math.abs(driftSeconds) < 0.25) return

      if (Math.abs(driftSeconds) >= 2) {
        resyncPlayer()
        return
      }

      const internalPlayer = playerRef.current?.getInternalPlayer?.()
      if (internalPlayer?.setPlaybackRate) {
        const nextRate = driftSeconds > 0 ? 0.95 : 1.05
        internalPlayer.setPlaybackRate(nextRate)

        window.setTimeout(() => {
          try {
            internalPlayer.setPlaybackRate(1)
          } catch {
            // ignore
          }
        }, 2_000)
      }
    }, 2_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [computeExpectedSeconds, isPlaying, link, resyncPlayer, streamId])

  // Ambient mode handling
  useEffect(() => {
    if (!isAmbient) {
      onSetAmbientMuted(false)
      return
    }

    setIsPlaying(true)
    onSetAmbientMuted(true)

    const kick = () => {
      if (globallyMuted) {
        window.removeEventListener('pointerdown', kick)
        window.removeEventListener('keydown', kick)
        return
      }

      const syncTime = (timeSync.getServerNowMs() - startTime) / 1000

      onSetAmbientMuted(false)

      const internalPlayer = playerRef.current?.getInternalPlayer?.()
      internalPlayer?.seekTo?.(Math.max(0, syncTime), true)
      internalPlayer?.unMute?.()
      internalPlayer?.playVideo?.()

      setIsPlaying(true)
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }

    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)

    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
  }, [globallyMuted, isAmbient, onSetAmbientMuted, startTime])

  const handleReady = useCallback(() => {
    resyncPlayer()

    if (isAmbient && !globallyMuted) {
      window.setTimeout(() => {
        const internalPlayer = playerRef.current?.getInternalPlayer?.()
        internalPlayer?.unMute?.()
        internalPlayer?.setVolume?.(100)
        internalPlayer?.playVideo?.()
      }, 250)
    }
  }, [isAmbient, globallyMuted, resyncPlayer])

  const handleOnBufferEnd = useCallback(() => {
    if (isBuffering) {
      setIsBuffering(false)
    }
  }, [isBuffering])

  return {
    playerRef,
    isBuffering,
    setIsBuffering,
    isPlaying,
    setIsPlaying,
    computeExpectedSeconds,
    resyncPlayer,
    handleReady,
    handleOnBufferEnd,
  }
}
