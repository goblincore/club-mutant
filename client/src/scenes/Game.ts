import Phaser from 'phaser'
import axios from 'axios'

import { createCharacterAnims } from '../anims/CharacterAnims'
import { mutantRippedAnimKeys } from '../anims/MutantRippedAnims'

import Item from '../items/Item'
import MusicBooth from '../items/MusicBooth'
import { MyYoutubePlayer } from '../items/MyYoutubePlayer'

import '../characters/MyPlayer'
import '../characters/OtherPlayer'
import MyPlayer from '../characters/MyPlayer'
import OtherPlayer from '../characters/OtherPlayer'
import PlayerSelector from '../characters/PlayerSelector'

import type { IPlayer, IMusicStream } from '../../../types/IOfficeState'
import { decodeAnimKey, decodeTextureName } from '../../../types/AnimationCodec'
import { PlayerBehavior } from '../../../types/Players'
import { ItemType } from '../../../types/Items'

import Network from '../services/Network'

import store from '../stores'
import { setShowChat } from '../stores/ChatStore'
import { setMusicStream } from '../stores/MusicStreamStore'
import { setLoggedIn } from '../stores/UserStore'

import { findPathAStar } from '../utils/pathfinding'

import { RoomType } from '../../../types/Rooms'

import { phaserEvents, Event } from '../events/EventCenter'

import { VHS_POSTFX_PIPELINE_KEY, VhsPostFxPipeline } from '../pipelines/VhsPostFxPipeline'
import { SOFT_POSTFX_PIPELINE_KEY, SoftPostFxPipeline } from '../pipelines/SoftPostFxPipeline'

type BackgroundVideoRenderer = 'webgl' | 'iframe'

// Safari has slow video metadata loading (waits for moov atom at end of file)
// Use iframe fallback for Safari to avoid 20-30s delays
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

const BACKGROUND_VIDEO_RENDERER: BackgroundVideoRenderer = isSafari ? 'iframe' : 'webgl'

if (isSafari) {
  console.log('[YoutubeBG] Safari detected, using iframe renderer')
}

export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyW!: Phaser.Input.Keyboard.Key
  private keyA!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key
  private keyD!: Phaser.Input.Keyboard.Key
  private keyE!: Phaser.Input.Keyboard.Key
  private keyR!: Phaser.Input.Keyboard.Key
  private keyT!: Phaser.Input.Keyboard.Key
  private key1!: Phaser.Input.Keyboard.Key
  private key2!: Phaser.Input.Keyboard.Key
  private key3!: Phaser.Input.Keyboard.Key
  private key4!: Phaser.Input.Keyboard.Key
  private key5!: Phaser.Input.Keyboard.Key
  private keyV!: Phaser.Input.Keyboard.Key
  private keyB!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  private groundLayer!: Phaser.Tilemaps.TilemapLayer
  private pathObstacles: Array<{ getBounds: () => Phaser.Geom.Rectangle }> = []
  private lastPointerDownTime = 0
  private interactables: Item[] = []
  private hoveredInteractable: Item | null = null
  private selectorInteractable: Item | null = null
  private highlightedInteractable: Item | null = null
  private hideOverlays() {
    // ...
  }
  private hoverGlowFx = new WeakMap<Item, Phaser.FX.Glow>()
  myPlayer!: MyPlayer
  private playerSelector!: PlayerSelector
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  private pendingPunchTargetId: string | null = null
  private musicBoothMap = new Map<number, MusicBooth>()
  private myYoutubePlayer?: MyYoutubePlayer

  private backgroundVideo?: Phaser.GameObjects.Video
  private backgroundVideoRefreshTimer?: Phaser.Time.TimerEvent
  private activeBackgroundVideoId: string | null = null
  private activeBackgroundVideoIsWebgl = false

  private backgroundModeText?: Phaser.GameObjects.Text
  private lastBackgroundModeLabel: string | null = null

  // Client-side resolve caching and coalescing
  private resolveCache = new Map<string, { url: string; expiresAtMs: number | null }>()
  private inFlightResolves = new Map<string, Promise<{ url: string; expiresAtMs: number | null }>>()

  private setBackgroundModeLabel(label: string) {
    if (this.lastBackgroundModeLabel === label) return
    this.lastBackgroundModeLabel = label

    this.backgroundModeText?.setText(label)
    console.log(`[YoutubeBG] ${label}`)
  }

  private resizeBackgroundSurfaces(width: number, height: number) {
    this.myYoutubePlayer?.resize(width, height)
    this.backgroundVideo?.setDisplaySize(width, height)
  }

  private async stopBackgroundVideo() {
    this.activeBackgroundVideoId = null
    this.activeBackgroundVideoIsWebgl = false

    this.setBackgroundModeLabel('BG: OFF')

    document.getElementById('phaser-container')?.classList.remove('bg-iframe-overlay')

    this.backgroundVideoRefreshTimer?.remove(false)
    this.backgroundVideoRefreshTimer = undefined

    this.backgroundVideo?.pause()
    this.backgroundVideo?.setAlpha(0)
    this.backgroundVideo?.setVisible(false)

    this.myYoutubePlayer?.pause()
    this.myYoutubePlayer?.setAlpha(0)
  }

  private applyIframeBackgroundStyles() {
    const node = this.myYoutubePlayer?.node as HTMLElement | undefined
    if (!node) {
      console.warn('[YoutubeBG] applyIframeBackgroundStyles: node not found')
      return
    }

    const container = document.getElementById('phaser-container')
    if (BACKGROUND_VIDEO_RENDERER === 'iframe') {
      container?.classList.add('bg-iframe-overlay')
    } else {
      container?.classList.remove('bg-iframe-overlay')
    }

    const isIframeOverlay = BACKGROUND_VIDEO_RENDERER === 'iframe'

    const targetOpacity = isIframeOverlay ? '0.2' : '0.8'

    // Ensure the DOM element is visible and positioned correctly
    node.style.setProperty('opacity', targetOpacity, 'important')
    node.style.setProperty('display', 'block', 'important')
    node.style.setProperty('visibility', 'visible', 'important')
    node.style.mixBlendMode = isIframeOverlay ? 'difference' : 'overlay'
    node.style.backgroundColor = 'transparent'
    node.style.setProperty('position', 'absolute', 'important')
    node.style.setProperty('left', '0px', 'important')
    node.style.setProperty('top', '0px', 'important')
    node.style.setProperty('width', '100%', 'important')
    node.style.setProperty('height', '100%', 'important')

    // Rex/Phaser DOM wrappers can apply their own opacity/layout; ensure the wrapper is also translucent.
    const wrapper = node.parentElement
    if (wrapper) {
      wrapper.style.setProperty('opacity', targetOpacity, 'important')
      wrapper.style.setProperty('pointer-events', 'none', 'important')
      wrapper.style.setProperty('background-color', 'transparent', 'important')
      wrapper.style.setProperty('display', 'block', 'important')
      wrapper.style.setProperty('visibility', 'visible', 'important')
    }

    const iframe = node.querySelector('iframe')
    if (iframe) {
      iframe.style.setProperty('pointer-events', 'none', 'important')
      iframe.style.setProperty('opacity', targetOpacity, 'important')
      iframe.style.mixBlendMode = isIframeOverlay ? 'difference' : 'overlay'
      iframe.style.setProperty('width', '100%', 'important')
      iframe.style.setProperty('height', '100%', 'important')
    }

    // Best-effort: request low playback quality if rex exposes the underlying YouTube player.
    // This is not guaranteed (depends on plugin internals and YouTube availability).
    const maybeAny = this.myYoutubePlayer as unknown as {
      youtube?: { setPlaybackQuality?: (q: string) => void }
      player?: { setPlaybackQuality?: (q: string) => void }
    }
    const setPlaybackQuality =
      maybeAny.youtube?.setPlaybackQuality ?? maybeAny.player?.setPlaybackQuality ?? null

    setPlaybackQuality?.('tiny')
  }

  private async resolveYoutubeDirectUrl(videoId: string): Promise<{
    url: string
    expiresAtMs: number | null
  }> {
    const apiBase = import.meta.env.VITE_HTTP_ENDPOINT ?? 'http://localhost:2567'
    const response = await axios.get<{ url: string; expiresAtMs: number | null }>(
      `${apiBase}/youtube/resolve/${videoId}`
    )

    return {
      url: response.data.url,
      expiresAtMs: response.data.expiresAtMs ?? null,
    }
  }

  private getYoutubeProxyUrl(videoId: string): string {
    const apiBase = import.meta.env.VITE_HTTP_ENDPOINT ?? 'http://localhost:2567'
    return `${apiBase}/youtube/proxy/${videoId}`
  }

  private scheduleBackgroundVideoRefresh(videoId: string, expiresAtMs: number | null) {
    this.backgroundVideoRefreshTimer?.remove(false)
    this.backgroundVideoRefreshTimer = undefined

    if (!expiresAtMs) return

    const refreshDelayMs = expiresAtMs - 60_000 - Date.now()
    if (refreshDelayMs <= 0) return

    this.backgroundVideoRefreshTimer = this.time.delayedCall(refreshDelayMs, () => {
      if (this.activeBackgroundVideoId !== videoId) return

      const fallbackTimeSeconds = (() => {
        const t = this.backgroundVideo?.video?.currentTime
        return typeof t === 'number' && Number.isFinite(t) ? t : 0
      })()

      void this.tryPlayWebglBackgroundVideo(videoId, fallbackTimeSeconds)
    })
  }

  private async tryPlayWebglBackgroundVideo(
    videoId: string,
    offsetSeconds: number
  ): Promise<boolean> {
    if (!this.backgroundVideo) return false

    if (BACKGROUND_VIDEO_RENDERER !== 'webgl') {
      await this.playIframeBackgroundVideo(videoId, offsetSeconds, false)
      return true
    }

    try {
      // 1. Skip if already active and playing/loading
      if (this.activeBackgroundVideoId === videoId && this.backgroundVideo?.isPlaying()) {
        return true
      }

      const startTime = performance.now()

      // 2. Check Cache
      const cached = this.resolveCache.get(videoId)
      let resolved: { url: string; expiresAtMs: number | null }

      if (cached && (cached.expiresAtMs === null || cached.expiresAtMs > Date.now())) {
        resolved = cached
        console.log(`[YoutubeBG] Cache hit for ${videoId}`)
      } else {
        // 3. Check In-flight
        const inFlight = this.inFlightResolves.get(videoId)
        if (inFlight) {
          console.log(`[YoutubeBG] Coalescing request for ${videoId}`)
          resolved = await inFlight
        } else {
          this.setBackgroundModeLabel('BG: WEBGL (resolving)')
          const resolvePromise = this.resolveYoutubeDirectUrl(videoId)
          this.inFlightResolves.set(videoId, resolvePromise)

          try {
            resolved = await resolvePromise
            console.log(`[YoutubeBG] Resolve took ${(performance.now() - startTime).toFixed(0)}ms`)

            // Cache for 5 minutes or until expiry
            const expiresAt = resolved.expiresAtMs ?? Date.now() + 5 * 60 * 1000
            this.resolveCache.set(videoId, { ...resolved, expiresAtMs: expiresAt })
          } finally {
            this.inFlightResolves.delete(videoId)
          }
        }
      }

      this.activeBackgroundVideoId = videoId
      this.activeBackgroundVideoIsWebgl = true

      this.setBackgroundModeLabel('BG: WEBGL (loading)')

      this.backgroundVideo.removeAllListeners()
      this.backgroundVideo
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-20)
        .setAlpha(0)
        .setVisible(true)
        .setLoop(true)

      // Use a same-origin proxy URL to avoid googlevideo.com CORS issues.
      // loadHandler() skips Phaser's extension sniff (googlevideo URLs often have no .mp4 suffix).
      const proxiedUrl = this.getYoutubeProxyUrl(videoId)
      const loadStartTime = performance.now()
      ;(
        this.backgroundVideo as unknown as {
          loadHandler: (
            url: string,
            noAudio?: boolean,
            crossOrigin?: string
          ) => Phaser.GameObjects.Video
        }
      ).loadHandler(proxiedUrl, true, 'anonymous')
      this.backgroundVideo.setMute(true)

      this.backgroundVideo.once('metadata', () => {
        console.log(
          `[YoutubeBG] Metadata loaded in ${(performance.now() - loadStartTime).toFixed(0)}ms`
        )
        // When metadata loads, the underlying video element updates its intrinsic dimensions.
        // If we computed scale before that, the display size can be wrong until the next resize event.
        this.resizeBackgroundSurfaces(this.scale.gameSize.width, this.scale.gameSize.height)
        this.backgroundVideo?.setCurrentTime(offsetSeconds)
        this.backgroundVideo?.play(true)
        this.backgroundVideo?.setAlpha(1)
        this.setBackgroundModeLabel('BG: WEBGL')
      })

      // If CORS prevents WebGL from sampling video frames, this can result in a black rectangle.
      // If we don't get a first frame quickly, fall back to the DOM-based YouTube player.
      // Note: 5s timeout to allow for cold cache resolve + video metadata load
      this.time.delayedCall(5000, () => {
        if (this.activeBackgroundVideoId !== videoId) return
        if (!this.activeBackgroundVideoIsWebgl) return
        if (!this.backgroundVideo) return

        const videoWithFrameReady = this.backgroundVideo as Phaser.GameObjects.Video & {
          frameReady?: boolean
        }

        if (videoWithFrameReady.frameReady !== true) {
          console.log(`[YoutubeBG] Frame not ready after 5s, falling back`)
          void this.fallbackToDomYoutubeBackground(videoId, offsetSeconds)
        }
      })

      this.backgroundVideo.once('error', (video: Phaser.GameObjects.Video) => {
        const videoEl = video.video
        const mediaError = videoEl?.error
        const errorInfo = mediaError
          ? `code=${mediaError.code} message="${mediaError.message}"`
          : 'unknown'
        console.error(`[YoutubeBG] Video error: ${errorInfo}`)
        void this.fallbackToDomYoutubeBackground(videoId, offsetSeconds)
      })

      this.scheduleBackgroundVideoRefresh(videoId, resolved.expiresAtMs)

      // Hide DOM fallback if WebGL video is active.
      this.myYoutubePlayer?.pause()
      this.myYoutubePlayer?.setAlpha(0)

      return true
    } catch (e) {
      console.warn(
        '[YoutubeBG] WebGL background resolve/play failed, falling back to DOM player',
        e
      )
      await this.fallbackToDomYoutubeBackground(videoId, offsetSeconds)
      return false
    }
  }

  private async playIframeBackgroundVideo(
    videoId: string,
    offsetSeconds: number,
    isFallback: boolean
  ) {
    this.activeBackgroundVideoId = videoId
    this.activeBackgroundVideoIsWebgl = false

    this.setBackgroundModeLabel(isFallback ? 'BG: IFRAME (fallback)' : 'BG: IFRAME')

    this.backgroundVideoRefreshTimer?.remove(false)
    this.backgroundVideoRefreshTimer = undefined

    this.backgroundVideo?.pause()
    this.backgroundVideo?.setAlpha(0)
    this.backgroundVideo?.setVisible(false)

    if (!this.myYoutubePlayer) {
      console.error('[YoutubeBG] myYoutubePlayer is not initialized')
      return
    }

    this.myYoutubePlayer.setVisible(true)
    this.myYoutubePlayer.setAlpha(1)
    this.myYoutubePlayer.load(videoId, true)
    this.myYoutubePlayer.setMute(true)
    this.myYoutubePlayer.setPlaybackTime(offsetSeconds)
    this.myYoutubePlayer.play()

    console.log(
      `[YoutubeBG] Iframe player loaded for ${videoId}, alpha=${this.myYoutubePlayer.alpha}, visible=${this.myYoutubePlayer.visible}`
    )

    this.applyIframeBackgroundStyles()

    // Best-effort retry once the iframe/player is more likely to be ready.
    this.time.delayedCall(250, () => {
      if (this.activeBackgroundVideoId !== videoId) return
      if (this.activeBackgroundVideoIsWebgl) return
      this.applyIframeBackgroundStyles()
    })

    // Additional retry for visibility
    this.time.delayedCall(1000, () => {
      if (this.activeBackgroundVideoId !== videoId) return
      if (this.activeBackgroundVideoIsWebgl) return
      this.applyIframeBackgroundStyles()
      console.log('[YoutubeBG] Final iframe styling retry')
    })
  }

  private async fallbackToDomYoutubeBackground(videoId: string, offsetSeconds: number) {
    await this.playIframeBackgroundVideo(videoId, offsetSeconds, true)
  }

  private getPlayerFeetPoint(sprite: Phaser.Physics.Arcade.Sprite): { x: number; y: number } {
    const body = sprite.body as Phaser.Physics.Arcade.Body | null
    if (!body) {
      return { x: sprite.x, y: sprite.y }
    }

    return {
      x: body.center.x,
      y: body.bottom,
    }
  }

  private rippedAnimKeys: string[] = []

  private rippedAnimIndex = 0

  private playNextRippedAnim() {
    if (!this.myPlayer || this.rippedAnimKeys.length === 0) return

    const nextKey = this.rippedAnimKeys[this.rippedAnimIndex % this.rippedAnimKeys.length]
    this.rippedAnimIndex += 1

    phaserEvents.emit(Event.MUTANT_RIPPED_DEBUG_CURRENT_ANIM, nextKey)
    this.myPlayer.playDebugAnim(nextKey, this.network, { syncToServer: false })
  }

  constructor() {
    super('game')
  }

  private findTopInteractableAt(worldPoint: { x: number; y: number }): Item | null {
    let topMost: Item | null = null
    let topDepth = -Infinity

    for (const item of this.interactables) {
      if (!item.active || !item.visible) continue

      if (!item.getBounds().contains(worldPoint.x, worldPoint.y)) continue

      if (item.depth >= topDepth) {
        topDepth = item.depth
        topMost = item
      }
    }

    return topMost
  }

  private isPointerOverCanvas(pointer: Phaser.Input.Pointer): boolean {
    const canvas = this.game.canvas
    if (!canvas) return false

    const event = pointer.event
    if (event && 'target' in event) {
      const target = event.target as HTMLElement
      if (target !== canvas) {
        return false
      }
    }

    const rect = canvas.getBoundingClientRect()

    let clientX: number | null = null
    let clientY: number | null = null

    if (event) {
      if ('clientX' in event && typeof event.clientX === 'number') {
        clientX = event.clientX
        clientY = event.clientY
      } else if ('changedTouches' in event && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX
        clientY = event.changedTouches[0].clientY
      }
    }

    if (clientX !== null && clientY !== null) {
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      )
    }

    return (
      pointer.x >= 0 &&
      pointer.x <= this.scale.width &&
      pointer.y >= 0 &&
      pointer.y <= this.scale.height
    )
  }

  preload() {}

  private toggleVhsPostFx() {
    const camera = this.cameras.main
    const existing = camera.getPostPipeline(VHS_POSTFX_PIPELINE_KEY)
    const hasExisting = Array.isArray(existing) ? existing.length > 0 : !!existing

    if (hasExisting) {
      camera.removePostPipeline(VHS_POSTFX_PIPELINE_KEY)
      this.logVhsFps('OFF')
      return
    }

    camera.setPostPipeline(VHS_POSTFX_PIPELINE_KEY)

    const pipeline = camera.getPostPipeline(VHS_POSTFX_PIPELINE_KEY)
    const instance = Array.isArray(pipeline) ? pipeline[pipeline.length - 1] : pipeline

    if (instance && instance instanceof VhsPostFxPipeline) {
      instance.setBypass(false)
      this.logVhsFps(`ON (half-res: ${instance.getHalfRes()}, skip: ${instance.getSkipFrames()})`)
    }
  }

  private logVhsFps(label: string) {
    const fps = this.game.loop.actualFps.toFixed(1)
    console.log(`[VHS] ${label} | FPS: ${fps}`)
  }

  private toggleVhsHalfRes() {
    const camera = this.cameras.main
    const pipeline = camera.getPostPipeline(VHS_POSTFX_PIPELINE_KEY)
    const instance = Array.isArray(pipeline) ? pipeline[pipeline.length - 1] : pipeline

    if (instance && instance instanceof VhsPostFxPipeline) {
      const next = !instance.getHalfRes()
      instance.setHalfRes(next)
      this.logVhsFps(`half-res: ${next ? 'ON (0.5x)' : 'OFF (full)'}`)
    } else {
      console.log('VHS effect not active - press V first to enable')
    }
  }

  private cycleVhsSkipFrames() {
    const camera = this.cameras.main
    const pipeline = camera.getPostPipeline(VHS_POSTFX_PIPELINE_KEY)
    const instance = Array.isArray(pipeline) ? pipeline[pipeline.length - 1] : pipeline

    if (instance && instance instanceof VhsPostFxPipeline) {
      const current = instance.getSkipFrames()
      const next = current >= 3 ? 1 : current + 1
      instance.setSkipFrames(next)
      this.logVhsFps(`frame skip: ${next === 1 ? 'OFF (every frame)' : `${next} frames`}`)
    } else {
      console.log('VHS effect not active - press V first to enable')
    }
  }

  private toggleSoftPostFx() {
    const camera = this.cameras.main
    const existing = camera.getPostPipeline(SOFT_POSTFX_PIPELINE_KEY)
    const hasExisting = Array.isArray(existing) ? existing.length > 0 : !!existing

    if (hasExisting) {
      camera.removePostPipeline(SOFT_POSTFX_PIPELINE_KEY)
      return
    }

    camera.setPostPipeline(SOFT_POSTFX_PIPELINE_KEY)

    const pipeline = camera.getPostPipeline(SOFT_POSTFX_PIPELINE_KEY)
    const instance = Array.isArray(pipeline) ? pipeline[pipeline.length - 1] : pipeline

    if (instance && instance instanceof SoftPostFxPipeline) {
      instance.applyPreset('chaotic')
    }
  }

  private clearHoverHighlight(item: Item) {
    const glow = this.hoverGlowFx.get(item)
    if (glow && item.postFX) {
      item.postFX.remove(glow)
      this.hoverGlowFx.delete(item)
    }

    item.clearTint()
  }

  private applyHoverHighlight(item: Item) {
    const shouldUseFx = this.game.renderer.type === Phaser.WEBGL
    if (shouldUseFx && item.postFX && !this.hoverGlowFx.has(item)) {
      item.postFX.setPadding(12)
      const glow = item.postFX.addGlow(0xffffff, 3, 0, false, 0.2, 12)
      this.hoverGlowFx.set(item, glow)
      return
    }

    item.setTint(0xf2f2f2)
  }

  private updateHighlightedInteractable() {
    const next = this.hoveredInteractable ?? this.selectorInteractable

    if (this.highlightedInteractable === next) return

    if (this.highlightedInteractable) {
      this.clearHoverHighlight(this.highlightedInteractable)
    }

    this.highlightedInteractable = next

    if (next) {
      this.applyHoverHighlight(next)
    }
  }

  private setHoveredInteractable(next: Item | null) {
    if (this.hoveredInteractable === next) return

    this.hoveredInteractable = next
    this.updateHighlightedInteractable()
  }

  private setSelectorInteractable(next: Item | null) {
    if (this.selectorInteractable === next) return

    this.selectorInteractable = next
    this.updateHighlightedInteractable()
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.isPointerOverCanvas(pointer)) {
      this.setHoveredInteractable(null)
      return
    }

    const event = pointer.event
    if (event && 'target' in event && event.target && event.target !== this.game.canvas) {
      this.setHoveredInteractable(null)
      return
    }

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)

    this.setHoveredInteractable(this.findTopInteractableAt(worldPoint))
  }

  registerKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    this.cursors = keyboard.createCursorKeys()
    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyW = keyboard.addKey('W')
    this.keyA = keyboard.addKey('A')
    this.keyS = keyboard.addKey('S')
    this.keyD = keyboard.addKey('D')
    this.keyE = keyboard.addKey('E')
    this.keyR = keyboard.addKey('R')
    this.keyT = keyboard.addKey('T')
    this.key1 = keyboard.addKey('ONE')
    this.key2 = keyboard.addKey('TWO')
    this.key3 = keyboard.addKey('THREE')
    this.key4 = keyboard.addKey('FOUR')
    this.key5 = keyboard.addKey('FIVE')
    this.keyV = keyboard.addKey('V')
    this.keyB = keyboard.addKey('B')
    keyboard.disableGlobalCapture()
    keyboard.on('keydown-ESC', (event) => {
      store.dispatch(setShowChat(false))
    })

    keyboard.on('keydown-V', (event: KeyboardEvent) => {
      if (this.game.renderer.type !== Phaser.WEBGL) return

      if (event.shiftKey) {
        this.toggleVhsHalfRes()
      } else if (event.ctrlKey || event.metaKey) {
        this.cycleVhsSkipFrames()
      } else {
        this.toggleVhsPostFx()
      }
    })

    keyboard.on('keydown-B', () => {
      if (this.game.renderer.type !== Phaser.WEBGL) return
      this.toggleSoftPostFx()
    })
  }

  disableKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    keyboard.enabled = false
  }

  enableKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    keyboard.enabled = true
  }

  private buildBlockedGrid(): { width: number; height: number; blocked: Uint8Array } {
    const width = this.map.width
    const height = this.map.height

    const blocked = new Uint8Array(width * height)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = this.groundLayer.getTileAt(x, y)
        if (tile?.collides) {
          blocked[y * width + x] = 1
        }
      }
    }

    for (const obstacle of this.pathObstacles) {
      const left = obstacle.getBounds().left
      const right = obstacle.getBounds().right
      const top = obstacle.getBounds().top
      const bottom = obstacle.getBounds().bottom

      const startX = this.map.worldToTileX(left) ?? 0
      const endX = this.map.worldToTileX(right) ?? 0
      const startY = this.map.worldToTileY(top) ?? 0
      const endY = this.map.worldToTileY(bottom) ?? 0

      for (let ty = startY; ty <= endY; ty += 1) {
        for (let tx = startX; tx <= endX; tx += 1) {
          if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue
          blocked[ty * width + tx] = 1
        }
      }
    }

    const expanded = new Uint8Array(blocked)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (blocked[y * width + x] !== 1) continue

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
            expanded[ny * width + nx] = 1
          }
        }
      }
    }

    return { width, height, blocked: expanded }
  }

  private findNearestOpenTile(params: {
    width: number

    height: number

    blocked: Uint8Array

    x: number

    y: number

    maxRadius?: number
  }): { x: number; y: number } | null {
    const { width, height, blocked, x, y, maxRadius = 12 } = params

    const inBounds = (tx: number, ty: number) => tx >= 0 && tx < width && ty >= 0 && ty < height

    let best: { x: number; y: number } | null = null
    let bestDistSq = Number.POSITIVE_INFINITY

    for (let r = 0; r <= maxRadius; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const tx = x + dx
          const ty = y + dy
          if (!inBounds(tx, ty)) continue

          if (blocked[ty * width + tx] === 0) {
            const distSq = dx * dx + dy * dy
            if (distSq < bestDistSq) {
              bestDistSq = distSq
              best = { x: tx, y: ty }
            }
          }
        }
      }

      if (best) return best
    }

    return null
  }

  create(data: { network: Network }) {
    if (!data.network) {
      throw new Error('server instance missing')
    } else {
      this.network = data.network
    }

    this.registerKeys()

    createCharacterAnims(this.anims)

    this.rippedAnimKeys = mutantRippedAnimKeys.slice().sort()

    phaserEvents.on(Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM, this.playNextRippedAnim, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      phaserEvents.off(Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM, this.playNextRippedAnim, this)
    })

    this.map = this.make.tilemap({ key: 'tilemap' })
    const FloorAndGround = this.map.addTilesetImage('FloorAndGround', 'tiles_wall')

    if (!FloorAndGround) {
      throw new Error('missing tileset FloorAndGround')
    }

    const groundLayer = this.map.createLayer('Ground', FloorAndGround)
    if (!groundLayer) {
      throw new Error('missing tilemap layer Ground')
    }

    groundLayer.setCollisionByProperty({ collides: true })
    this.groundLayer = groundLayer

    this.myPlayer = this.add.myPlayer(705, 500, 'mutant', this.network.mySessionId)

    const state = store.getState()
    if (!state.user.loggedIn && state.room.roomType === RoomType.PUBLIC) {
      const generatedName = `mutant-${this.network.mySessionId}`

      this.myPlayer.setPlayerTexture('mutant')
      this.myPlayer.setPlayerName(generatedName)
      this.network.readyToConnect()
      store.dispatch(setLoggedIn(true))
    }

    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)

    this.input.on('pointermove', this.handlePointerMove, this)

    // import music booth objects from Tiled map to Phaser
    const musicBooths = this.physics.add.staticGroup({ classType: MusicBooth })
    const musicBoothLayer = this.map.getObjectLayer('MusicBooth')
    if (!musicBoothLayer) {
      throw new Error('missing object layer MusicBooth')
    }

    musicBoothLayer.objects.forEach((obj, index) => {
      if (index !== 0) return
      const item = this.addObjectFromTiled(
        musicBooths,
        obj,
        'musicBooths',
        'musicBooth'
      ) as MusicBooth
      item.id = index
      item.itemDirection = 'up'
      this.musicBoothMap.set(index, item)

      this.interactables.push(item)
    })

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })

    this.cameras.main.zoom = 1.5
    this.cameras.main.startFollow(this.myPlayer, true)

    this.physics.add.collider(this.myPlayer, groundLayer)

    this.physics.add.overlap(
      this.playerSelector,
      [musicBooths],
      this.handleItemSelectorOverlap,
      undefined,
      this
    )

    this.physics.add.collider(this.myPlayer, this.otherPlayers)

    this.backgroundModeText = this.add.text(12, 12, 'BG: OFF', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      padding: { x: 6, y: 4 },
    })
    this.backgroundModeText.setScrollFactor(0)
    this.backgroundModeText.setDepth(100000)
    this.backgroundModeText.setVisible(true)

    this.backgroundVideo = this.add.video(0, 0)
    this.backgroundVideo.setOrigin(0, 0)
    this.backgroundVideo.setScrollFactor(0)
    this.backgroundVideo.setDepth(-20)
    this.backgroundVideo.setAlpha(0)
    this.backgroundVideo.setVisible(false)
    this.backgroundVideo.setDisplaySize(this.scale.gameSize.width, this.scale.gameSize.height)

    // Youtube background player (Phaser-native)
    this.myYoutubePlayer = new MyYoutubePlayer({
      scene: this,
      x: 0,
      y: 0,
      width: this.scale.gameSize.width,
      height: this.scale.gameSize.height,
      config: {
        autoPlay: true,
        controls: false,
        keyboardControl: false,
        modestBranding: true,
        showVideoTitle: false,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        loop: true,
      },
    })
    this.myYoutubePlayer.setOrigin(0, 0)
    this.myYoutubePlayer.setScrollFactor(0)
    this.myYoutubePlayer.setDepth(-10)
    this.myYoutubePlayer.alpha = 0

    this.myYoutubePlayer.pointerEvents = 'none'

    // Ensure future iframes are also non-interactive
    this.myYoutubePlayer.on('ready', () => {
      this.applyIframeBackgroundStyles()
    })

    // Handle resize
    this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => {
      this.resizeBackgroundSurfaces(gameSize.width, gameSize.height)
    })

    // Ensure correct initial sizing (Phaser doesn't always emit RESIZE on first layout)
    this.time.delayedCall(0, () => {
      this.scale.refresh()
      this.resizeBackgroundSurfaces(this.scale.gameSize.width, this.scale.gameSize.height)
    })

    this.time.delayedCall(200, () => {
      this.scale.refresh()
      this.resizeBackgroundSurfaces(this.scale.gameSize.width, this.scale.gameSize.height)
    })

    // Interaction to allow autoplay
    this.input.once('pointerdown', () => {
      if (this.myYoutubePlayer?.alpha === 1) {
        this.myYoutubePlayer.play()
      }

      if (this.backgroundVideo?.alpha === 1) {
        this.backgroundVideo.play(true)
      }
    })

    // register network event listeners
    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this)
    this.network.onMyPlayerForcedAnim(this.handleMyPlayerForcedAnim, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onItemUserAdded(this.handleItemUserAdded, this)
    this.network.onItemUserRemoved(this.handleItemUserRemoved, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)
    this.network.onStartMusicStream(this.handleStartMusicStream, this)
    this.network.onStopMusicStream(this.handleStopMusicStream, this)
    this.network.onVideoBackgroundEnabledChanged(this.handleVideoBackgroundEnabledChanged, this)

    // Enable VHS post-FX by default
    if (this.game.renderer.type === Phaser.WEBGL) {
      this.toggleVhsPostFx()
    }

    // Late-join sync: if a stream is already playing (and background video is already enabled),
    // we may have missed the initial START_PLAYING_MEDIA emit during Network.initialize().
    this.time.delayedCall(250, () => {
      this.handleVideoBackgroundEnabledChanged(store.getState().musicStream.videoBackgroundEnabled)
    })
  }

  private handleVideoBackgroundEnabledChanged(enabled: boolean) {
    const { link: url, startTime, isAmbient } = store.getState().musicStream

    if (!enabled || !url || isAmbient) {
      void this.stopBackgroundVideo()
      return
    }

    const offset = startTime > 0 ? (Date.now() - startTime) / 1000 : 0
    const videoId = this.getYouTubeVideoId(url)

    console.log(
      `[YoutubeBG] Enabled mid-stream | Loading Video ID: ${videoId} at offset: ${offset}`
    )

    void this.tryPlayWebglBackgroundVideo(videoId, offset)
  }

  private handleItemSelectorOverlap(playerSelector, selectionItem) {
    const currentItem = playerSelector.selectedItem as Item
    // currentItem is undefined if nothing was perviously selected
    if (currentItem) {
      // if the selection has not changed, do nothing
      if (currentItem === selectionItem || currentItem.depth >= selectionItem.depth) {
        return
      }
      // if selection changes, clear pervious dialog
      if (this.myPlayer.playerBehavior !== PlayerBehavior.SITTING) currentItem.clearDialogBox()
    }

    // set selected item and set up new dialog
    playerSelector.selectedItem = selectionItem
    selectionItem.onOverlapDialog()

    this.setSelectorInteractable(selectionItem)
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5

    const tileset = this.map.getTileset(tilesetName)
    if (!tileset) {
      throw new Error(`missing tileset ${tilesetName}`)
    }

    const rawFrame = object.gid! - tileset.firstgid
    const texture = this.textures.get(key)
    const safeFrame = texture.has(String(rawFrame)) ? rawFrame : 0

    const obj = group.get(actualX, actualY, key, safeFrame).setDepth(actualY)
    return obj
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    if (this.otherPlayerMap.has(id)) return

    const initialTexture = decodeTextureName(newPlayer.textureId)

    const otherPlayer = this.add.otherPlayer(
      newPlayer.x,
      newPlayer.y,
      initialTexture,
      id,
      newPlayer.name
    )

    const initialAnimKey = decodeAnimKey(newPlayer.textureId, newPlayer.animId)
    otherPlayer.updateOtherPlayer('anim', initialAnimKey)

    this.otherPlayers.add(otherPlayer)
    this.otherPlayerMap.set(id, otherPlayer)
  }

  // function to remove the player who left from the otherPlayer group
  private handlePlayerLeft(id: string) {
    if (this.otherPlayerMap.has(id)) {
      const otherPlayer = this.otherPlayerMap.get(id)
      if (!otherPlayer) return
      this.otherPlayers.remove(otherPlayer, true, true)
      this.otherPlayerMap.delete(id)
    }
  }

  private handleMyPlayerReady() {
    this.myPlayer.readyToConnect = true
  }

  // function to update target position upon receiving player updates
  private handlePlayerUpdated(field: string, value: number | string, id: string) {
    const otherPlayer = this.otherPlayerMap.get(id)
    otherPlayer?.updateOtherPlayer(field, value)
  }

  private handleMyPlayerForcedAnim(animKey: string, x?: number, y?: number) {
    if (!this.myPlayer || !this.network) return
    this.myPlayer.cancelMoveNavigation()

    if (typeof x === 'number' && typeof y === 'number') {
      const body = this.myPlayer.body as Phaser.Physics.Arcade.Body | null
      this.myPlayer.x = x
      this.myPlayer.y = y
      body?.reset(x, y)
      this.myPlayer.playerContainer.x = x
      this.myPlayer.playerContainer.y = y
    }

    this.myPlayer.playHitAnim(animKey, this.network)
  }

  private handlePlayersOverlap(myPlayer, otherPlayer) {}

  private handleItemUserAdded(playerId: string, itemId: number, itemType: ItemType) {
    console.log('////NETWORK handleItemUserAdded', playerId, itemId, itemType)
    if (itemType === ItemType.MUSIC_BOOTH) {
      const musicBooth = this.musicBoothMap.get(itemId)
      const currentPlayer =
        this.otherPlayerMap.get(playerId) || this.myPlayer.playerId === playerId
          ? this.myPlayer
          : null
      console.log('currentDJPlayerinfo', currentPlayer)
      musicBooth?.addCurrentUser(playerId)
      console.log('////MusicBooth', musicBooth)
    }
  }

  private handleItemUserRemoved(playerId: string, itemId: number, itemType: ItemType) {
    if (itemType === ItemType.MUSIC_BOOTH) {
      const musicBooth = this.musicBoothMap.get(itemId)
      musicBooth?.removeCurrentUser(playerId)
    }
  }

  private handleChatMessageAdded(playerId: string, content: string) {
    console.log('////handleChatMessageAdded')
    const currentDjSessionId = store.getState().musicStream.currentDj.sessionId
    const boothDjSessionId = this.musicBoothMap.get(0)?.currentUser ?? null
    const resolvedDjSessionId = currentDjSessionId ?? boothDjSessionId
    const connectedBoothIndex = store.getState().musicBooth.musicBoothIndex
    const isDj =
      (resolvedDjSessionId !== null && playerId === resolvedDjSessionId) ||
      (connectedBoothIndex !== null && playerId === this.network.mySessionId)
    const bubbleScale = isDj ? 1.5 : 1

    if (this.myPlayer.playerId === playerId) {
      this.myPlayer.updateDialogBubble(content, bubbleScale)
      return
    }

    const otherPlayer = this.otherPlayerMap.get(playerId)
    otherPlayer?.updateDialogBubble(content, bubbleScale)
  }

  private getYouTubeVideoId(url: string): string {
    if (!url) return ''
    if (url.length === 11) return url // Already an ID

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)

    return match && match[2].length === 11 ? match[2] : url
  }

  private handleStartMusicStream(musicStream: IMusicStream, offset: number) {
    console.log('////handleStartMusicStream, musicStream.currentLink', musicStream.currentLink)
    console.log('////handleStartMusicStream, offset', offset)

    console.log('musicStream handle start music stream game', musicStream)
    const {
      currentLink: url,
      currentTitle: title,
      streamId,
      currentDj,
      startTime,
      isRoomPlaylist,
      roomPlaylistIndex,
      videoBackgroundEnabled,
      isAmbient,
    } = musicStream

    console.log('game handle start music stream', url)

    store.dispatch(
      setMusicStream({
        url,
        title,
        streamId,
        currentDj,
        startTime,
        isRoomPlaylist,
        roomPlaylistIndex,
        videoBackgroundEnabled,
        isAmbient,
      })
    )

    if (videoBackgroundEnabled && url && !isAmbient) {
      const videoId = this.getYouTubeVideoId(url)
      console.log(`[YoutubeBG] Loading Video ID: ${videoId} at offset: ${offset}`)
      void this.tryPlayWebglBackgroundVideo(videoId, offset)
    } else {
      void this.stopBackgroundVideo()
    }

    this.prefetchNextVideoInQueue(isRoomPlaylist, roomPlaylistIndex)
  }

  private prefetchNextVideoInQueue(isRoomPlaylist: boolean, currentIndex: number | null) {
    try {
      const state = store.getState()
      let nextVideoLink: string | null = null

      if (isRoomPlaylist && typeof currentIndex === 'number') {
        const roomPlaylist = state.roomPlaylist.items
        const nextItem = roomPlaylist[currentIndex + 1]
        if (nextItem) {
          nextVideoLink = nextItem.link
        }
      }

      if (nextVideoLink) {
        const nextVideoId = this.getYouTubeVideoId(nextVideoLink)
        console.log(`[Prefetch] Prefetching next video in queue: ${nextVideoId}`)

        const youtubeServiceUrl =
          import.meta.env.VITE_YOUTUBE_SERVICE_URL || 'http://localhost:8081'
        void fetch(`${youtubeServiceUrl}/prefetch/${nextVideoId}`, {
          method: 'POST',
        }).catch((err) => {
          console.warn(`[Prefetch] Failed to prefetch ${nextVideoId}:`, err)
        })
      }
    } catch (err) {
      console.warn('[Prefetch] Error in prefetchNextVideoInQueue:', err)
    }
  }

  private handleStopMusicStream() {
    console.log('////handleStopMusicStream')
    store.dispatch(setMusicStream(null))
    void this.stopBackgroundVideo()
  }

  update(t: number, dt: number) {
    if (this.myPlayer && this.network) {
      if (this.key5 && Phaser.Input.Keyboard.JustDown(this.key5)) {
        this.playNextRippedAnim()
      }

      const pointer = this.input.activePointer

      if (pointer.isDown && pointer.downTime !== this.lastPointerDownTime) {
        this.lastPointerDownTime = pointer.downTime

        const state = store.getState()

        const canMove =
          !state.chat.focused &&
          !state.myPlaylist.focused &&
          !state.myPlaylist.myPlaylistPanelOpen &&
          this.myPlayer.playerBehavior === PlayerBehavior.IDLE &&
          !pointer.rightButtonDown() &&
          this.isPointerOverCanvas(pointer)

        if (canMove) {
          const downTime = pointer.downTime
          const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
          const x = worldPoint.x
          const y = worldPoint.y

          const clickedOtherPlayer = (() => {
            let topMost: OtherPlayer | null = null
            let topDepth = -Infinity

            for (const otherPlayer of this.otherPlayerMap.values()) {
              if (!otherPlayer.active || !otherPlayer.visible) continue
              if (!otherPlayer.getBounds().contains(x, y)) continue
              if (otherPlayer.depth >= topDepth) {
                topDepth = otherPlayer.depth
                topMost = otherPlayer
              }
            }

            return topMost
          })()

          if (!clickedOtherPlayer) {
            this.pendingPunchTargetId = null
          }

          const clickedItem = this.findTopInteractableAt({ x, y })

          const moveToWorld = (targetX: number, targetY: number, maxRadius?: number) => {
            const startX = this.map.worldToTileX(this.myPlayer.x)
            const startY = this.map.worldToTileY(this.myPlayer.y)
            const goalX = this.map.worldToTileX(targetX)
            const goalY = this.map.worldToTileY(targetY)

            if (startX === null || startY === null || goalX === null || goalY === null) {
              this.myPlayer.setMoveTarget(targetX, targetY)
              return { x: targetX, y: targetY }
            }

            const { width, height, blocked } = this.buildBlockedGrid()

            const isStartBlocked = blocked[startY * width + startX] === 1
            const isGoalBlocked = blocked[goalY * width + goalX] === 1

            const startOpen = !isStartBlocked
              ? { x: startX, y: startY }
              : this.findNearestOpenTile({ width, height, blocked, x: startX, y: startY })

            const goalOpen = !isGoalBlocked
              ? { x: goalX, y: goalY }
              : this.findNearestOpenTile({
                  width,
                  height,
                  blocked,
                  x: goalX,
                  y: goalY,
                  maxRadius,
                })

            if (!startOpen || !goalOpen) {
              this.myPlayer.setMoveTarget(targetX, targetY)
              return { x: targetX, y: targetY }
            }

            const tilePath = findPathAStar({
              width,
              height,
              blocked,
              start: startOpen,
              goal: goalOpen,
            })

            const tileWidth = this.map.tileWidth || 32
            const tileHeight = this.map.tileHeight || 32

            const goalWorld = {
              x: (this.map.tileToWorldX(goalOpen.x) ?? 0) + tileWidth * 0.5,
              y: (this.map.tileToWorldY(goalOpen.y) ?? 0) + tileHeight * 0.5,
            }

            if (tilePath && tilePath.length > 0) {
              const waypoints = tilePath.slice(1).map((p) => ({
                x: (this.map.tileToWorldX(p.x) ?? 0) + tileWidth * 0.5,
                y: (this.map.tileToWorldY(p.y) ?? 0) + tileHeight * 0.5,
              }))

              if (waypoints.length === 0) {
                this.myPlayer.setMoveTarget(goalWorld.x, goalWorld.y)
              } else {
                this.myPlayer.setMovePath(waypoints)
              }
            } else {
              this.myPlayer.setMoveTarget(goalWorld.x, goalWorld.y)
            }

            return goalWorld
          }

          const clickedBooth = clickedItem instanceof MusicBooth ? clickedItem : null
          const isHighlightedBooth =
            clickedBooth &&
            clickedBooth === this.highlightedInteractable &&
            clickedBooth.currentUser === null

          if (isHighlightedBooth) {
            const boothBounds = clickedBooth.getBounds()
            const approachX = boothBounds.centerX
            const approachY = boothBounds.bottom + 8

            const standTarget = moveToWorld(approachX, approachY, 12)
            this.myPlayer.queueAutoEnterMusicBooth(clickedBooth, standTarget)
            return
          }

          if (clickedOtherPlayer) {
            const targetFeet = this.getPlayerFeetPoint(clickedOtherPlayer)
            const approachX = targetFeet.x
            const approachY = targetFeet.y

            moveToWorld(approachX, approachY, 12)
            this.pendingPunchTargetId = clickedOtherPlayer.playerId
            return
          }

          moveToWorld(x, y)
        }
      }

      if (this.pendingPunchTargetId) {
        const target = this.otherPlayerMap.get(this.pendingPunchTargetId)
        if (!target) {
          this.pendingPunchTargetId = null
        } else {
          const myFeet = this.getPlayerFeetPoint(this.myPlayer)
          const targetFeet = this.getPlayerFeetPoint(target)

          const dx = targetFeet.x - myFeet.x
          const dy = targetFeet.y - myFeet.y
          const punchRangePx = 56
          const punchDyWeight = 1.5
          const weightedDistanceSq = dx * dx + dy * punchDyWeight * (dy * punchDyWeight)

          if (weightedDistanceSq <= punchRangePx * punchRangePx) {
            this.myPlayer.cancelMoveNavigation()

            const absDx = Math.abs(dx)
            const absDy = Math.abs(dy)
            const diagonalThreshold = 0.5
            const isDiagonal =
              absDx > 0 &&
              absDy > 0 &&
              absDx / absDy > diagonalThreshold &&
              absDy / absDx > diagonalThreshold

            let dir: 'left' | 'right' | 'down' | 'down_left' | 'down_right' | 'up_left' | 'up_right'

            if (isDiagonal) {
              if (dy > 0) {
                dir = dx >= 0 ? 'down_right' : 'down_left'
              } else {
                dir = dx >= 0 ? 'up_right' : 'up_left'
              }
            } else if (absDx >= absDy) {
              dir = dx >= 0 ? 'right' : 'left'
            } else {
              dir = dy >= 0 ? 'down' : 'up_right'
            }

            if (this.myPlayer.playerTexture === 'mutant') {
              const punchAnimKey = `mutant_punch_${dir}`
              this.myPlayer.playActionAnim(punchAnimKey, this.network)
            }

            this.network.punchPlayer(target.playerId)
            this.pendingPunchTargetId = null
          }
        }
      }

      this.playerSelector.update(this.myPlayer, this.cursors, {
        up: this.keyW,
        down: this.keyS,
        left: this.keyA,
        right: this.keyD,
      })

      if (
        this.myPlayer.playerBehavior !== PlayerBehavior.IDLE ||
        !this.playerSelector.selectedItem
      ) {
        this.setSelectorInteractable(null)
      }

      this.myPlayer.update(
        this.playerSelector,
        this.cursors,
        {
          up: this.keyW,
          down: this.keyS,
          left: this.keyA,
          right: this.keyD,
        },
        this.keyE,
        this.keyR,
        this.network,
        dt,
        this.keyT,
        {
          key1: this.key1,
          key2: this.key2,
          key3: this.key3,
          key4: this.key4,
        }
      )
    }
  }
}
