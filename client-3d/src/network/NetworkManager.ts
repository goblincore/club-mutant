import { Client, Room, getStateCallbacks } from '@colyseus/sdk'
import type { IOfficeState, IPlayer, IRoomPlaylistItem } from '@club-mutant/types/IOfficeState'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'

import { useGameStore } from '../stores/gameStore'
import { useChatStore } from '../stores/chatStore'
import { useMusicStore } from '../stores/musicStore'

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
    const url = serverUrl ?? (
      import.meta.env.VITE_SERVER_URL ||
      (window.location.hostname === 'localhost'
        ? 'ws://localhost:2567'
        : `wss://${window.location.hostname}`)
    )

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

    const gameStore = useGameStore.getState()
    const chatStore = useChatStore.getState()
    const musicStore = useMusicStore.getState()

    const $ = getStateCallbacks(this.room)

    // Player add/remove/change
    $(this.room.state.players).onAdd((player: IPlayer, sessionId: string) => {
      gameStore.addPlayer(sessionId, {
        sessionId,
        name: player.name,
        x: player.x,
        y: player.y,
        textureId: player.textureId,
        animId: player.animId,
        scale: player.scale,
      })

      $(player).onChange(() => {
        gameStore.updatePlayer(sessionId, {
          name: player.name,
          x: player.x,
          y: player.y,
          textureId: player.textureId,
          animId: player.animId,
          scale: player.scale,
        })
      })

      chatStore.addMessage({
        id: crypto.randomUUID(),
        author: 'system',
        content: `${player.name} joined`,
        createdAt: Date.now(),
      })
    })

    $(this.room.state.players).onRemove((_player: IPlayer, sessionId: string) => {
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

      chatStore.addMessage({
        id: crypto.randomUUID(),
        author: player?.name ?? data.clientId,
        content: data.content,
        createdAt: Date.now(),
      })
    })

    // Music stream updates
    $(this.room.state.musicStream).onChange(() => {
      const ms = this.room!.state.musicStream

      musicStore.setStream({
        currentLink: ms.currentLink,
        currentTitle: ms.currentTitle,
        currentDjName: ms.currentDj?.name ?? null,
        startTime: ms.startTime,
        duration: ms.duration,
        isPlaying: ms.currentLink !== null,
        videoBackgroundEnabled: ms.videoBackgroundEnabled,
      })
    })

    // Room playlist
    $(this.room.state.roomPlaylist).onAdd((item: IRoomPlaylistItem) => {
      musicStore.addRoomPlaylistItem({
        id: item.id,
        title: item.title,
        link: item.link,
        duration: item.duration,
        addedAtMs: item.addedAtMs,
        addedBySessionId: item.addedBySessionId,
      })
    })

    $(this.room.state.roomPlaylist).onRemove((item: IRoomPlaylistItem) => {
      musicStore.removeRoomPlaylistItem(item.id)
    })

    // Room leave
    this.room.onLeave((code: number) => {
      console.log('[network] Left room, code:', code)
      gameStore.setConnected(false)
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
