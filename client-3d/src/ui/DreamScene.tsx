import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { DreamMaterial } from '../shaders/DreamMaterial'
import { DreamGenerativeMaterial } from '../shaders/DreamGenerativeMaterial'

// ── Constants ────────────────────────────────────────────────────────────

const MAX_VIDEO_LAYERS = 3
const VIDEO_CYCLE_INTERVAL = 25_000 // ms — swap out a layer
const CROSSFADE_DURATION = 3_000    // ms — fade transition time
const CACHE_REFRESH_INTERVAL = 60_000 // ms — re-fetch /cache/list
const VIDEO_LOAD_TIMEOUT = 15_000

const YOUTUBE_API_BASE =
  import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8081'
    : `${window.location.origin}/youtube`)

const LAYER_CONFIGS = [
  { hueOffset: 0.0, warpSpeed: 0.3, additive: false },
  { hueOffset: 0.33, warpSpeed: 0.2, additive: true },
  { hueOffset: 0.66, warpSpeed: 0.15, additive: true },
]

// ── Types ────────────────────────────────────────────────────────────────

interface VideoLayer {
  videoEl: HTMLVideoElement
  texture: THREE.VideoTexture
  videoId: string
  fade: number
  targetFade: number
  layerIndex: number
}

// ── Video loading helper ─────────────────────────────────────────────────

function loadVideo(videoId: string, signal: AbortSignal): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'))
      return
    }

    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.playsInline = true
    video.muted = true
    video.loop = true
    video.preload = 'auto'
    video.src = `${YOUTUBE_API_BASE}/proxy/${videoId}?videoOnly=true`

    const cleanup = () => {
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
    }

    const onCanPlay = () => {
      cleanup()
      resolve(video)
    }

    const onError = () => {
      cleanup()
      reject(new Error(`Video load failed: ${video.error?.message ?? 'unknown'}`))
    }

    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onError)

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Video load timeout'))
    }, VIDEO_LOAD_TIMEOUT)

    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      cleanup()
      video.pause()
      video.src = ''
      reject(new Error('Aborted'))
    })

    video.load()

    // Clear timeout on resolution
    const origResolve = resolve
    resolve = (v) => {
      clearTimeout(timeout)
      origResolve(v)
    }
    const origReject = reject
    reject = (e) => {
      clearTimeout(timeout)
      origReject(e)
    }
  })
}

function disposeVideoLayer(layer: VideoLayer) {
  layer.videoEl.pause()
  layer.videoEl.src = ''
  layer.videoEl.load()
  layer.videoEl.remove()
  layer.texture.dispose()
}

// ── Inner R3F component ──────────────────────────────────────────────────

function DreamLayers() {
  const [layers, setLayers] = useState<VideoLayer[]>([])
  const [hasVideos, setHasVideos] = useState<boolean | null>(null) // null = loading
  const videoIdsRef = useRef<string[]>([])
  const nextVideoIndexRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCacheList = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch(`${YOUTUBE_API_BASE}/cache/list?limit=20&random=true`, { signal })
      if (!res.ok) return []
      const data = await res.json()
      return (data.videoIds as string[]) || []
    } catch {
      return []
    }
  }, [])

  // Initialize: fetch cache list and load initial video layers
  useEffect(() => {
    const abort = new AbortController()
    abortRef.current = abort

    const init = async () => {
      const ids = await fetchCacheList(abort.signal)
      if (abort.signal.aborted) return

      videoIdsRef.current = ids

      if (ids.length === 0) {
        setHasVideos(false)
        return
      }

      setHasVideos(true)

      // Load up to MAX_VIDEO_LAYERS videos
      const count = Math.min(MAX_VIDEO_LAYERS, ids.length)
      const loadedLayers: VideoLayer[] = []

      for (let i = 0; i < count; i++) {
        if (abort.signal.aborted) break
        try {
          const videoId = ids[i]!
          const videoEl = await loadVideo(videoId, abort.signal)
          if (abort.signal.aborted) {
            videoEl.pause()
            videoEl.src = ''
            break
          }
          await videoEl.play()
          if (abort.signal.aborted) {
            videoEl.pause()
            videoEl.src = ''
            break
          }

          const texture = new THREE.VideoTexture(videoEl)
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.colorSpace = THREE.SRGBColorSpace

          loadedLayers.push({
            videoEl,
            texture,
            videoId,
            fade: i === 0 ? 1.0 : 0.0, // First layer starts visible
            targetFade: LAYER_CONFIGS[i]!.additive ? 0.6 : 1.0,
            layerIndex: i,
          })
        } catch (err) {
          console.warn(`[DreamScene] Failed to load video ${ids[i]}:`, err)
        }
      }

      if (abort.signal.aborted) {
        loadedLayers.forEach(disposeVideoLayer)
        return
      }

      // Stagger fade-in for layers beyond the first
      loadedLayers.forEach((l, i) => {
        if (i > 0) {
          setTimeout(() => {
            if (!abort.signal.aborted) {
              setLayers((prev) =>
                prev.map((pl) =>
                  pl.videoId === l.videoId ? { ...pl, fade: 0, targetFade: LAYER_CONFIGS[i]?.additive ? 0.6 : 1.0 } : pl
                )
              )
            }
          }, i * 1000)
        }
      })

      nextVideoIndexRef.current = count
      setLayers(loadedLayers)
    }

    void init()

    // Periodic cache list refresh
    refreshTimerRef.current = setInterval(async () => {
      if (abort.signal.aborted) return
      const ids = await fetchCacheList(abort.signal)
      if (ids.length > 0) {
        videoIdsRef.current = ids
        nextVideoIndexRef.current = 0
        if (!hasVideos) setHasVideos(true)
      }
    }, CACHE_REFRESH_INTERVAL)

    return () => {
      abort.abort()
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current)
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
      // Dispose all layers
      setLayers((prev) => {
        prev.forEach(disposeVideoLayer)
        return []
      })
    }
  }, [fetchCacheList, hasVideos])

  // Video layer cycling
  useEffect(() => {
    if (!hasVideos || layers.length === 0) return

    const abort = abortRef.current
    if (!abort) return

    const cycle = async () => {
      if (abort.signal.aborted) return
      if (videoIdsRef.current.length === 0) return

      // Pick the oldest layer to replace (index 0 = base layer, keep it; cycle overlays)
      const replaceIndex = layers.length > 1 ? 1 + ((nextVideoIndexRef.current - layers.length) % (layers.length - 1)) : 0
      const nextIdx = nextVideoIndexRef.current % videoIdsRef.current.length
      const nextVideoId = videoIdsRef.current[nextIdx]!
      nextVideoIndexRef.current++

      // Skip if this video is already playing
      if (layers.some((l) => l.videoId === nextVideoId)) {
        cycleTimerRef.current = setTimeout(cycle, VIDEO_CYCLE_INTERVAL)
        return
      }

      try {
        const videoEl = await loadVideo(nextVideoId, abort.signal)
        if (abort.signal.aborted) {
          videoEl.pause()
          videoEl.src = ''
          return
        }
        await videoEl.play()
        if (abort.signal.aborted) {
          videoEl.pause()
          videoEl.src = ''
          return
        }

        const texture = new THREE.VideoTexture(videoEl)
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.colorSpace = THREE.SRGBColorSpace

        const newLayer: VideoLayer = {
          videoEl,
          texture,
          videoId: nextVideoId,
          fade: 0,
          targetFade: LAYER_CONFIGS[replaceIndex]?.additive ? 0.6 : 1.0,
          layerIndex: replaceIndex,
        }

        setLayers((prev) => {
          // Dispose the old layer at replaceIndex
          const old = prev[replaceIndex]
          if (old) disposeVideoLayer(old)
          const next = [...prev]
          next[replaceIndex] = newLayer
          return next
        })
      } catch (err) {
        console.warn('[DreamScene] Failed to cycle video:', err)
      }

      if (!abort.signal.aborted) {
        cycleTimerRef.current = setTimeout(cycle, VIDEO_CYCLE_INTERVAL)
      }
    }

    cycleTimerRef.current = setTimeout(cycle, VIDEO_CYCLE_INTERVAL)

    return () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current)
    }
  }, [hasVideos, layers])

  // Per-frame crossfade animation
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1)
    const fadeSpeed = 1.0 / (CROSSFADE_DURATION / 1000)
    let changed = false

    setLayers((prev) =>
      prev.map((layer) => {
        const diff = layer.targetFade - layer.fade
        if (Math.abs(diff) < 0.01) return layer
        changed = true
        return { ...layer, fade: layer.fade + Math.sign(diff) * fadeSpeed * d }
      })
    )

    // Avoid unnecessary re-renders
    if (!changed) return
  })

  // Generative fallback when no videos
  if (hasVideos === false) {
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <DreamGenerativeMaterial />
      </mesh>
    )
  }

  // Loading state — show generative while fetching
  if (hasVideos === null) {
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <DreamGenerativeMaterial />
      </mesh>
    )
  }

  return (
    <>
      {layers.map((layer, i) => {
        const config = LAYER_CONFIGS[i] || LAYER_CONFIGS[0]!
        return (
          <mesh key={layer.videoId} position={[0, 0, -0.01 * i]}>
            <planeGeometry args={[2, 2]} />
            <DreamMaterial
              videoTexture={layer.texture}
              hueOffset={config.hueOffset}
              warpSpeed={config.warpSpeed}
              fade={layer.fade}
              useAdditiveBlend={config.additive}
            />
          </mesh>
        )
      })}
    </>
  )
}

// ── Outer component ──────────────────────────────────────────────────────

export function DreamScene() {
  return (
    <div className="fixed inset-0 bg-black" style={{ zIndex: 50 }}>
      <Canvas
        orthographic
        camera={{ zoom: 1, position: [0, 0, 1], near: 0.1, far: 10 }}
        gl={{ antialias: false, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <DreamLayers />
      </Canvas>
    </div>
  )
}
