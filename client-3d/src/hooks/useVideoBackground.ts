import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { useBoothStore } from '../stores/boothStore'
import { useMusicStore } from '../stores/musicStore'
import { getNetwork } from '../network/NetworkManager'

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
 * 1. When enabled + stream playing → tries to resolve a direct video URL
 * 2. If successful → creates a <video> element → THREE.VideoTexture (for floor)
 * 3. If resolve/playback fails → falls back to iframe mode (react-player overlay)
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

  useEffect(() => {
    // Cleanup previous attempt
    const cleanup = () => {
      abortRef.current?.abort()
      abortRef.current = null

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
    booth.setVideoBgMode('webgl')
    booth.setVideoBgLabel('resolving...')

    // Try WebGL path first
    void (async () => {
      try {
        // Use the proxy URL directly — avoids CORS issues with googlevideo.com
        const proxyUrl = getNetwork().getYouTubeProxyUrl(videoId)

        if (abort.signal.aborted) return

        booth.setVideoBgLabel('loading video...')

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

          // Timeout after 8s
          setTimeout(() => {
            video.removeEventListener('canplay', onCanPlay)
            video.removeEventListener('error', onError)
            reject(new Error('Video load timeout'))
          }, 8000)

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
        console.warn('[VideoBackground] WebGL failed, falling back to iframe:', err)

        if (abort.signal.aborted) return

        // Fallback to iframe mode
        booth.setVideoBgMode('iframe')
        booth.setVideoBgLabel('iframe')

        // Clean up the failed video element
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ''
          videoRef.current = null
        }

        setTexture(null)
      }
    })()

    return cleanup
  }, [enabled, isPlaying, currentLink, startTime])

  return texture
}
