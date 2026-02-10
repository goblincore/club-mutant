import { Client, Room, getStateCallbacks } from '@colyseus/sdk'
import type { IOfficeState, IPlayer } from '@club-mutant/types/IOfficeState'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'

import { useGameStore } from '../stores/gameStore'
import { useChatStore } from '../stores/chatStore'

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

  constructor(serverUrl?: string) {
    const url =
      serverUrl ??
      (import.meta.env.VITE_SERVER_URL ||
        (window.location.hostname === 'localhost'
          ? 'ws://localhost:2567'
          : `wss://${window.location.hostname}`))

    this.client = new Client(url)
  }

  async joinPublicRoom(playerName: string): Promise<void> {
    const gameStore = useGameStore.getState()

    try {
      this.room = await this.client.joinOrCreate<IOfficeState>(RoomType.PUBLIC, {
        name: playerName,
        playerId: getOrCreatePlayerId(),
      })

      gameStore.setConnected(true, this.room.sessionId)
      this.wireRoomListeners()

      console.log('[network] Joined public room, sessionId:', this.room.sessionId)
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

    console.log('[network] Wiring room listeners...', {
      stateProxy: typeof stateProxy,
      playersProxy: typeof playersProxy,
      hasOnAdd: typeof playersProxy?.onAdd,
    })

    // Player add/remove/change
    playersProxy.onAdd((player: IPlayer, sessionId: string) => {
      console.log(
        '[network] Player added:',
        sessionId,
        player.name,
        `pos(${player.x}, ${player.y})`
      )

      const gameStore = useGameStore.getState()
      const chatStore = useChatStore.getState()

      gameStore.addPlayer(sessionId, {
        sessionId,
        name: player.name,
        x: player.x,
        y: player.y,
        textureId: player.textureId,
        animId: player.animId,
        scale: player.scale,
      })

      const playerProxy = $(player) as any

      playerProxy.listen('x', (value: number) => {
        useGameStore.getState().updatePlayer(sessionId, { x: value })
      })

      playerProxy.listen('y', (value: number) => {
        useGameStore.getState().updatePlayer(sessionId, { y: value })
      })

      playerProxy.listen('name', (value: string) => {
        useGameStore.getState().updatePlayer(sessionId, { name: value })
      })

      playerProxy.listen('animId', (value: number) => {
        useGameStore.getState().updatePlayer(sessionId, { animId: value })
      })

      playerProxy.listen('textureId', (value: number) => {
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

    // Chat messages
    this.room.onMessage(Message.ADD_CHAT_MESSAGE, (data: { clientId: string; content: string }) => {
      const player = useGameStore.getState().players.get(data.clientId)
      const chatStore = useChatStore.getState()

      chatStore.addMessage({
        id: crypto.randomUUID(),
        author: player?.name ?? data.clientId,
        content: data.content,
        createdAt: Date.now(),
      })
    })

    // Room leave
    this.room.onLeave((code: number) => {
      console.log('[network] Left room, code:', code)
      useGameStore.getState().setConnected(false)
    })
  }

  // Send chat message
  sendChat(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content })
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
