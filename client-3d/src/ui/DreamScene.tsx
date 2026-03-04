import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { DreamMaterial } from '../shaders/DreamMaterial'
import { DreamGenerativeMaterial } from '../shaders/DreamGenerativeMaterial'

// ── Constants ────────────────────────────────────────────────────────────

const CYCLE_MIN = 15_000              // ms — min time between video swaps
const CYCLE_MAX = 40_000              // ms — max time between video swaps
const MELT_TRANSITION_DURATION = 5_000 // ms — melting dissolve transition
const CACHE_REFRESH_INTERVAL = 60_000  // ms — re-fetch /cache/list
const VIDEO_LOAD_TIMEOUT = 15_000

// Playback rate (dreamy slow motion)
const PLAYBACK_RATE_MIN = 0.5
const PLAYBACK_RATE_MAX = 0.8
const PLAYBACK_RATE_CHANGE_INTERVAL = 10_000
const PLAYBACK_RATE_LERP = 0.02

// Random time jumps
const RANDOM_CUT_MIN_INTERVAL = 8_000
const RANDOM_CUT_MAX_INTERVAL = 25_000
const RANDOM_CUT_CHANCE = 0.25

const YOUTUBE_API_BASE =
  import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8081'
    : `${window.location.origin}/youtube`)

// ── Types ────────────────────────────────────────────────────────────────

interface VideoState {
  videoEl: HTMLVideoElement
  texture: THREE.VideoTexture
  videoId: string
  // Melting transition
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

// ── Inner R3F component ──────────────────────────────────────────────────

function DreamLayer() {
  const [state, setState] = useState<VideoState | null>(null)
  const [hasVideos, setHasVideos] = useState<boolean | null>(null)
  const videoIdsRef = useRef<string[]>([])
  const nextVideoIndexRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stateRef = useRef<VideoState | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

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

  // Initialize: fetch cache list and load first video
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

      try {
        const videoId = ids[0]!
        const videoEl = await loadVideo(videoId, abort.signal)
        if (abort.signal.aborted) {
          videoEl.pause()
          videoEl.src = ''
          return
        }

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

        nextVideoIndexRef.current = 1
        setState({
          videoEl,
          texture,
          videoId,
          prevTexture: null,
          prevVideoEl: null,
          transition: 1.0,
          transitioning: false,
          currentRate: rate,
          targetRate: rate,
        })
      } catch (err) {
        console.warn('[DreamScene] Failed to load initial video:', err)
        setHasVideos(false)
      }
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
      setState((prev) => {
        if (prev) {
          disposeVideo(prev.videoEl)
          prev.texture.dispose()
          if (prev.prevVideoEl) disposeVideo(prev.prevVideoEl)
          if (prev.prevTexture) prev.prevTexture.dispose()
        }
        return null
      })
    }
  }, [fetchCacheList, hasVideos])

  // ── Random time jumps ───────────────────────────────────────────────
  useEffect(() => {
    if (!state) return

    const scheduleNextCut = () => {
      const delay = RANDOM_CUT_MIN_INTERVAL + Math.random() * (RANDOM_CUT_MAX_INTERVAL - RANDOM_CUT_MIN_INTERVAL)
      cutTimerRef.current = setTimeout(() => {
        const s = stateRef.current
        if (s && s.videoEl.duration && isFinite(s.videoEl.duration)) {
          if (Math.random() < RANDOM_CUT_CHANCE) {
            s.videoEl.currentTime = Math.random() * s.videoEl.duration
          }
        }
        scheduleNextCut()
      }, delay)
    }

    scheduleNextCut()
    return () => { if (cutTimerRef.current) clearTimeout(cutTimerRef.current) }
  }, [!!state])

  // ── Variable playback rate ──────────────────────────────────────────
  useEffect(() => {
    if (!state) return

    rateTimerRef.current = setInterval(() => {
      setState((prev) => prev ? { ...prev, targetRate: randomRate() } : prev)
    }, PLAYBACK_RATE_CHANGE_INTERVAL)

    return () => { if (rateTimerRef.current) clearInterval(rateTimerRef.current) }
  }, [!!state])

  // ── Video cycling with melting transitions ──────────────────────────
  useEffect(() => {
    if (!hasVideos || !state) return

    const abort = abortRef.current
    if (!abort) return

    const cycle = async () => {
      if (abort.signal.aborted) return
      if (videoIdsRef.current.length === 0) return

      const nextIdx = nextVideoIndexRef.current % videoIdsRef.current.length
      const nextVideoId = videoIdsRef.current[nextIdx]!
      nextVideoIndexRef.current++

      // Skip if same video
      const current = stateRef.current
      if (current && current.videoId === nextVideoId) {
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

        setState((prev) => ({
          videoEl,
          texture,
          videoId: nextVideoId,
          // Keep old for melting transition
          prevTexture: prev ? prev.texture : null,
          prevVideoEl: prev ? prev.videoEl : null,
          transition: 0.0,
          transitioning: true,
          currentRate: rate,
          targetRate: rate,
        }))
      } catch (err) {
        console.warn('[DreamScene] Failed to cycle video:', err)
      }

      if (!abort.signal.aborted) {
        cycleTimerRef.current = setTimeout(cycle, randomCycleDelay())
      }
    }

    cycleTimerRef.current = setTimeout(cycle, randomCycleDelay())

    return () => { if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current) }
  }, [hasVideos, state])

  // ── Per-frame: transition + playback rate ───────────────────────────
  useFrame((_, delta) => {
    if (!state) return
    const d = Math.min(delta, 0.1)
    const transitionSpeed = 1.0 / (MELT_TRANSITION_DURATION / 1000)
    let needsUpdate = false
    const updates: Partial<VideoState> = {}

    // Melting transition
    if (state.transitioning) {
      const newTransition = Math.min(state.transition + transitionSpeed * d, 1.0)
      if (newTransition >= 1.0) {
        if (state.prevVideoEl) disposeVideo(state.prevVideoEl)
        if (state.prevTexture) state.prevTexture.dispose()
        updates.transition = 1.0
        updates.transitioning = false
        updates.prevTexture = null
        updates.prevVideoEl = null
      } else {
        updates.transition = newTransition
      }
      needsUpdate = true
    }

    // Smooth playback rate
    const rateDiff = state.targetRate - state.currentRate
    if (Math.abs(rateDiff) > 0.001) {
      const newRate = state.currentRate + rateDiff * PLAYBACK_RATE_LERP
      state.videoEl.playbackRate = newRate
      updates.currentRate = newRate
      needsUpdate = true
    }

    if (needsUpdate) {
      setState((prev) => prev ? { ...prev, ...updates } : prev)
    }
  })

  // Generative fallback
  if (hasVideos === false || hasVideos === null) {
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <DreamGenerativeMaterial />
      </mesh>
    )
  }

  if (!state) return null

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <DreamMaterial
        videoTexture={state.texture}
        prevVideoTexture={state.prevTexture}
        transition={state.transition}
      />
    </mesh>
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
        <DreamLayer />
      </Canvas>
    </div>
  )
}
