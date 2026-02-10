import { Client, Room, getStateCallbacks } from '@colyseus/sdk'
import type { IOfficeState, IPlayer } from '@club-mutant/types/IOfficeState'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'

import { useGameStore } from '../stores/gameStore'
import { useChatStore } from '../stores/chatStore'
import { useMusicStore } from '../stores/musicStore'
import { useBoothStore } from '../stores/boothStore'
import { getDJBoothWorldX, BOOTH_WORLD_Z } from '../scene/Room'

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

      gameStore.setConnected(true, this.room.sessionId)
      this.wireRoomListeners()
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

    // Player add/remove/change
    playersProxy.onAdd((player: IPlayer, sessionId: string) => {
      const gameStore = useGameStore.getState()
      const chatStore = useChatStore.getState()

      const cx = clampPos(player.x)
      const cy = clampPos(player.y)

      console.log(
        `[network] onAdd ${sessionId} textureId=${player.textureId} name=${player.name} pos=(${player.x},${player.y})→(${cx},${cy})`
      )

      // Force local player to spawn at room center (server default 705,500 is for the 2D client)
      const isLocal = sessionId === this.room?.sessionId
      const spawnX = isLocal ? 0 : cx
      const spawnY = isLocal ? 0 : cy

      gameStore.addPlayer(sessionId, {
        sessionId,
        name: player.name,
        x: spawnX,
        y: spawnY,
        textureId: player.textureId,
        animId: player.animId,
        scale: player.scale,
      })

      if (isLocal) {
        gameStore.setLocalPosition(0, 0)
        // Tell the server we're at (0,0) so it doesn't echo back the 2D default
        this.sendPosition(0, 0, 'idle')
      }

      const playerProxy = $(player) as any

      // Only update remote players from server echoes —
      // the local player drives its own position via input.
      const localSessionId = this.room?.sessionId

      playerProxy.listen('x', (value: number) => {
        if (sessionId !== localSessionId) {
          useGameStore.getState().updatePlayer(sessionId, { x: clampPos(value) })
        }
      })

      playerProxy.listen('y', (value: number) => {
        if (sessionId !== localSessionId) {
          useGameStore.getState().updatePlayer(sessionId, { y: clampPos(value) })
        }
      })

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

        useMusicStore.getState().setStream({
          currentLink: ms.currentLink ?? null,
          currentTitle: ms.currentTitle ?? null,
          currentDjName: ms.currentDj?.name ?? null,
          startTime: ms.startTime ?? 0,
          duration: ms.duration ?? 0,
          isPlaying: true,
        })
      }
    )

    this.room.onMessage(Message.STOP_MUSIC_STREAM, () => {
      useMusicStore.getState().clearStream()
    })

    // Sync music state from room on join (late-join)
    const roomState = this.room.state as any
    if (
      roomState.musicStream?.status === 'playing' &&
      roomState.musicStream?.currentLink &&
      !roomState.musicStream?.isAmbient
    ) {
      const ms = roomState.musicStream
      useMusicStore.getState().setStream({
        currentLink: ms.currentLink,
        currentTitle: ms.currentTitle ?? null,
        currentDjName: ms.currentDj?.name ?? null,
        startTime: ms.startTime ?? 0,
        duration: ms.duration ?? 0,
        isPlaying: true,
      })
    }

    // DJ Queue updates
    this.room.onMessage(
      Message.DJ_QUEUE_UPDATED,
      (payload: { djQueue: any[]; currentDjSessionId: string | null }) => {
        const booth = useBoothStore.getState()
        booth.setDJQueue(payload.djQueue, payload.currentDjSessionId)

        const myId = this.room?.sessionId
        const inQueue = payload.djQueue.some((e) => e.sessionId === myId)
        booth.setIsInQueue(inQueue)

        // Reposition all DJs behind the booth based on their queue index
        const WORLD_SCALE = 0.01
        const behindBoothY = -(BOOTH_WORLD_Z - 0.8) / WORLD_SCALE
        const queueCount = payload.djQueue.length
        const gameState = useGameStore.getState()

        for (let i = 0; i < queueCount; i++) {
          const entry = payload.djQueue[i]
          const offsetX = getDJBoothWorldX(i, queueCount)
          const serverX = offsetX / WORLD_SCALE

          if (entry.sessionId === myId) {
            // Reposition local player
            gameState.setLocalPosition(serverX, behindBoothY)

            if (myId) {
              gameState.updatePlayer(myId, { x: serverX, y: behindBoothY })
            }

            this.sendPosition(serverX, behindBoothY, 'idle')
          } else {
            // Reposition remote players
            gameState.updatePlayer(entry.sessionId, { x: serverX, y: behindBoothY })
          }
        }
      }
    )

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

    // Room leave
    this.room.onLeave((code: number) => {
      console.log('[network] Left room, code:', code)
      useGameStore.getState().setConnected(false)
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

  // Room playlist
  addToRoomPlaylist(title: string, link: string, duration: number) {
    this.room?.send(Message.ROOM_PLAYLIST_ADD, { title, link, duration })
  }

  removeFromRoomPlaylist(id: string) {
    this.room?.send(Message.ROOM_PLAYLIST_REMOVE, { id })
  }

  skipRoomPlaylist() {
    this.room?.send(Message.ROOM_PLAYLIST_SKIP, {})
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
  joinDJQueue() {
    this.room?.send(Message.DJ_QUEUE_JOIN, {})
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

  // Room queue playlist (per-player DJ queue tracks)
  addToQueuePlaylist(title: string, link: string, duration: number) {
    this.room?.send(Message.ROOM_QUEUE_PLAYLIST_ADD, { title, link, duration })
  }

  removeFromQueuePlaylist(id: string) {
    this.room?.send(Message.ROOM_QUEUE_PLAYLIST_REMOVE, { id })
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

  disconnect() {
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
