import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { DreamMaterial } from '../shaders/DreamMaterial'
import { DreamGenerativeMaterial } from '../shaders/DreamGenerativeMaterial'
import { useDreamDebugStore } from '../stores/dreamDebugStore'
import { getDreamAudioPlayer } from '../audio/DreamAudioPlayer'
import { DreamDebugPanel } from './DreamDebugPanel'
// import { DreamAcsCharacter } from './DreamAcsCharacter'

// ── Constants ────────────────────────────────────────────────────────────

const CACHE_REFRESH_INTERVAL = 60_000  // ms — re-fetch /cache/list
const VIDEO_LOAD_TIMEOUT = 15_000
const PLAYBACK_RATE_CHANGE_INTERVAL = 10_000
const PLAYBACK_RATE_LERP = 0.02

const YOUTUBE_API_BASE =
  import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8081'
    : `${window.location.origin}/youtube`)

// ── Types ────────────────────────────────────────────────────────────────

interface VideoLayer {
  videoEl: HTMLVideoElement
  texture: THREE.VideoTexture
  videoId: string
  currentRate: number
  targetRate: number
}

interface DualLayerState {
  layerA: VideoLayer
  layerB: VideoLayer | null  // null until second layer loads
  // Which layer is currently transitioning (swapping its video)
  swappingLayer: 'a' | 'b' | null
  swapTransition: number  // 0-1 melt progress for the swapping layer
  swapPrevTexture: THREE.VideoTexture | null
  swapPrevVideoEl: HTMLVideoElement | null
}

// ── Helpers ──────────────────────────────────────────────────────────────

function randomRate(): number {
  const { playbackRateMin, playbackRateMax } = useDreamDebugStore.getState()
  return playbackRateMin + Math.random() * (playbackRateMax - playbackRateMin)
}

function randomCycleDelay(): number {
  // Fixed range — not debug-controlled (transition duration is separate)
  const min = 60_000
  const max = 120_000
  return min + Math.random() * (max - min)
}

function randomLayerBDelay(): number {
  return 5_000 + Math.random() * 10_000  // 5-15s
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

function makeTexture(videoEl: HTMLVideoElement): THREE.VideoTexture {
  const texture = new THREE.VideoTexture(videoEl)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function DreamLayer() {
  const [state, setState] = useState<DualLayerState | null>(null)
  const [hasVideos, setHasVideos] = useState<boolean | null>(null)
  const videoIdsRef = useRef<string[]>([])
  const nextVideoIndexRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const cycleTimerARef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cycleTimerBRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cutTimerARef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cutTimerBRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rateTimerARef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rateTimerBRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const layerBDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef<DualLayerState | null>(null)
  const hasVideosRef = useRef<boolean | null>(null)
  const initDoneRef = useRef(false)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { hasVideosRef.current = hasVideos }, [hasVideos])

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

  // ── Pick next video id (round-robin through cache list) ────────────
  const pickNextVideoId = useCallback((excludeId?: string): string | null => {
    const ids = videoIdsRef.current
    if (ids.length === 0) return null
    // Try a few times to avoid picking the excluded id
    for (let i = 0; i < ids.length; i++) {
      const idx = nextVideoIndexRef.current % ids.length
      nextVideoIndexRef.current++
      const id = ids[idx]!
      if (id !== excludeId) return id
    }
    // Fallback: just return next
    const idx = nextVideoIndexRef.current % ids.length
    nextVideoIndexRef.current++
    return ids[idx]!
  }, [])

  // ── Load + play a video, return a VideoLayer ──────────────────────
  const loadLayer = useCallback(async (videoId: string, signal: AbortSignal): Promise<VideoLayer> => {
    const videoEl = await loadVideo(videoId, signal)
    if (signal.aborted) {
      videoEl.pause(); videoEl.src = ''
      throw new Error('Aborted')
    }
    const rate = randomRate()
    videoEl.playbackRate = rate
    await videoEl.play()
    if (signal.aborted) {
      videoEl.pause(); videoEl.src = ''
      throw new Error('Aborted')
    }
    const texture = makeTexture(videoEl)
    return { videoEl, texture, videoId, currentRate: rate, targetRate: rate }
  }, [])

  // ── Cycle a single layer ──────────────────────────────────────────
  const cycleLayer = useCallback(async (which: 'a' | 'b') => {
    const abort = abortRef.current
    if (!abort || abort.signal.aborted) return
    const s = stateRef.current
    if (!s) return
    // Don't start a new swap while another is in progress
    if (s.swappingLayer) return

    const currentLayer = which === 'a' ? s.layerA : s.layerB
    const excludeId = currentLayer?.videoId
    const nextId = pickNextVideoId(excludeId)
    if (!nextId) return

    try {
      const newLayer = await loadLayer(nextId, abort.signal)
      if (abort.signal.aborted) return

      // Begin swap transition
      setState((prev) => {
        if (!prev) return prev
        const oldLayer = which === 'a' ? prev.layerA : prev.layerB
        return {
          ...prev,
          swappingLayer: which,
          swapTransition: 0,
          swapPrevTexture: oldLayer?.texture ?? null,
          swapPrevVideoEl: oldLayer?.videoEl ?? null,
          // Install the new layer immediately (shader will dissolve from old)
          ...(which === 'a'
            ? { layerA: newLayer }
            : { layerB: newLayer }),
        }
      })
    } catch (err) {
      if (!(err instanceof Error && err.message === 'Aborted')) {
        console.warn(`[DreamScene] Failed to cycle layer ${which}:`, err)
      }
    }
  }, [pickNextVideoId, loadLayer])

  // ── Initialize: fetch cache list and load first video (runs once) ──
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
        // Layer A: load immediately
        const videoIdA = ids[0]!
        nextVideoIndexRef.current = 1
        const layerA = await loadLayer(videoIdA, abort.signal)
        if (abort.signal.aborted) return

        initDoneRef.current = true
        setState({
          layerA,
          layerB: null,
          swappingLayer: null,
          swapTransition: 0,
          swapPrevTexture: null,
          swapPrevVideoEl: null,
        })

        // Layer B: load after a random delay with a different video
        layerBDelayRef.current = setTimeout(async () => {
          if (abort.signal.aborted) return
          const videoIdB = pickNextVideoId(videoIdA)
          if (!videoIdB) return
          try {
            const layerB = await loadLayer(videoIdB, abort.signal)
            if (abort.signal.aborted) return
            setState((prev) => prev ? { ...prev, layerB } : prev)
          } catch (err) {
            console.warn('[DreamScene] Failed to load layer B:', err)
          }
        }, randomLayerBDelay())
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
        if (!hasVideosRef.current) setHasVideos(true)
      }
    }, CACHE_REFRESH_INTERVAL)

    return () => {
      abort.abort()
      if (cycleTimerARef.current) clearTimeout(cycleTimerARef.current)
      if (cycleTimerBRef.current) clearTimeout(cycleTimerBRef.current)
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
      if (cutTimerARef.current) clearTimeout(cutTimerARef.current)
      if (cutTimerBRef.current) clearTimeout(cutTimerBRef.current)
      if (rateTimerARef.current) clearInterval(rateTimerARef.current)
      if (rateTimerBRef.current) clearInterval(rateTimerBRef.current)
      if (layerBDelayRef.current) clearTimeout(layerBDelayRef.current)
      const s = stateRef.current
      if (s) {
        disposeVideo(s.layerA.videoEl)
        s.layerA.texture.dispose()
        if (s.layerB) {
          disposeVideo(s.layerB.videoEl)
          s.layerB.texture.dispose()
        }
        if (s.swapPrevVideoEl) disposeVideo(s.swapPrevVideoEl)
        if (s.swapPrevTexture) s.swapPrevTexture.dispose()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Random time jumps (both layers) ────────────────────────────────
  useEffect(() => {
    if (!initDoneRef.current && !state) return
    if (!state) return

    const scheduleNextCut = (layerKey: 'layerA' | 'layerB', timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
      const dbg = useDreamDebugStore.getState()
      const delay = dbg.cutIntervalMin + Math.random() * (dbg.cutIntervalMax - dbg.cutIntervalMin)
      timerRef.current = setTimeout(() => {
        const dbgNow = useDreamDebugStore.getState()
        const s = stateRef.current
        const layer = s?.[layerKey]
        if (dbgNow.randomCuts && layer && layer.videoEl.duration && isFinite(layer.videoEl.duration)) {
          if (Math.random() < dbgNow.randomCutChance) {
            layer.videoEl.currentTime = Math.random() * layer.videoEl.duration
          }
        }
        scheduleNextCut(layerKey, timerRef)
      }, delay)
    }

    scheduleNextCut('layerA', cutTimerARef)
    scheduleNextCut('layerB', cutTimerBRef)
    return () => {
      if (cutTimerARef.current) clearTimeout(cutTimerARef.current)
      if (cutTimerBRef.current) clearTimeout(cutTimerBRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state])

  // ── Variable playback rate (both layers) ───────────────────────────
  useEffect(() => {
    if (!state) return

    rateTimerARef.current = setInterval(() => {
      setState((prev) => prev ? { ...prev, layerA: { ...prev.layerA, targetRate: randomRate() } } : prev)
    }, PLAYBACK_RATE_CHANGE_INTERVAL)

    rateTimerBRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev || !prev.layerB) return prev
        return { ...prev, layerB: { ...prev.layerB, targetRate: randomRate() } }
      })
    }, PLAYBACK_RATE_CHANGE_INTERVAL)

    return () => {
      if (rateTimerARef.current) clearInterval(rateTimerARef.current)
      if (rateTimerBRef.current) clearInterval(rateTimerBRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state])

  // ── Video cycling timers (both layers independently) ───────────────
  useEffect(() => {
    if (!state) return
    const abort = abortRef.current
    if (!abort || abort.signal.aborted) return

    const scheduleCycleA = () => {
      cycleTimerARef.current = setTimeout(async () => {
        await cycleLayer('a')
        if (!abort.signal.aborted) scheduleCycleA()
      }, randomCycleDelay())
    }

    const scheduleCycleB = () => {
      cycleTimerBRef.current = setTimeout(async () => {
        await cycleLayer('b')
        if (!abort.signal.aborted) scheduleCycleB()
      }, randomCycleDelay())
    }

    scheduleCycleA()
    scheduleCycleB()

    return () => {
      if (cycleTimerARef.current) clearTimeout(cycleTimerARef.current)
      if (cycleTimerBRef.current) clearTimeout(cycleTimerBRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state])

  // ── Per-frame: swap transition + playback rate smoothing ──────────
  useFrame((_, delta) => {
    const s = stateRef.current
    if (!s) return
    const d = Math.min(delta, 0.1)
    const dbg = useDreamDebugStore.getState()
    const transitionSpeed = 1.0 / (dbg.transitionDuration / 1000)
    let needsUpdate = false
    const updates: Partial<DualLayerState> = {}

    // Swap transition animation
    if (s.swappingLayer !== null) {
      const newT = Math.min(s.swapTransition + transitionSpeed * d, 1.0)
      if (newT >= 1.0) {
        // Swap complete — dispose old resources
        if (s.swapPrevVideoEl) disposeVideo(s.swapPrevVideoEl)
        if (s.swapPrevTexture) s.swapPrevTexture.dispose()
        updates.swappingLayer = null
        updates.swapTransition = 0
        updates.swapPrevTexture = null
        updates.swapPrevVideoEl = null
      } else {
        updates.swapTransition = newT
      }
      needsUpdate = true
    }

    // Smooth playback rate — layer A
    const rateDiffA = s.layerA.targetRate - s.layerA.currentRate
    if (Math.abs(rateDiffA) > 0.001) {
      const newRate = s.layerA.currentRate + rateDiffA * PLAYBACK_RATE_LERP
      s.layerA.videoEl.playbackRate = newRate
      updates.layerA = { ...s.layerA, ...(updates.layerA as Partial<VideoLayer> | undefined), currentRate: newRate }
      needsUpdate = true
    }

    // Smooth playback rate — layer B
    if (s.layerB) {
      const rateDiffB = s.layerB.targetRate - s.layerB.currentRate
      if (Math.abs(rateDiffB) > 0.001) {
        const newRate = s.layerB.currentRate + rateDiffB * PLAYBACK_RATE_LERP
        s.layerB.videoEl.playbackRate = newRate
        updates.layerB = { ...s.layerB, ...(updates.layerB as Partial<VideoLayer> | undefined), currentRate: newRate }
        needsUpdate = true
      }
    }

    if (needsUpdate) {
      setState((prev) => prev ? { ...prev, ...updates } : prev)
    }
  })

  // ── Generative fallback ───────────────────────────────────────────
  if (hasVideos === false || hasVideos === null) {
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <DreamGenerativeMaterial />
      </mesh>
    )
  }

  if (!state) return null

  // ── Determine shader textures based on swap state ─────────────────
  let videoTexture: THREE.VideoTexture = state.layerA.texture
  let prevVideoTexture: THREE.VideoTexture = state.layerB?.texture ?? state.layerA.texture
  let transition = 1.0

  if (state.swappingLayer === 'a' && state.swapPrevTexture) {
    // Dissolving from old A → new A; temporarily use old A as prev
    videoTexture = state.layerA.texture   // new A
    prevVideoTexture = state.swapPrevTexture // old A
    transition = state.swapTransition
  } else if (state.swappingLayer === 'b' && state.swapPrevTexture) {
    // Dissolving from old B → new B; temporarily use old B as video, new B as prev
    videoTexture = state.layerB?.texture ?? state.layerA.texture  // new B
    prevVideoTexture = state.swapPrevTexture // old B
    transition = state.swapTransition
  }

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <DreamMaterial
        videoTexture={videoTexture}
        prevVideoTexture={prevVideoTexture}
        transition={transition}
      />
    </mesh>
  )
}

// ── Resolution controller (runs inside Canvas) ─────────────────────────

function DreamResolution() {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const scaleRef = useRef(useDreamDebugStore.getState().dreamRenderScale)

  useFrame(() => {
    const scale = useDreamDebugStore.getState().dreamRenderScale
    if (scale !== scaleRef.current) {
      scaleRef.current = scale
      gl.setPixelRatio(scale)
      gl.setSize(size.width, size.height)
    }
  })

  return null
}

// ── Outer component ──────────────────────────────────────────────────────

export function DreamScene() {
  const showPanel = useDreamDebugStore((s) => s.showPanel)
  const togglePanel = useDreamDebugStore((s) => s.togglePanel)
  const renderScale = useDreamDebugStore((s) => s.dreamRenderScale)

  // Start/stop dream audio player on mount/unmount
  useEffect(() => {
    const player = getDreamAudioPlayer()
    void player.start()
    return () => {
      void player.stop()
    }
  }, [])

  // Keyboard toggle: 'D' key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'd' || e.key === 'D') {
        togglePanel()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [togglePanel])

  // Set pixelated upscaling on canvas element
  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.domElement.style.imageRendering = 'pixelated'
  }, [])

  return (
    <div className="fixed inset-0 bg-black" style={{ zIndex: 50 }}>
      <Canvas
        orthographic
        camera={{ zoom: 1, position: [0, 0, 1], near: 0.1, far: 10 }}
        gl={{ antialias: false, alpha: false }}
        dpr={renderScale}
        onCreated={handleCreated}
        style={{ width: '100%', height: '100%' }}
      >
        <DreamResolution />
        <DreamLayer />
      </Canvas>
      {showPanel && <DreamDebugPanel />}
    </div>
  )
}
