import { Client, Room } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'
import type { RoomListEntry } from '../stores/gameStore'
import type { PrecomputedAnalysis } from '../hooks/useAudioAnalyser'
import { useAuthStore } from '../stores/authStore'
import { getValidToken } from './nakamaClient'

import { useGameStore } from '../stores/gameStore'
import { useChatStore } from '../stores/chatStore'
import { useBoothStore } from '../stores/boothStore'
import { TimeSync } from './TimeSync'
import { wirePlayerHandlers } from './messages/playerHandlers'
import { wireChatHandlers } from './messages/chatHandlers'
import { wireMusicHandlers } from './messages/musicHandlers'
import { wireDJQueueHandlers } from './messages/djQueueHandlers'
import { wireJukeboxHandlers } from './messages/jukeboxHandlers'
import { wireJumpHandlers } from './messages/jumpHandlers'
import { wireLifecycleHandlers } from './messages/lifecycleHandlers'

const PLAYER_ID_KEY = 'club-mutant-3d:player-id'

// -- Session lock: prevent duplicate in-game tabs -------------------------
const SESSION_LOCK_KEY = 'club-mutant:session-lock'
const SESSION_LOCK_TTL = 30_000 // 30 seconds

export function isSessionActive(): boolean {
  const raw = localStorage.getItem(SESSION_LOCK_KEY)
  if (!raw) return false
  try {
    const { ts } = JSON.parse(raw) as { ts: number }
    return Date.now() - ts < SESSION_LOCK_TTL
  } catch {
    return false
  }
}
// -------------------------------------------------------------------------

/** Race a promise against a timeout. Rejects with a descriptive error if the timeout fires first. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY)

  if (!id) {
    id = crypto.randomUUID().slice(0, 8)
    localStorage.setItem(PLAYER_ID_KEY, id)
  }

  return id
}

/** Parse a duration string like "2:21" or "1:03:45" into total seconds. Returns 0 for unparseable values. */
function parseDurationToSeconds(dur: string): number {
  if (!dur || dur === 'LIVE') return 0
  const parts = dur.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

export class NetworkManager {
  private client: Client
  private room: Room<RoomState> | null = null
  private lobby: Room | null = null
  private _lobbyPromise: Promise<void> | null = null
  private moveThrottleTimer: ReturnType<typeof setTimeout> | null = null
  private httpBaseUrl: string
  private youtubeBaseUrl: string
  private _timeSync: TimeSync | null = null
  private _myTextureId: number = 0
  private _tabId: string = crypto.randomUUID()
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private _onUnload = () => this.releaseSessionLock()

  constructor(serverUrl?: string) {
    const url =
      serverUrl ??
      (import.meta.env.VITE_WS_ENDPOINT ||
        (window.location.hostname === 'localhost'
          ? 'ws://localhost:2567'
          : `wss://${window.location.hostname}`))

    this.client = new Client(url)
    this.httpBaseUrl = url.replace(/^ws/, 'http')
    this.youtubeBaseUrl =
      import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
      (window.location.hostname === 'localhost' ? 'http://localhost:8081' : `${this.httpBaseUrl}/youtube`)
  }

  /**
   * Build auth options to include in Colyseus room join/create calls.
   * Returns { nakamaToken } if authenticated, empty object for guests.
   */
  private async getAuthOptions(): Promise<{ nakamaToken?: string }> {
    const authState = useAuthStore.getState()
    if (!authState.isAuthenticated) return {}

    const token = await getValidToken()
    if (!token) return {}

    return { nakamaToken: token }
  }

  /**
   * Connect to Colyseus' built-in LobbyRoom for real-time room discovery.
   * Filters to only CUSTOM rooms (the public room also appears but we skip it).
   * Retries with exponential backoff on failure.
   */
  public ensureLobbyJoined(maxRetries = 3, baseDelay = 1000): Promise<void> {
    if (this.lobby) return Promise.resolve()
    // Deduplicate concurrent callers — share a single in-flight promise
    if (this._lobbyPromise) return this._lobbyPromise
    this._lobbyPromise = this._doLobbyJoin(maxRetries, baseDelay).finally(() => {
      this._lobbyPromise = null
    })
    return this._lobbyPromise
  }

  private async _doLobbyJoin(maxRetries: number, baseDelay: number) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeout = attempt === 0 ? 15000 : 12000
        this.lobby = await withTimeout(
          this.client.joinOrCreate(RoomType.LOBBY),
          timeout,
          'Lobby join'
        )

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

  private claimSessionLock(): void {
    const write = () =>
      localStorage.setItem(SESSION_LOCK_KEY, JSON.stringify({ tabId: this._tabId, ts: Date.now() }))
    write()
    if (!this._heartbeatInterval) {
      this._heartbeatInterval = setInterval(write, 10_000)
    }
    window.addEventListener('beforeunload', this._onUnload)
  }

  private releaseSessionLock(): void {
    const raw = localStorage.getItem(SESSION_LOCK_KEY)
    if (raw) {
      try {
        const { tabId } = JSON.parse(raw) as { tabId: string }
        if (tabId === this._tabId) localStorage.removeItem(SESSION_LOCK_KEY)
      } catch { /* ignore */ }
    }
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval)
      this._heartbeatInterval = null
    }
    window.removeEventListener('beforeunload', this._onUnload)
  }

  private checkNoActiveSession(): void {
    if (useAuthStore.getState().isAuthenticated && isSessionActive()) {
      throw new Error('You already have an active session in another tab. Please close it first.')
    }
  }

  /**
   * Shared room setup: reconnection config, TimeSync, listeners, mark connected.
   * Called by joinPublicRoom, createCustomRoom, joinCustomById after room is joined.
   */
  private setupRoom(textureId: number) {
    if (!this.room) return

    this.claimSessionLock()
    this._myTextureId = textureId

    // Configure reconnection: max 10 retries, up to 8s delay
    this.room.reconnection.maxRetries = 10
    this.room.reconnection.maxDelay = 8000

    this._timeSync = new TimeSync(this.room as Room)
    this._timeSync.start()

    this.wireRoomListeners()

    // Only mark connected AFTER listeners are wired — prevents half-initialized state
    useGameStore.getState().setConnected(true, this.room.sessionId)

    // Request chat history (lazy load instead of schema sync)
    this.requestChatHistory()
  }

  async joinPublicRoom(playerName: string, textureId?: number): Promise<void> {
    try {
      this.checkNoActiveSession()
      const authOpts = await this.getAuthOptions()
      this.room = await withTimeout(
        this.client.joinOrCreate<RoomState>(RoomType.PUBLIC, {
          name: playerName,
          playerId: getOrCreatePlayerId(),
          spawnX: 0,
          spawnY: 0,
          ...(textureId != null ? { textureId } : {}),
          ...authOpts,
        }),
        15000,
        'Join public room'
      )

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
      this.checkNoActiveSession()
      const authOpts = await this.getAuthOptions()
      this.room = await withTimeout(
        this.client.joinOrCreate<RoomState>(RoomType.MYROOM, {
          name: playerName,
          playerId: getOrCreatePlayerId(),
          textureId,
          spawnX: 0,
          spawnY: 0,
          ...authOpts,
        }),
        15000,
        'Join MyRoom'
      )

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
      this.checkNoActiveSession()
      const authOpts = await this.getAuthOptions()
      this.room = await withTimeout(
        this.client.create<RoomState>(RoomType.JUKEBOX, {
          name: roomData.name,
          description: roomData.description,
          password: roomData.password,
          autoDispose: true,
          musicMode: 'jukebox',
          playerId: getOrCreatePlayerId(),
          textureId,
          spawnX: 0,
          spawnY: 0,
          ...authOpts,
        }),
        15000,
        'Create jukebox room'
      )

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
    roomData: {
      name: string
      description: string
      password: string | null
      musicMode?: string
      npcDj?: { mode: 'fallback' | 'rotation' }
    },
    playerName: string,
    textureId: number
  ): Promise<void> {
    try {
      this.checkNoActiveSession()
      const musicMode = roomData.musicMode ?? 'djqueue'
      const authOpts = await this.getAuthOptions()

      this.room = await withTimeout(
        this.client.create<RoomState>(RoomType.CUSTOM, {
          name: roomData.name,
          description: roomData.description,
          password: roomData.password,
          autoDispose: true,
          musicMode,
          npcDj: roomData.npcDj,
          playerId: getOrCreatePlayerId(),
          textureId,
          spawnX: 0,
          spawnY: 0,
          ...authOpts,
        }),
        15000,
        'Create custom room'
      )

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
      this.checkNoActiveSession()
      const authOpts = await this.getAuthOptions()
      this.room = await withTimeout(
        this.client.joinById<RoomState>(roomId, {
          password,
          playerId: getOrCreatePlayerId(),
          textureId,
          spawnX: 0,
          spawnY: 0,
          ...authOpts,
        }),
        15000,
        'Join custom room'
      )

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

    wirePlayerHandlers(this.room, () => {
      // Tell the server we're at (0,0) so it doesn't echo back the 2D default
      this.sendPosition(0, 0, 'idle')
    })
    wireChatHandlers(this.room)
    wireMusicHandlers(this.room, this._timeSync)
    wireDJQueueHandlers(this.room)
    wireJukeboxHandlers(this.room)
    wireJumpHandlers(this.room)
    wireLifecycleHandlers(this.room, this._timeSync, () => this.releaseSessionLock())
  }


  // Send chat message (with optional image URL from CDN upload)
  sendChat(content: string, imageUrl?: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content, imageUrl })

    if (this.room?.sessionId) {
      const myName =
        useGameStore.getState().players.get(this.room.sessionId)?.name ?? this.room.sessionId

      // Add to chat panel immediately
      useChatStore.getState().addMessage({
        id: crypto.randomUUID(),
        author: myName,
        content,
        imageUrl,
        createdAt: Date.now(),
      })

      // Show local player's own bubble immediately
      useChatStore.getState().setBubble(this.room.sessionId, content, imageUrl)
    }
  }

  // Request chat history from server (called after room join)
  requestChatHistory() {
    this.room?.send(Message.CHAT_HISTORY)
  }

  // Upload image to CDN, returns the CDN URL
  async uploadImage(file: File): Promise<string> {
    const uploadUrl = import.meta.env.VITE_IMAGE_UPLOAD_URL || 'http://localhost:4001'
    const sessionId = this.room?.sessionId
    if (!sessionId) throw new Error('Not connected to room')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('sessionId', sessionId)

    const res = await fetch(`${uploadUrl}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }))
      throw new Error(err.error || `Upload failed: ${res.status}`)
    }

    const data = await res.json()
    return data.url
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

  /** Keep the fallback NPC DJ off the decks (true) or summon it back (false). */
  setNpcDjStandby(standby: boolean) {
    this.room?.send(Message.NPC_DJ_SET_STANDBY, { standby })
  }

  /** Room creator only (custom djqueue rooms): live-toggle the NPC DJ. */
  setNpcDjMode(mode: 'off' | 'fallback' | 'rotation') {
    this.room?.send(Message.NPC_DJ_SET_MODE, { mode })
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

  // streamId lets the server reject stale/duplicate completions (audit F4)
  djTurnComplete(streamId?: number) {
    this.room?.send(Message.DJ_TURN_COMPLETE, { streamId })
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

  // Jukebox exclusive access
  jukeboxConnect() {
    this.room?.send(Message.JUKEBOX_CONNECT, {})
  }

  jukeboxDisconnect() {
    this.room?.send(Message.JUKEBOX_DISCONNECT, {})
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

  // YouTube search (calls Go service directly)
  async searchYouTube(query: string): Promise<any[]> {
    const res = await fetch(`${this.youtubeBaseUrl}/search?q=${encodeURIComponent(query)}&limit=24`)
    if (!res.ok) throw new Error('Search failed')

    const data = await res.json()
    const items = data.items ?? []

    // Go service returns duration as formatted string ("2:21", "1:03:45", "LIVE").
    // Parse to seconds so the server schema (which expects a number) doesn't reject it.
    for (const item of items) {
      if (typeof item.duration === 'string') {
        item.duration = parseDurationToSeconds(item.duration)
      }
    }

    return items
  }

  // Fetch a public YouTube playlist via the Go service (InnerTube browse).
  // Anonymous sessions cap out around 200 items; `truncated` signals a
  // partial fetch and `declaredCount` (0 = unknown) the playlist's real size.
  async fetchYouTubePlaylist(playlistId: string): Promise<{
    playlistId: string
    title: string
    items: { videoId: string; title: string; duration: number; thumbnail?: string }[]
    itemCount: number
    declaredCount: number
    truncated: boolean
  }> {
    const res = await fetch(`${this.youtubeBaseUrl}/playlist/${encodeURIComponent(playlistId)}`)
    if (res.status === 404) throw new Error('Playlist not found (is it public?)')
    if (res.status === 400) throw new Error('This playlist type cannot be imported')
    if (!res.ok) throw new Error(`Playlist fetch failed (${res.status})`)

    const data = await res.json()
    data.items = data.items ?? []
    return data
  }

  // Resolve direct video URL for WebGL texture rendering
  async resolveYouTube(videoId: string): Promise<{ url: string; expiresAtMs: number | null }> {
    const res = await fetch(`${this.youtubeBaseUrl}/resolve/${videoId}`)
    if (!res.ok) throw new Error('Resolve failed')

    return res.json()
  }

  // Get proxied video URL (via Go YouTube service)
  getYouTubeProxyUrl(videoId: string): string {
    return `${this.youtubeBaseUrl}/proxy/${videoId}`
  }

  // Get proxied audio-only URL for frequency analysis (48kbps AAC, ~360KB/min)
  getYouTubeAudioProxyUrl(videoId: string): string {
    return `${this.youtubeBaseUrl}/proxy/${videoId}?audioOnly=true&videoOnly=false`
  }

  // Fetch the precomputed FFT analysis timeline for a video. Returns null on
  // ANY non-200 (202 pending / 404 unavailable / network error) so callers
  // fall back to the live audio analyser path.
  async fetchYouTubeAnalysis(videoId: string): Promise<PrecomputedAnalysis | null> {
    try {
      const res = await fetch(`${this.youtubeBaseUrl}/analysis/${videoId}`)
      if (!res.ok) return null
      const data = (await res.json()) as PrecomputedAnalysis
      return data
    } catch {
      return null
    }
  }

  get sessionId(): string | undefined {
    return this.room?.sessionId
  }

  getRoomId(): string | null {
    return this.room?.roomId ?? null
  }

  get timeSync(): TimeSync | null {
    return this._timeSync
  }

  disconnect() {
    this._timeSync?.stop()
    this._timeSync = null
    this.releaseSessionLock()
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
