import { Client, Room, getStateCallbacks } from '@colyseus/sdk'
import type { IOfficeState, IPlayer } from '@club-mutant/types/IOfficeState'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'
import type { RoomListEntry } from '../stores/gameStore'

import { useGameStore, setPlayerPosition, getPlayerPosition } from '../stores/gameStore'
import { useChatStore } from '../stores/chatStore'
import { useMusicStore } from '../stores/musicStore'
import { useBoothStore } from '../stores/boothStore'
import { useJukeboxStore } from '../stores/jukeboxStore'
import type { JukeboxItemDto } from '@club-mutant/types/Dtos'
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
  private _myTextureId: number = 0

  constructor(serverUrl?: string) {
    const url =
      serverUrl ??
      (import.meta.env.VITE_WS_ENDPOINT ||
        (window.location.hostname === 'localhost'
          ? 'ws://localhost:2567'
          : `wss://${window.location.hostname}`))

    this.client = new Client(url)
    this.httpBaseUrl = url.replace(/^ws/, 'http')

    // Connect to Colyseus LobbyRoom for room discovery (non-blocking)
    this.joinLobbyRoom()
  }

  /**
   * Connect to Colyseus' built-in LobbyRoom for real-time room discovery.
   * Filters to only CUSTOM rooms (the public room also appears but we skip it).
   * Retries with exponential backoff on failure.
   */
  private async joinLobbyRoom(maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.lobby = await this.client.joinOrCreate(RoomType.LOBBY)

        this.lobby.onMessage('rooms', (rooms: any[]) => {
          const listedRooms: RoomListEntry[] = rooms
            .filter((r) => r.name === RoomType.CUSTOM || r.name === RoomType.JUKEBOX)
            .map((r) => ({
              roomId: r.roomId,
              name: r.metadata?.name ?? 'Unnamed',
              description: r.metadata?.description ?? '',
              clients: r.clients ?? 0,
              hasPassword: r.metadata?.hasPassword ?? false,
              musicMode: r.metadata?.musicMode ?? null,
            }))

          useGameStore.getState().setAvailableRooms(listedRooms)
        })

        this.lobby.onMessage('+', ([roomId, room]: [string, any]) => {
          if (room.name !== RoomType.CUSTOM && room.name !== RoomType.JUKEBOX) return

          useGameStore.getState().addOrUpdateRoom(roomId, {
            roomId,
            name: room.metadata?.name ?? 'Unnamed',
            description: room.metadata?.description ?? '',
            clients: room.clients ?? 0,
            hasPassword: room.metadata?.hasPassword ?? false,
            musicMode: room.metadata?.musicMode ?? null,
          })
        })

        this.lobby.onMessage('-', (roomId: string) => {
          useGameStore.getState().removeRoom(roomId)
        })

        useGameStore.getState().setLobbyJoined(true)
        console.log('[network] Joined lobby room for room discovery')
        return
      } catch (err) {
        console.warn(`[network] Lobby room attempt ${attempt + 1} failed:`, err)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)))
        }
      }
    }
    console.warn('[network] Failed to join lobby room after all retries')
  }

  /**
   * Shared room setup: reconnection config, TimeSync, listeners, mark connected.
   * Called by joinPublicRoom, createCustomRoom, joinCustomById after room is joined.
   */
  private setupRoom(textureId: number) {
    if (!this.room) return

    this._myTextureId = textureId

    // Configure reconnection: max 10 retries, up to 8s delay
    this.room.reconnection.maxRetries = 10
    this.room.reconnection.maxDelay = 8000

    this._timeSync = new TimeSync(this.room as Room)
    this._timeSync.start()

    this.wireRoomListeners()

    // Only mark connected AFTER listeners are wired — prevents half-initialized state
    useGameStore.getState().setConnected(true, this.room.sessionId)
  }

  async joinPublicRoom(playerName: string, textureId?: number): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate<IOfficeState>(RoomType.PUBLIC, {
        name: playerName,
        playerId: getOrCreatePlayerId(),
        ...(textureId != null ? { textureId } : {}),
      })

      const gs = useGameStore.getState()
      gs.setRoomType('public')
      gs.setMusicMode('djqueue')
      this.setupRoom(textureId ?? 0)
    } catch (err) {
      console.error('[network] Failed to join public room:', err)
      throw err
    }
  }

  async joinMyRoom(playerName: string, textureId: number): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate<IOfficeState>(RoomType.MYROOM, {
        name: playerName,
        playerId: getOrCreatePlayerId(),
        textureId,
      })

      const gs = useGameStore.getState()
      gs.setRoomType('myroom')
      gs.setMusicMode('personal')
      this.setupRoom(textureId)
    } catch (err) {
      console.error('[network] Failed to join MyRoom:', err)
      throw err
    }
  }

  async joinJukeboxRoom(
    roomData: { name: string; description: string; password: string | null },
    playerName: string,
    textureId: number
  ): Promise<void> {
    try {
      this.room = await this.client.create<IOfficeState>(RoomType.JUKEBOX, {
        name: roomData.name,
        description: roomData.description,
        password: roomData.password,
        autoDispose: true,
        musicMode: 'jukebox',
        playerId: getOrCreatePlayerId(),
        textureId,
      })

      const gs = useGameStore.getState()
      gs.setRoomType('jukebox')
      gs.setMusicMode('jukebox')
      this.setupRoom(textureId)
    } catch (err) {
      console.error('[network] Failed to create jukebox room:', err)
      throw err
    }
  }

  async createCustomRoom(
    roomData: { name: string; description: string; password: string | null; musicMode?: string },
    playerName: string,
    textureId: number
  ): Promise<void> {
    try {
      const musicMode = roomData.musicMode ?? 'djqueue'

      this.room = await this.client.create<IOfficeState>(RoomType.CUSTOM, {
        name: roomData.name,
        description: roomData.description,
        password: roomData.password,
        autoDispose: true,
        musicMode,
        playerId: getOrCreatePlayerId(),
        textureId,
      })

      const gs = useGameStore.getState()
      gs.setRoomType('custom')
      gs.setMusicMode(musicMode as any)
      this.setupRoom(textureId)
    } catch (err) {
      console.error('[network] Failed to create custom room:', err)
      throw err
    }
  }

  async joinCustomById(
    roomId: string,
    password: string | null,
    playerName: string,
    textureId: number
  ): Promise<void> {
    try {
      this.room = await this.client.joinById<IOfficeState>(roomId, {
        password,
        playerId: getOrCreatePlayerId(),
        textureId,
      })

      // Determine musicMode from lobby's room listing (available before join)
      const gs = useGameStore.getState()
      const roomEntry = gs.availableRooms.find((r) => r.roomId === roomId)
      const musicMode = (roomEntry?.musicMode as any) ?? 'djqueue'

      gs.setRoomType('custom')
      gs.setMusicMode(musicMode)
      this.setupRoom(textureId)
    } catch (err) {
      console.error('[network] Failed to join custom room:', err)
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
        isNpc: player.isNpc ?? false,
        npcCharacterPath: player.npcCharacterPath ?? '',
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

      // Don't show "joined" message for NPC players — they're always present
      if (player.name && !player.isNpc) {
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

      // Don't show "left" message for NPC players
      if (!existing?.isNpc) {
        chatStore.addMessage({
          id: crypto.randomUUID(),
          author: 'system',
          content: `${name} left`,
          createdAt: Date.now(),
        })
      }
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

    // Jukebox playlist schema callbacks — syncs shared playlist to jukeboxStore.
    // Fires on late-join (initial state) and every live mutation (add/remove/splice).
    try {
      const jukeboxPlaylistProxy = stateProxy.jukeboxPlaylist

      const syncJukeboxPlaylist = () => {
        const rs = this.room?.state as any
        if (!rs?.jukeboxPlaylist) return

        const items: JukeboxItemDto[] = Array.from(
          rs.jukeboxPlaylist as Iterable<any>
        ).map((item: any) => ({
          id: item.id as string,
          title: item.title as string,
          link: item.link as string,
          duration: (item.duration ?? 0) as number,
          addedBySessionId: item.addedBySessionId as string,
          addedByName: item.addedByName as string,
          addedAtMs: (item.addedAtMs ?? 0) as number,
        }))

        useJukeboxStore.getState().setPlaylist(items)
      }

      jukeboxPlaylistProxy.onAdd(() => syncJukeboxPlaylist())
      jukeboxPlaylistProxy.onRemove(() => syncJukeboxPlaylist())
    } catch (err) {
      console.warn('[network] Schema callbacks for jukeboxPlaylist failed:', err)
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
      useJukeboxStore.getState().clear()
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
  // Includes textureId so server can correctly assign character for custom rooms.
  // The anim param is kept for API compat but not sent — server uses textureId.
  sendPosition(x: number, y: number, _anim: string) {
    if (this.moveThrottleTimer) return

    this.room?.send(Message.UPDATE_PLAYER_ACTION, {
      x,
      y,
      textureId: this._myTextureId,
    })

    this.moveThrottleTimer = setTimeout(() => {
      this.moveThrottleTimer = null
    }, 100) // 10 updates/sec max (matches server patchRate=100ms)
  }

  // Send ready to connect
  sendReady() {
    this.room?.send(Message.READY_TO_CONNECT, {})
  }

  // Send player name (needed for custom rooms where server doesn't auto-set name)
  sendPlayerName(name: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name })
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
    this.room?.send(Message.ROOM_QUEUE_PLAYLIST_REMOVE, { itemId: id })
  }

  reorderQueuePlaylist(fromIndex: number, toIndex: number) {
    this.room?.send(Message.ROOM_QUEUE_PLAYLIST_REORDER, { fromIndex, toIndex })
  }

  // Jukebox (shared room playlist — jukebox + personal music modes)
  addToJukebox(title: string, link: string, duration: number) {
    this.room?.send(Message.JUKEBOX_ADD, { title, link, duration })
  }

  removeFromJukebox(itemId: string) {
    this.room?.send(Message.JUKEBOX_REMOVE, { itemId })
  }

  jukeboxPlay() {
    this.room?.send(Message.JUKEBOX_PLAY, {})
  }

  jukeboxStop() {
    this.room?.send(Message.JUKEBOX_STOP, {})
  }

  jukeboxSkip() {
    this.room?.send(Message.JUKEBOX_SKIP, {})
  }

  jukeboxTrackComplete(streamId?: number) {
    this.room?.send(Message.JUKEBOX_TRACK_COMPLETE, { streamId })
  }

  // Dream mode
  sendDreamSleep() {
    this.room?.send(Message.DREAM_SLEEP, {})
  }

  sendDreamWake() {
    this.room?.send(Message.DREAM_WAKE, {})
  }

  sendDreamCollect(collectibleId: string) {
    this.room?.send(Message.DREAM_COLLECT, { collectibleId })
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
