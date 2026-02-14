import { Client, Room, getStateCallbacks } from '@colyseus/sdk'
import type { IOfficeState, IPlayer } from '@club-mutant/types/IOfficeState'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'

import { useGameStore, setPlayerPosition, getPlayerPosition } from '../stores/gameStore'
import { useChatStore } from '../stores/chatStore'
import { useMusicStore } from '../stores/musicStore'
import { useBoothStore } from '../stores/boothStore'
import { triggerRemoteJump } from '../scene/PlayerEntity'
import { addRipple } from '../scene/TrampolineRipples'
import { TimeSync } from './TimeSync'

const PLAYER_ID_KEY = 'club-mutant-3d:player-id'

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY)

  if (!id) {
    id = crypto.randomUUID().slice(0, 8)
    localStorage.setItem(PLAYER_ID_KEY, id)
  }

  return id
}

export class NetworkManager {
  private client: Client
  private room: Room<IOfficeState> | null = null
  private lobby: Room | null = null
  private moveThrottleTimer: ReturnType<typeof setTimeout> | null = null
  private httpBaseUrl: string
  private _timeSync: TimeSync | null = null

  constructor(serverUrl?: string) {
    const url =
      serverUrl ??
      (import.meta.env.VITE_WS_ENDPOINT ||
        (window.location.hostname === 'localhost'
          ? 'ws://localhost:2567'
          : `wss://${window.location.hostname}`))

    this.client = new Client(url)
    this.httpBaseUrl = url.replace(/^ws/, 'http')
  }

  async joinPublicRoom(playerName: string, textureId?: number): Promise<void> {
    const gameStore = useGameStore.getState()

    try {
      this.room = await this.client.joinOrCreate<IOfficeState>(RoomType.PUBLIC, {
        name: playerName,
        playerId: getOrCreatePlayerId(),
        ...(textureId != null ? { textureId } : {}),
      })

      // Configure reconnection: max 10 retries, up to 8s delay
      this.room.reconnection.maxRetries = 10
      this.room.reconnection.maxDelay = 8000

      this._timeSync = new TimeSync(this.room as Room)
      this._timeSync.start()

      this.wireRoomListeners()

      // Only mark connected AFTER listeners are wired — prevents half-initialized state
      gameStore.setConnected(true, this.room.sessionId)
    } catch (err) {
      console.error('[network] Failed to join room:', err)
      throw err
    }
  }

  private wireRoomListeners() {
    if (!this.room) return

    const $ = getStateCallbacks(this.room)

    // Colyseus 0.17 pattern: wrap state, then access collections on the proxy
    const stateProxy = $(this.room.state) as any
    const playersProxy = stateProxy.players

    // Clamp server positions to 3D room bounds (ROOM_SIZE=12, WORLD_SCALE=0.01 → ±550 server px)
    const ROOM_MAX = 550
    const clampPos = (v: number) => Math.max(-ROOM_MAX, Math.min(ROOM_MAX, v))

    // Track recently-added remote players so we can skip initial listen fires
    // that carry the server's legacy 2D default position (705, 500).
    const freshRemotes = new Set<string>()

    // Player add/remove/change
    playersProxy.onAdd((player: IPlayer, sessionId: string) => {
      const gameStore = useGameStore.getState()
      const chatStore = useChatStore.getState()

      const cx = clampPos(player.x)
      const cy = clampPos(player.y)

      console.log(
        `[network] onAdd ${sessionId} textureId=${player.textureId} name=${player.name} pos=(${player.x},${player.y})→(${cx},${cy})`
      )

      const isLocal = sessionId === this.room?.sessionId
      const localSessionId = this.room?.sessionId

      // Detect players still at the server's legacy 2D default position (705, 500).
      // These are freshly-spawned players who haven't sent a 3D position yet.
      const isDefault2dSpawn = Math.abs(player.x - 705) < 2 && Math.abs(player.y - 500) < 2

      // Only guard freshly-spawned remote players at the 2D default —
      // their listen callback would echo 705/500 before they send (0,0).
      // Existing players with real positions should NOT be guarded.
      if (!isLocal && isDefault2dSpawn) {
        freshRemotes.add(sessionId)
        setTimeout(() => {
          freshRemotes.delete(sessionId)
          console.log(`[network] ${sessionId} no longer fresh, accepting listen updates`)
        }, 300)
      }

      const playerProxy = $(player) as any

      playerProxy.listen('x', (value: number) => {
        if (sessionId === localSessionId) return

        if (freshRemotes.has(sessionId)) {
          console.log(`[network] SKIP listen x=${value} for fresh remote ${sessionId}`)
          return
        }

        const pos = getPlayerPosition(sessionId)
        if (pos) pos.x = clampPos(value)
      })

      playerProxy.listen('y', (value: number) => {
        if (sessionId === localSessionId) return

        if (freshRemotes.has(sessionId)) {
          console.log(`[network] SKIP listen y=${value} for fresh remote ${sessionId}`)
          return
        }

        const pos = getPlayerPosition(sessionId)
        if (pos) pos.y = clampPos(value)
      })

      // Use (0,0) for local player and freshly-spawned remotes at the 2D default.
      // Existing players with real positions keep their actual server position.
      const spawnX = isLocal || isDefault2dSpawn ? 0 : cx
      const spawnY = isLocal || isDefault2dSpawn ? 0 : cy

      setPlayerPosition(sessionId, spawnX, spawnY)

      gameStore.addPlayer(sessionId, {
        sessionId,
        name: player.name,
        textureId: player.textureId,
        animId: player.animId,
        scale: player.scale,
      })

      if (isLocal) {
        gameStore.setLocalPosition(0, 0)
        // Tell the server we're at (0,0) so it doesn't echo back the 2D default
        this.sendPosition(0, 0, 'idle')
      }

      playerProxy.listen('name', (value: string) => {
        useGameStore.getState().updatePlayer(sessionId, { name: value })
      })

      playerProxy.listen('animId', (value: number) => {
        useGameStore.getState().updatePlayer(sessionId, { animId: value })
      })

      playerProxy.listen('textureId', (value: number) => {
        console.log(`[network] textureId listen ${sessionId} -> ${value}`)
        useGameStore.getState().updatePlayer(sessionId, { textureId: value })
      })

      playerProxy.listen('scale', (value: number) => {
        useGameStore.getState().updatePlayer(sessionId, { scale: value })
      })

      if (player.name) {
        chatStore.addMessage({
          id: crypto.randomUUID(),
          author: 'system',
          content: `${player.name} joined`,
          createdAt: Date.now(),
        })
      }
    }, true) // true = trigger for existing items

    playersProxy.onRemove((_player: IPlayer, sessionId: string) => {
      const gameStore = useGameStore.getState()
      const chatStore = useChatStore.getState()

      const existing = gameStore.players.get(sessionId)
      const name = existing?.name ?? sessionId

      gameStore.removePlayer(sessionId)

      chatStore.addMessage({
        id: crypto.randomUUID(),
        author: 'system',
        content: `${name} left`,
        createdAt: Date.now(),
      })
    })

    // Chat messages (from other players)
    this.room.onMessage(Message.ADD_CHAT_MESSAGE, (data: { clientId: string; content: string }) => {
      const player = useGameStore.getState().players.get(data.clientId)
      const chatStore = useChatStore.getState()

      chatStore.addMessage({
        id: crypto.randomUUID(),
        author: player?.name ?? data.clientId,
        content: data.content,
        createdAt: Date.now(),
      })

      // Show in-world chat bubble
      if (data.clientId) {
        chatStore.setBubble(data.clientId, data.content)
      }
    })

    // Music stream messages
    this.room.onMessage(
      Message.START_MUSIC_STREAM,
      (data: { musicStream: any; offset: number }) => {
        const ms = data.musicStream
        if (!ms) return

        // Skip ambient background streams — no DJ is playing
        if (ms.isAmbient) return

        // Convert server startTime to client time using clock sync
        const clientStartTime = this._timeSync?.ready
          ? this._timeSync.toClientTime(ms.startTime ?? 0)
          : (ms.startTime ?? 0)

        useMusicStore.getState().setStream({
          currentLink: ms.currentLink ?? null,
          currentTitle: ms.currentTitle ?? null,
          currentDjName: ms.currentDj?.name ?? null,
          startTime: clientStartTime,
          duration: ms.duration ?? 0,
          isPlaying: true,
          streamId: ms.streamId ?? 0,
        })
      }
    )

    this.room.onMessage(Message.STOP_MUSIC_STREAM, () => {
      useMusicStore.getState().clearStream()
    })

    // Periodic drift correction — server sends streamId + startTime every 5s
    this.room.onMessage(
      Message.MUSIC_STREAM_TICK,
      (data: { streamId: number; startTime: number; serverNowMs: number }) => {
        const store = useMusicStore.getState()

        // Ignore ticks for a different stream
        if (!store.stream.isPlaying || store.stream.streamId !== data.streamId) return

        // Recompute client-local startTime from this tick's authoritative server time
        const clientStartTime = this._timeSync?.ready
          ? this._timeSync.toClientTime(data.startTime)
          : data.startTime

        const currentClientStart = store.stream.startTime
        const drift = Math.abs(clientStartTime - currentClientStart)

        // Only correct if drift > 2 seconds to avoid micro-jitter
        if (drift > 2000) {
          console.log(`[TimeSync] Drift correction: ${drift}ms, resyncing startTime`)

          store.setStream({ startTime: clientStartTime })
        }
      }
    )

    // Helper to sync DJ queue from schema state into boothStore
    const syncDJQueueFromSchema = () => {
      const rs = this.room?.state as any
      if (!rs) return

      const dq = rs.djQueue
      const entries: import('../stores/boothStore').DJQueueEntry[] = dq
        ? Array.from(dq as Iterable<any>).map((e: any) => ({
            sessionId: e.sessionId as string,
            name: e.name as string,
            position: (e.queuePosition ?? 0) as number,
            slotIndex: (e.slotIndex ?? 0) as number,
          }))
        : []

      const booth = useBoothStore.getState()
      booth.setDJQueue(entries, rs.currentDjSessionId ?? null)

      const myId = this.room?.sessionId
      booth.setIsInQueue(entries.some((e) => e.sessionId === myId))
    }

    // Schema callbacks — sole mechanism for DJ queue sync.
    // Fires on late-join (initial state delivery) AND on every live mutation
    // (join/leave/skip/rotation). No separate message handler needed.
    try {
      const djQueueProxy = stateProxy.djQueue
      djQueueProxy.onAdd(() => syncDJQueueFromSchema())
      djQueueProxy.onRemove(() => syncDJQueueFromSchema())
      stateProxy.listen('currentDjSessionId', () => syncDJQueueFromSchema())
    } catch (err) {
      console.warn('[network] Schema callbacks for djQueue failed:', err)
    }

    // Late-join: sync music state AFTER TimeSync is ready (correct seek offset)
    if (this._timeSync) {
      this._timeSync.onReady(() => {
        const rs = this.room?.state as any
        const ms = rs?.musicStream
        if (!ms || ms.status !== 'playing' || !ms.currentLink || ms.isAmbient) return

        // Skip if START_MUSIC_STREAM message already set this stream
        const store = useMusicStore.getState()
        if (store.stream.isPlaying && store.stream.streamId === (ms.streamId ?? 0)) return

        const clientStartTime = this._timeSync!.toClientTime(ms.startTime ?? 0)

        store.setStream({
          currentLink: ms.currentLink,
          currentTitle: ms.currentTitle ?? null,
          currentDjName: ms.currentDj?.name ?? null,
          startTime: clientStartTime,
          duration: ms.duration ?? 0,
          isPlaying: true,
          streamId: ms.streamId ?? 0,
        })
      })
    }

    // Per-player queue playlist updates
    this.room.onMessage(Message.ROOM_QUEUE_PLAYLIST_UPDATED, (payload: { items: any[] }) => {
      useBoothStore.getState().setQueuePlaylist(
        payload.items.map((item) => ({
          id: item.id,
          title: item.title,
          link: item.link,
          duration: item.duration ?? 0,
          played: item.played ?? false,
        }))
      )
    })

    // Trampoline jump from other players
    this.room.onMessage(Message.PLAYER_JUMP, (data: { sessionId: string }) => {
      if (!data.sessionId) return

      triggerRemoteJump(data.sessionId)

      // Create the floor ripple immediately using the player's current store position.
      // This avoids timing issues where the PlayerEntity's useFrame hasn't run yet.
      const WORLD_SCALE = 0.01
      const TAKEOFF_RIPPLE_AMP = 0.08
      const pos = getPlayerPosition(data.sessionId)

      if (pos) {
        const wx = pos.x * WORLD_SCALE
        const wz = -pos.y * WORLD_SCALE
        addRipple(wx, wz, TAKEOFF_RIPPLE_AMP)
      }
    })

    // Reconnection: connection dropped unexpectedly
    this.room.onDrop((code: number, reason?: string) => {
      console.log(`[network] Connection dropped! code=${code} reason=${reason}`)
      useGameStore.getState().setConnectionStatus('reconnecting')
    })

    // Reconnection: successfully reconnected
    this.room.onReconnect(() => {
      console.log('[network] Reconnected successfully!')
      useGameStore.getState().setConnectionStatus('connected')

      // Re-sync TimeSync after reconnection
      this._timeSync?.start()
    })

    // Room leave — permanent (either consented or failed to reconnect)
    this.room.onLeave((code: number) => {
      console.log('[network] Left room, code:', code)

      useGameStore.getState().setConnectionStatus('disconnected')
      useMusicStore.getState().clearStream()
      useBoothStore.getState().setBoothConnected(false)
      useBoothStore.getState().setIsInQueue(false)
    })
  }

  // Send chat message
  sendChat(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content })

    if (this.room?.sessionId) {
      const myName =
        useGameStore.getState().players.get(this.room.sessionId)?.name ?? this.room.sessionId

      // Add to chat panel immediately
      useChatStore.getState().addMessage({
        id: crypto.randomUUID(),
        author: myName,
        content,
        createdAt: Date.now(),
      })

      // Show local player's own bubble immediately
      useChatStore.getState().setBubble(this.room.sessionId, content)
    }
  }

  // Send position update (throttled)
  sendPosition(x: number, y: number, anim: string) {
    if (this.moveThrottleTimer) return

    this.room?.send(Message.UPDATE_PLAYER_ACTION, { x, y, anim })

    this.moveThrottleTimer = setTimeout(() => {
      this.moveThrottleTimer = null
    }, 50) // 20 updates/sec max
  }

  // Send ready to connect
  sendReady() {
    this.room?.send(Message.READY_TO_CONNECT, {})
  }

  // DJ booth
  connectToBooth(boothIndex: number) {
    this.room?.send(Message.CONNECT_TO_MUSIC_BOOTH, { visitorIndex: boothIndex })
    useBoothStore.getState().setBoothConnected(true, boothIndex)
  }

  disconnectFromBooth() {
    this.room?.send(Message.DISCONNECT_FROM_MUSIC_BOOTH, {})
    useBoothStore.getState().setBoothConnected(false)
  }

  // DJ queue
  joinDJQueue(slotIndex: number = 0) {
    this.room?.send(Message.DJ_QUEUE_JOIN, { slotIndex })
  }

  leaveDJQueue() {
    this.room?.send(Message.DJ_QUEUE_LEAVE, {})
  }

  djPlay() {
    this.room?.send(Message.DJ_PLAY, {})
  }

  djStop() {
    this.room?.send(Message.DJ_STOP, {})
  }

  djSkipTurn() {
    this.room?.send(Message.DJ_SKIP_TURN, {})
  }

  djTurnComplete() {
    this.room?.send(Message.DJ_TURN_COMPLETE, {})
  }

  // Trampoline jump
  sendJump() {
    this.room?.send(Message.PLAYER_JUMP, {})
  }

  // Room queue playlist (per-player DJ queue tracks)
  addToQueuePlaylist(title: string, link: string, duration: number) {
    this.room?.send(Message.ROOM_QUEUE_PLAYLIST_ADD, { title, link, duration })
  }

  removeFromQueuePlaylist(id: string) {
    this.room?.send(Message.ROOM_QUEUE_PLAYLIST_REMOVE, { id })
  }

  reorderQueuePlaylist(fromIndex: number, toIndex: number) {
    this.room?.send(Message.ROOM_QUEUE_PLAYLIST_REORDER, { fromIndex, toIndex })
  }

  // YouTube search (via server)
  async searchYouTube(query: string): Promise<any[]> {
    const res = await fetch(`${this.httpBaseUrl}/youtube/${encodeURIComponent(query)}`)
    if (!res.ok) throw new Error('Search failed')

    const data = await res.json()

    // Go service returns { items: [...] }, legacy scraper returns raw array
    return Array.isArray(data) ? data : (data.items ?? [])
  }

  // Resolve direct video URL for WebGL texture rendering
  async resolveYouTube(videoId: string): Promise<{ url: string; expiresAtMs: number | null }> {
    const res = await fetch(`${this.httpBaseUrl}/youtube/resolve/${videoId}`)
    if (!res.ok) throw new Error('Resolve failed')

    return res.json()
  }

  // Get proxied video URL (same-origin, avoids CORS issues with googlevideo)
  getYouTubeProxyUrl(videoId: string): string {
    return `${this.httpBaseUrl}/youtube/proxy/${videoId}`
  }

  get sessionId(): string | undefined {
    return this.room?.sessionId
  }

  get timeSync(): TimeSync | null {
    return this._timeSync
  }

  disconnect() {
    this._timeSync?.stop()
    this._timeSync = null
    this.room?.leave()
    this.room = null
  }
}

// Singleton
let _network: NetworkManager | null = null

export function getNetwork(): NetworkManager {
  if (!_network) {
    _network = new NetworkManager()
  }

  return _network
}
