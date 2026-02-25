import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { useBoothStore } from '../stores/boothStore'
import { useMusicStore } from '../stores/musicStore'
import { getNetwork } from '../network/NetworkManager'

const LOAD_TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 30_000
const MAX_ATTEMPTS = 3

// Extract YouTube video ID from a URL or link field (which may already be just an ID)
function extractVideoId(link: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]

  for (const pattern of patterns) {
    const match = link.match(pattern)
    if (match) return match[1]!
  }

  return null
}

/**
 * Manages the video background lifecycle:
 * 1. When enabled + stream playing → tries to load video via proxy URL
 * 2. If successful → creates a <video> element → THREE.VideoTexture (for wall display)
 * 3. If load fails → retries up to MAX_ATTEMPTS with RETRY_DELAY_MS between attempts
 * 4. After all retries exhausted → falls back to iframe mode (react-player overlay)
 *
 * Returns the VideoTexture (or null) for use in the 3D scene.
 */
export function useVideoBackground(): THREE.VideoTexture | null {
  const enabled = useBoothStore((s) => s.videoBackgroundEnabled)

  // Subscribe to specific stream properties to avoid re-rendering on every stream change
  const isPlaying = useMusicStore((s) => s.stream.isPlaying)
  const currentLink = useMusicStore((s) => s.stream.currentLink)
  const startTime = useMusicStore((s) => s.stream.startTime)

  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const activeVideoId = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Cleanup previous attempt
    const cleanup = () => {
      abortRef.current?.abort()
      abortRef.current = null

      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }

      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current.load()
        videoRef.current.remove()
        videoRef.current = null
      }

      activeVideoId.current = null
      setTexture(null)
    }

    if (!enabled || !isPlaying || !currentLink) {
      cleanup()
      useBoothStore.getState().setVideoBgMode('off')
      useBoothStore.getState().setVideoBgLabel('')
      return
    }

    const videoId = extractVideoId(currentLink)

    if (!videoId) {
      cleanup()
      useBoothStore.getState().setVideoBgMode('off')
      return
    }

    // Don't restart if same video is already playing
    if (activeVideoId.current === videoId && videoRef.current && !videoRef.current.paused) {
      return
    }

    cleanup()
    activeVideoId.current = videoId

    const abort = new AbortController()
    abortRef.current = abort

    const booth = useBoothStore.getState()

    const attemptLoad = async (attempt: number) => {
      if (abort.signal.aborted) return

      booth.setVideoBgMode('webgl')
      booth.setVideoBgLabel(attempt === 0 ? 'loading video...' : `retrying... (${attempt + 1}/${MAX_ATTEMPTS})`)

      // Clean up any previous video element from a failed attempt
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current = null
      }

      try {
        const proxyUrl = getNetwork().getYouTubeProxyUrl(videoId)

        if (abort.signal.aborted) return

        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.playsInline = true
        video.muted = true // Must be muted for autoplay
        video.loop = true
        video.preload = 'auto'
        video.src = proxyUrl

        videoRef.current = video

        // Wait for enough data to start playing
        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay)
            video.removeEventListener('error', onError)
            resolve()
          }

          const onError = () => {
            video.removeEventListener('canplay', onCanPlay)
            video.removeEventListener('error', onError)
            reject(new Error(`Video load failed: ${video.error?.message ?? 'unknown'}`))
          }

          video.addEventListener('canplay', onCanPlay)
          video.addEventListener('error', onError)

          setTimeout(() => {
            video.removeEventListener('canplay', onCanPlay)
            video.removeEventListener('error', onError)
            reject(new Error('Video load timeout'))
          }, LOAD_TIMEOUT_MS)

          video.load()
        })

        if (abort.signal.aborted) {
          video.pause()
          video.src = ''
          return
        }

        // Seek to correct offset
        const offsetSec = startTime > 0 ? (Date.now() - startTime) / 1000 : 0

        if (offsetSec > 1) {
          video.currentTime = offsetSec
        }

        await video.play()

        if (abort.signal.aborted) {
          video.pause()
          video.src = ''
          return
        }

        // Create THREE.VideoTexture
        const tex = new THREE.VideoTexture(video)
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.colorSpace = THREE.SRGBColorSpace

        setTexture(tex)

        booth.setVideoBgMode('webgl')
        booth.setVideoBgLabel('webgl')
      } catch (err) {
        if (abort.signal.aborted) return

        const nextAttempt = attempt + 1

        // Clean up the failed video element
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ''
          videoRef.current = null
        }

        if (nextAttempt < MAX_ATTEMPTS) {
          console.warn(
            `[VideoBackground] Attempt ${nextAttempt}/${MAX_ATTEMPTS} failed, retrying in ${RETRY_DELAY_MS / 1000}s:`,
            err
          )
          booth.setVideoBgLabel(`retry in ${RETRY_DELAY_MS / 1000}s...`)

          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null
            void attemptLoad(nextAttempt)
          }, RETRY_DELAY_MS)
        } else {
          console.warn('[VideoBackground] All attempts failed, falling back to iframe:', err)
          booth.setVideoBgMode('iframe')
          booth.setVideoBgLabel('iframe')
          setTexture(null)
        }
      }
    }

    void attemptLoad(0)

    return cleanup
  }, [enabled, isPlaying, currentLink, startTime])

  return texture
}
