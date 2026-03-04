import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { DreamMaterial } from '../shaders/DreamMaterial'
import { DreamGenerativeMaterial } from '../shaders/DreamGenerativeMaterial'

// ── Constants ────────────────────────────────────────────────────────────

const MAX_VIDEO_LAYERS = 3
const CYCLE_MIN = 10_000           // ms — min time between layer swaps
const CYCLE_MAX = 40_000           // ms — max time between layer swaps
const MELT_TRANSITION_DURATION = 5_000 // ms — melting dissolve transition
const CACHE_REFRESH_INTERVAL = 60_000  // ms — re-fetch /cache/list
const VIDEO_LOAD_TIMEOUT = 15_000

// Playback rate (dreamy slow motion)
const PLAYBACK_RATE_MIN = 0.15
const PLAYBACK_RATE_MAX = 0.75
const PLAYBACK_RATE_CHANGE_INTERVAL = 8_000
const PLAYBACK_RATE_LERP = 0.02

// Random time jumps
const RANDOM_CUT_MIN_INTERVAL = 6_000
const RANDOM_CUT_MAX_INTERVAL = 20_000
const RANDOM_CUT_CHANCE = 0.3

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
  // Melting transition state
  prevTexture: THREE.VideoTexture | null
  prevVideoEl: HTMLVideoElement | null
  transition: number       // 0 = show prev, 1 = show current
  transitioning: boolean
  // Playback rate
  currentRate: number
  targetRate: number
}

// ── Helpers ──────────────────────────────────────────────────────────────

function randomRate(): number {
  return PLAYBACK_RATE_MIN + Math.random() * (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN)
}

function randomCycleDelay(): number {
  return CYCLE_MIN + Math.random() * (CYCLE_MAX - CYCLE_MIN)
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

function disposeVideo(videoEl: HTMLVideoElement) {
  videoEl.pause()
  videoEl.src = ''
  videoEl.load()
  videoEl.remove()
}

function disposeVideoLayer(layer: VideoLayer) {
  disposeVideo(layer.videoEl)
  layer.texture.dispose()
  if (layer.prevVideoEl) disposeVideo(layer.prevVideoEl)
  if (layer.prevTexture) layer.prevTexture.dispose()
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
  const cutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const layersRef = useRef<VideoLayer[]>([])

  // Keep layersRef in sync
  useEffect(() => {
    layersRef.current = layers
  }, [layers])

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

          // Set initial slow playback rate
          const rate = randomRate()
          videoEl.playbackRate = rate

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
            prevTexture: null,
            prevVideoEl: null,
            transition: 1.0,
            transitioning: false,
            currentRate: rate,
            targetRate: rate,
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
      if (cutTimerRef.current) clearTimeout(cutTimerRef.current)
      if (rateTimerRef.current) clearInterval(rateTimerRef.current)
      // Dispose all layers
      setLayers((prev) => {
        prev.forEach(disposeVideoLayer)
        return []
      })
    }
  }, [fetchCacheList, hasVideos])

  // ── Random time jumps ───────────────────────────────────────────────
  useEffect(() => {
    if (!hasVideos || layers.length === 0) return

    const scheduleNextCut = () => {
      const delay = RANDOM_CUT_MIN_INTERVAL + Math.random() * (RANDOM_CUT_MAX_INTERVAL - RANDOM_CUT_MIN_INTERVAL)
      cutTimerRef.current = setTimeout(() => {
        if (Math.random() < RANDOM_CUT_CHANCE) {
          const currentLayers = layersRef.current
          const layerIdx = Math.floor(Math.random() * currentLayers.length)
          const layer = currentLayers[layerIdx]
          if (layer && layer.videoEl.duration && isFinite(layer.videoEl.duration)) {
            layer.videoEl.currentTime = Math.random() * layer.videoEl.duration
          }
        }
        scheduleNextCut()
      }, delay)
    }

    scheduleNextCut()

    return () => {
      if (cutTimerRef.current) clearTimeout(cutTimerRef.current)
    }
  }, [hasVideos, layers.length])

  // ── Variable playback rate ──────────────────────────────────────────
  useEffect(() => {
    if (!hasVideos || layers.length === 0) return

    rateTimerRef.current = setInterval(() => {
      setLayers((prev) =>
        prev.map((layer) => ({
          ...layer,
          targetRate: randomRate(),
        }))
      )
    }, PLAYBACK_RATE_CHANGE_INTERVAL)

    return () => {
      if (rateTimerRef.current) clearInterval(rateTimerRef.current)
    }
  }, [hasVideos, layers.length])

  // ── Video layer cycling with melting transitions ────────────────────
  useEffect(() => {
    if (!hasVideos || layers.length === 0) return

    const abort = abortRef.current
    if (!abort) return

    const cycle = async () => {
      if (abort.signal.aborted) return
      if (videoIdsRef.current.length === 0) return

      // Pick the oldest layer to replace (cycle overlays, keep base)
      const currentLayers = layersRef.current
      const replaceIndex = currentLayers.length > 1
        ? 1 + ((nextVideoIndexRef.current - currentLayers.length) % (currentLayers.length - 1))
        : 0
      const nextIdx = nextVideoIndexRef.current % videoIdsRef.current.length
      const nextVideoId = videoIdsRef.current[nextIdx]!
      nextVideoIndexRef.current++

      // Skip if this video is already playing
      if (currentLayers.some((l) => l.videoId === nextVideoId)) {
        cycleTimerRef.current = setTimeout(cycle, randomCycleDelay())
        return
      }

      try {
        const videoEl = await loadVideo(nextVideoId, abort.signal)
        if (abort.signal.aborted) {
          videoEl.pause()
          videoEl.src = ''
          return
        }

        // Set slow playback rate
        const rate = randomRate()
        videoEl.playbackRate = rate

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

        setLayers((prev) => {
          const old = prev[replaceIndex]
          const next = [...prev]
          next[replaceIndex] = {
            videoEl,
            texture,
            videoId: nextVideoId,
            fade: old ? old.fade : 0,
            targetFade: LAYER_CONFIGS[replaceIndex]?.additive ? 0.6 : 1.0,
            layerIndex: replaceIndex,
            // Keep old texture for melting transition
            prevTexture: old ? old.texture : null,
            prevVideoEl: old ? old.videoEl : null,
            transition: 0.0,
            transitioning: true,
            currentRate: rate,
            targetRate: rate,
          }
          return next
        })
      } catch (err) {
        console.warn('[DreamScene] Failed to cycle video:', err)
      }

      if (!abort.signal.aborted) {
        cycleTimerRef.current = setTimeout(cycle, randomCycleDelay())
      }
    }

    cycleTimerRef.current = setTimeout(cycle, randomCycleDelay())

    return () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current)
    }
  }, [hasVideos, layers])

  // ── Per-frame animation: crossfade, transitions, playback rate ─────
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1)
    const transitionSpeed = 1.0 / (MELT_TRANSITION_DURATION / 1000)
    let changed = false

    setLayers((prev) =>
      prev.map((layer) => {
        let updates: Partial<VideoLayer> = {}

        // Melting transition animation
        if (layer.transitioning) {
          const newTransition = Math.min(layer.transition + transitionSpeed * d, 1.0)
          if (newTransition >= 1.0) {
            // Transition complete — dispose previous
            if (layer.prevVideoEl) disposeVideo(layer.prevVideoEl)
            if (layer.prevTexture) layer.prevTexture.dispose()
            updates = {
              transition: 1.0,
              transitioning: false,
              prevTexture: null,
              prevVideoEl: null,
            }
          } else {
            updates.transition = newTransition
          }
          changed = true
        }

        // Fade animation
        const fadeDiff = layer.targetFade - layer.fade
        if (Math.abs(fadeDiff) > 0.01) {
          const fadeSpeed = 1.0 / (MELT_TRANSITION_DURATION / 1000)
          updates.fade = layer.fade + Math.sign(fadeDiff) * fadeSpeed * d
          changed = true
        }

        // Smooth playback rate interpolation
        const rateDiff = layer.targetRate - layer.currentRate
        if (Math.abs(rateDiff) > 0.001) {
          const newRate = layer.currentRate + rateDiff * PLAYBACK_RATE_LERP
          layer.videoEl.playbackRate = newRate
          updates.currentRate = newRate
          changed = true
        }

        if (Object.keys(updates).length > 0) {
          return { ...layer, ...updates }
        }
        return layer
      })
    )

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
              prevVideoTexture={layer.prevTexture}
              transition={layer.transition}
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
