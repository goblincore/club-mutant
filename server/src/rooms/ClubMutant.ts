import bcrypt from 'bcrypt'
import { Room, Client, ServerError, CloseCode } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { v4 as uuidv4 } from 'uuid'

import { Player, OfficeState, MusicBooth, RoomPlaylistItem, DJUserInfo } from './schema/OfficeState'
import { IRoomData } from '@club-mutant/types/Rooms'
import { Message } from '@club-mutant/types/Messages'
import type { PlaylistItemDto } from '@club-mutant/types/Dtos'
import { prefetchVideo } from '../youtubeService'
import {
  TEXTURE_IDS,
  packDirectionalAnimId,
  sanitizeAnimId,
  sanitizeTextureId,
} from '@club-mutant/types/AnimationCodec'

import PlayerUpdateActionCommand from './commands/PlayerUpdateActionCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  PlayerSetCurrentPlaylistItemCommand,
  PlayerSetNextPlaylistItemCommand,
} from './commands/PlayerUpdatePlaylistCommand'

import {
  MusicBoothConnectUserCommand,
  MusicBoothDisconnectUserCommand,
} from './commands/MusicBoothUpdateCommand'

import { MusicStreamNextCommand } from './commands/MusicStreamUpdateCommand'

import {
  DJQueueJoinCommand,
  DJQueueLeaveCommand,
  DJSkipTurnCommand,
  DJTurnCompleteCommand,
} from './commands/DJQueueCommand'

import {
  RoomQueuePlaylistAddCommand,
  RoomQueuePlaylistRemoveCommand,
  RoomQueuePlaylistReorderCommand,
} from './commands/RoomQueuePlaylistCommand'

import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'
import PunchPlayerCommand from './commands/PunchPlayerCommand'
import Queue from '../Queue'

export class ClubMutant extends Room {
  state = new OfficeState()

  private dispatcher = new Dispatcher(this)
  private name = ''
  private description = ''
  private password: string | null = null
  private musicBoothQueue: Queue | null = null
  private isPublic = false
  private publicBackgroundSeed: number | null = null

  private lastPlayerActionAtMsBySessionId = new Map<string, number>()

  private musicStreamTickIntervalId: NodeJS.Timeout | null = null

  private ambientPublicVideoId = '5-gDL5G-VQQ'

  private clearRoomPlaylistAfterDjLeft() {
    const list = this.state.roomPlaylist
    if (list.length > 0) {
      list.splice(0, list.length)
    }

    const musicStream = this.state.musicStream
    musicStream.roomPlaylistIndex = 0
    musicStream.videoBackgroundEnabled = false
  }

  private setStoppedMusicStream() {
    const musicStream = this.state.musicStream

    musicStream.status = 'waiting'
    musicStream.currentLink = null
    musicStream.currentTitle = null
    musicStream.currentVisualUrl = null
    musicStream.currentTrackMessage = null
    musicStream.startTime = Date.now()
    musicStream.duration = 0
    musicStream.isAmbient = false
  }

  private startAmbientIfNeeded() {
    if (!this.isPublic) return

    const hasDj = this.state.musicBooths[0]?.connectedUsers.some((id) => id !== '') ?? false
    if (hasDj) return

    if (this.state.players.size === 0) return

    const musicStream = this.state.musicStream
    if (musicStream.isAmbient && musicStream.status === 'playing') return

    musicStream.isAmbient = true
    musicStream.isRoomPlaylist = false
    musicStream.roomPlaylistIndex = 0
    musicStream.currentBooth = 0
    musicStream.status = 'playing'
    musicStream.streamId += 1
    musicStream.currentLink = this.ambientPublicVideoId
    musicStream.currentTitle = null
    musicStream.currentVisualUrl = null
    musicStream.currentTrackMessage = null
    musicStream.currentDj.name = ''
    musicStream.currentDj.sessionId = ''
    musicStream.startTime = Date.now()
    musicStream.duration = 0

    this.broadcast(Message.START_MUSIC_STREAM, { musicStream, offset: 0 })
  }

  private startMusicStreamTickIfNeeded() {
    if (this.musicStreamTickIntervalId) return

    this.musicStreamTickIntervalId = setInterval(() => {
      const musicStream = this.state.musicStream

      if (musicStream.status !== 'playing' || !musicStream.currentLink) return

      this.broadcast(Message.MUSIC_STREAM_TICK, {
        streamId: musicStream.streamId,
        startTime: musicStream.startTime,
        serverNowMs: Date.now(),
      })
    }, 5_000)
  }

  private stopMusicStreamTickIfNeeded() {
    if (!this.musicStreamTickIntervalId) return

    clearInterval(this.musicStreamTickIntervalId)
    this.musicStreamTickIntervalId = null
  }

  private stopAmbientIfNeeded() {
    const musicStream = this.state.musicStream
    if (!musicStream.isAmbient) return

    this.setStoppedMusicStream()
    this.broadcast(Message.STOP_MUSIC_STREAM, {})
  }

  async onCreate(options: IRoomData) {
    const { name, description, password, autoDispose, isPublic } = options
    this.name = name
    this.description = description
    this.autoDispose = autoDispose
    this.isPublic = Boolean(isPublic)

    if (this.isPublic) {
      this.publicBackgroundSeed = 3
    }

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    this.setMetadata({ name, description, hasPassword })

    this.startMusicStreamTickIfNeeded()

    const setStoppedMusicStream = () => {
      this.setStoppedMusicStream()
    }

    const startRoomPlaylistAtIndex = (requestedIndex: number) => {
      const musicStream = this.state.musicStream

      const djSessionId = this.state.musicBooths[0]?.connectedUsers.find((id) => id !== '')
      if (!djSessionId) return

      const djPlayer = this.state.players.get(djSessionId)
      if (!djPlayer) return

      const list = this.state.roomPlaylist
      if (list.length === 0) {
        musicStream.isRoomPlaylist = true
        musicStream.roomPlaylistIndex = 0
        musicStream.currentBooth = 0
        setStoppedMusicStream()
        this.broadcast(Message.STOP_MUSIC_STREAM, {})
        return
      }

      const clampedIndex =
        requestedIndex < 0 ? 0 : requestedIndex >= list.length ? 0 : requestedIndex

      const current = list[clampedIndex]
      if (!current) {
        musicStream.isRoomPlaylist = true
        musicStream.roomPlaylistIndex = 0
        musicStream.currentBooth = 0
        setStoppedMusicStream()
        this.broadcast(Message.STOP_MUSIC_STREAM, {})
        return
      }

      const djInfo = new DJUserInfo()
      djInfo.name = djPlayer.name
      djInfo.sessionId = djSessionId

      musicStream.isRoomPlaylist = true
      musicStream.roomPlaylistIndex = clampedIndex
      musicStream.currentBooth = 0
      musicStream.status = 'playing'
      musicStream.streamId += 1
      musicStream.currentLink = current.link
      musicStream.currentTitle = current.title
      musicStream.currentVisualUrl = null
      musicStream.currentTrackMessage = null
      musicStream.currentDj = djInfo
      musicStream.startTime = Date.now()
      musicStream.duration = current.duration

      this.broadcast(Message.START_MUSIC_STREAM, { musicStream, offset: 0 })
    }

    this.state.musicBooths.push(new MusicBooth())

    this.onMessage(
      Message.ROOM_PLAYLIST_ADD,
      (
        client,
        message: {
          title: string
          link: string
          duration: number
        }
      ) => {
        const item = new RoomPlaylistItem()
        item.id = uuidv4()
        item.title = message.title
        item.link = message.link
        item.duration = message.duration
        item.addedAtMs = Date.now()
        item.addedBySessionId = client.sessionId

        this.state.roomPlaylist.push(item)

        // Pre-fetch video to cache it before playback
        prefetchVideo(message.link)
      }
    )

    this.onMessage(
      Message.ROOM_PLAYLIST_REMOVE,
      (
        client,
        message: {
          id: string
        }
      ) => {
        const index = this.state.roomPlaylist.findIndex(
          (i: RoomPlaylistItem) => i.id === message.id
        )
        if (index < 0) return

        const item = this.state.roomPlaylist[index]
        if (item.addedBySessionId !== client.sessionId) return

        const musicStream = this.state.musicStream
        if (musicStream.isRoomPlaylist) {
          if (index < musicStream.roomPlaylistIndex) {
            musicStream.roomPlaylistIndex -= 1
          } else if (
            index === musicStream.roomPlaylistIndex &&
            musicStream.roomPlaylistIndex >= this.state.roomPlaylist.length - 1
          ) {
            musicStream.roomPlaylistIndex = this.state.roomPlaylist.length - 2
          }

          if (musicStream.roomPlaylistIndex < 0) {
            musicStream.roomPlaylistIndex = 0
          }
        }

        this.state.roomPlaylist.splice(index, 1)
      }
    )

    this.onMessage(Message.SET_VIDEO_BACKGROUND, (client, message: { enabled: boolean }) => {
      const isDj = this.state.musicBooths[0]?.connectedUsers.includes(client.sessionId)
      if (!isDj) return

      this.state.musicStream.videoBackgroundEnabled = Boolean(message.enabled)
    })

    this.onMessage(Message.TIME_SYNC_REQUEST, (client, message: { clientSentAtMs?: unknown }) => {
      const clientSentAtMs =
        typeof message?.clientSentAtMs === 'number' && Number.isFinite(message.clientSentAtMs)
          ? message.clientSentAtMs
          : null

      if (clientSentAtMs === null) return

      client.send(Message.TIME_SYNC_RESPONSE, {
        clientSentAtMs,
        serverNowMs: Date.now(),
      })
    })

    this.onMessage(Message.ROOM_PLAYLIST_SKIP, (client) => {
      const isDj = this.state.musicBooths[0]?.connectedUsers.includes(client.sessionId)
      if (!isDj) return

      const musicStream = this.state.musicStream
      const nextIndex = musicStream.isRoomPlaylist ? musicStream.roomPlaylistIndex + 1 : 0

      if (nextIndex >= this.state.roomPlaylist.length) {
        musicStream.isRoomPlaylist = true
        musicStream.roomPlaylistIndex = this.state.roomPlaylist.length
        musicStream.currentBooth = 0
        setStoppedMusicStream()
        this.broadcast(Message.STOP_MUSIC_STREAM, {})
        return
      }

      startRoomPlaylistAtIndex(nextIndex)
    })

    this.onMessage(Message.ROOM_PLAYLIST_PREV, (client) => {
      const isDj = this.state.musicBooths[0]?.connectedUsers.includes(client.sessionId)
      if (!isDj) return

      if (this.state.roomPlaylist.length === 0) return

      const musicStream = this.state.musicStream
      const nextIndex = musicStream.isRoomPlaylist ? musicStream.roomPlaylistIndex - 1 : 0

      startRoomPlaylistAtIndex(Math.max(0, nextIndex))
    })

    this.onMessage(Message.ROOM_PLAYLIST_PLAY, (client) => {
      const isDj = this.state.musicBooths[0]?.connectedUsers.includes(client.sessionId)
      if (!isDj) return

      const musicStream = this.state.musicStream
      const index = musicStream.isRoomPlaylist ? musicStream.roomPlaylistIndex : 0
      startRoomPlaylistAtIndex(index)
    })

    // when a player starts playing a song
    this.onMessage(Message.SYNC_MUSIC_STREAM, (client, message: { item?: PlaylistItemDto }) => {
      console.log('///ON MESSSAGE SYNYC MUSIC STREAM', message?.item)
      console.log('///ON MESSSAGE SYNC USER PLAYLIST QUEUE', message?.item)

      this.dispatcher.dispatch(new MusicStreamNextCommand(), { client, item: message?.item })
    })

    // when a player connects to a music booth
    this.onMessage(
      Message.CONNECT_TO_MUSIC_BOOTH,
      (client, message: { musicBoothIndex: number }) => {
        const musicBoothIndex =
          typeof message.musicBoothIndex === 'number' && Number.isFinite(message.musicBoothIndex)
            ? message.musicBoothIndex
            : 0

        if (musicBoothIndex < 0 || musicBoothIndex >= this.state.musicBooths.length) return

        this.dispatcher.dispatch(new MusicBoothConnectUserCommand(), {
          client,
          musicBoothIndex,
        })

        const isDj = this.state.musicBooths[musicBoothIndex]?.connectedUsers.includes(
          client.sessionId
        )

        if (this.isPublic && isDj) {
          this.stopAmbientIfNeeded()
        }

        if (
          (this.state.musicStream.status === 'waiting' ||
            this.state.musicStream.status === 'seeking') &&
          isDj
        ) {
          if (this.state.roomPlaylist.length > 0) {
            const musicStream = this.state.musicStream
            const index = musicStream.isRoomPlaylist ? musicStream.roomPlaylistIndex : 0
            startRoomPlaylistAtIndex(index)
          } else {
            this.dispatcher.dispatch(new MusicStreamNextCommand(), {})
          }
        }
      }
    )

    // when a player disconnects from a music booth, remove the user from the musicBooth connectedUsers array
    this.onMessage(
      Message.DISCONNECT_FROM_MUSIC_BOOTH,
      (client, message: { musicBoothIndex: number }) => {
        const musicBoothIndex =
          typeof message.musicBoothIndex === 'number' && Number.isFinite(message.musicBoothIndex)
            ? message.musicBoothIndex
            : 0

        if (musicBoothIndex < 0 || musicBoothIndex >= this.state.musicBooths.length) return

        const wasDj = this.state.musicBooths[musicBoothIndex]?.connectedUsers.includes(
          client.sessionId
        )
        this.dispatcher.dispatch(new MusicBoothDisconnectUserCommand(), {
          client,
          musicBoothIndex,
        })

        if (wasDj && musicBoothIndex === 0) {
          this.clearRoomPlaylistAfterDjLeft()
        }

        const boothIsEmpty =
          this.state.musicBooths[musicBoothIndex]?.connectedUsers.every((id) => id === '') ?? true
        if (this.isPublic && boothIsEmpty) {
          this.startAmbientIfNeeded()
          return
        }
        if (this.state.musicStream.currentBooth === musicBoothIndex) {
          if (this.state.musicStream.isRoomPlaylist) {
            this.state.musicStream.isRoomPlaylist = true
            this.state.musicStream.roomPlaylistIndex = this.state.musicStream.roomPlaylistIndex ?? 0
            setStoppedMusicStream()
            this.broadcast(Message.STOP_MUSIC_STREAM, {})
          } else {
            this.dispatcher.dispatch(new MusicStreamNextCommand(), {})
          }
        }
      }
    )

    // when receiving updatePlayer message, call the PlayerUpdateActionCommand
    this.onMessage(
      Message.UPDATE_PLAYER_ACTION,
      (
        client,
        message: {
          x?: unknown
          y?: unknown
          textureId?: unknown
          animId?: unknown
        }
      ) => {
        const nowMs = Date.now()

        const lastAtMs = this.lastPlayerActionAtMsBySessionId.get(client.sessionId) ?? 0
        const minIntervalMs = 50
        if (nowMs - lastAtMs < minIntervalMs) return

        const x = typeof message.x === 'number' && Number.isFinite(message.x) ? message.x : null
        const y = typeof message.y === 'number' && Number.isFinite(message.y) ? message.y : null
        if (x === null || y === null) return

        const player = this.state.players.get(client.sessionId)
        if (!player) return

        const dtMs = Math.max(1, nowMs - lastAtMs)
        const maxSpeedPxPerSec = 240
        const distanceBufferPx = 40
        const dx = x - player.x
        const dy = y - player.y
        const distance = Math.hypot(dx, dy)
        const maxAllowedDistance = (maxSpeedPxPerSec * dtMs) / 1000 + distanceBufferPx
        if (distance > maxAllowedDistance) return

        const sanitizedTextureId = this.isPublic
          ? TEXTURE_IDS.mutant
          : sanitizeTextureId(message.textureId)

        const sanitizedAnimId = sanitizeAnimId(message.animId, sanitizedTextureId)

        this.lastPlayerActionAtMsBySessionId.set(client.sessionId, nowMs)

        this.dispatcher.dispatch(new PlayerUpdateActionCommand(), {
          client,
          x,
          y,
          textureId: sanitizedTextureId,
          animId: sanitizedAnimId,
        })
      }
    )

    this.onMessage(Message.UPDATE_PLAYER_SCALE, (client, message: { scale?: unknown }) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return

      const scale =
        typeof message.scale === 'number' && Number.isFinite(message.scale)
          ? Math.max(1, Math.min(255, Math.round(message.scale)))
          : 100

      player.scale = scale
    })

    this.onMessage(Message.PUNCH_PLAYER, (client, message: { targetId?: unknown }) => {
      const targetId = typeof message.targetId === 'string' ? message.targetId : ''
      if (!targetId) return

      this.dispatcher.dispatch(new PunchPlayerCommand(), { client, targetId })
    })

    // when receiving updatePlayerName message, call the PlayerUpdateNameCommand
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      if (this.isPublic) return
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name,
      })
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.readyToConnect = true
    })

    // when a player send a chat message, update the message array and broadcast to all connected clients except the sender
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => {
      // update the message array (so that players join later can also see the message)
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content,
      })

      // broadcast to all currently connected clients except the sender (to render in-game dialog on top of the character)
      this.broadcast(
        Message.ADD_CHAT_MESSAGE,
        { clientId: client.sessionId, content: message.content },
        { except: client }
      )
    })

    this.onMessage(
      Message.SET_USER_NEXT_PLAYLIST_ITEM,
      (client, message: { item: PlaylistItemDto }) => {
        console.log('////SET NEXT USER PLAYLIST ITEM', message.item)
        this.dispatcher.dispatch(new PlayerSetNextPlaylistItemCommand(), {
          client,
          item: message.item,
        })
      }
    )

    this.onMessage(Message.SET_USER_PLAYLIST_ITEM, (client, message: { item: PlaylistItemDto }) => {
      console.log('////SET USER PLAYLIST ITEM', message.item)
      this.dispatcher.dispatch(new PlayerSetCurrentPlaylistItemCommand(), {
        client,
        item: message.item,
      })
    })

    // DJ Queue Management
    this.onMessage(Message.DJ_QUEUE_JOIN, (client) => {
      this.dispatcher.dispatch(new DJQueueJoinCommand(), { client })
    })

    this.onMessage(Message.DJ_QUEUE_LEAVE, (client) => {
      this.dispatcher.dispatch(new DJQueueLeaveCommand(), { client })
    })

    this.onMessage(Message.DJ_SKIP_TURN, (client) => {
      this.dispatcher.dispatch(new DJSkipTurnCommand(), { client })
    })

    this.onMessage(Message.DJ_TURN_COMPLETE, (client) => {
      this.dispatcher.dispatch(new DJTurnCompleteCommand(), { client })
    })

    // Room Queue Playlist Management
    this.onMessage(
      Message.ROOM_QUEUE_PLAYLIST_ADD,
      (client, message: { title: string; link: string; duration: number }) => {
        this.dispatcher.dispatch(new RoomQueuePlaylistAddCommand(), { client, item: message })
      }
    )

    this.onMessage(Message.ROOM_QUEUE_PLAYLIST_REMOVE, (client, message: { itemId: string }) => {
      this.dispatcher.dispatch(new RoomQueuePlaylistRemoveCommand(), {
        client,
        itemId: message.itemId,
      })
    })

    this.onMessage(
      Message.ROOM_QUEUE_PLAYLIST_REORDER,
      (client, message: { fromIndex: number; toIndex: number }) => {
        this.dispatcher.dispatch(new RoomQueuePlaylistReorderCommand(), {
          client,
          fromIndex: message.fromIndex,
          toIndex: message.toIndex,
        })
      }
    )
  }

  async onAuth(client: Client, options: { password: string | null }) {
    if (this.password) {
      if (!options.password) {
        throw new ServerError(403, 'Password is required!')
      }

      const isValidPassword = await bcrypt.compare(options.password, this.password)
      if (!isValidPassword) {
        throw new ServerError(403, 'Password is incorrect!')
      }
    }
    return true
  }

  // when a new player joins, send room data
  onJoin(client: Client, options: any) {
    console.log('////onJoin, client', client)

    const existingPlayer = this.state.players.get(client.sessionId)
    const player = existingPlayer ?? new Player()

    if (!existingPlayer && this.isPublic) {
      const playerId = options?.playerId || client.sessionId.slice(0, 8)
      player.name = `mutant-${playerId}`
      player.textureId = TEXTURE_IDS.mutant
      player.animId = packDirectionalAnimId('idle', 'down')
    }

    if (!existingPlayer) {
      this.state.players.set(client.sessionId, player)
    }

    this.lastPlayerActionAtMsBySessionId.set(client.sessionId, Date.now())

    client.send(Message.SEND_ROOM_DATA, {
      id: this.roomId,
      name: this.name,
      description: this.description,
      backgroundSeed: this.isPublic ? this.publicBackgroundSeed : null,
    })
    console.log('////onJoin, Message.SEND_ROOM_DATA')

    this.startAmbientIfNeeded()

    const musicStream = this.state.musicStream
    console.log('this state musicStream', musicStream)
    if (musicStream.status === 'playing') {
      const currentTime: number = Date.now()
      client.send(Message.START_MUSIC_STREAM, {
        musicStream: musicStream,
        offset: (currentTime - musicStream.startTime) / 1000,
      })
    }
    console.log('////onJoin, musicStream.status', musicStream.status)
  }

  async onLeave(client: Client, code: number) {
    const consented = code === CloseCode.CONSENTED

    // Reconnection disabled for easier debugging — re-enable later if needed
    // if (!consented) {
    //   try {
    //     await this.allowReconnection(client, 60)
    //     return
    //   } catch (_e) {
    //     // fallthrough: timed out, proceed to cleanup
    //   }
    // }

    this.lastPlayerActionAtMsBySessionId.delete(client.sessionId)

    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }

    this.state.musicBooths.forEach((musicBooth, index) => {
      if (musicBooth.connectedUsers.includes(client.sessionId)) {
        this.dispatcher.dispatch(new MusicBoothDisconnectUserCommand(), {
          client,
          musicBoothIndex: index,
        })

        if (index === 0) {
          this.clearRoomPlaylistAfterDjLeft()
        }

        if (this.isPublic) {
          this.startAmbientIfNeeded()
          return
        }

        if (this.state.musicStream.currentBooth === index) {
          if (this.state.musicStream.isRoomPlaylist) {
            this.setStoppedMusicStream()
            this.broadcast(Message.STOP_MUSIC_STREAM, {})
          } else {
            this.dispatcher.dispatch(new MusicStreamNextCommand(), {})
          }
        }
      }
    })

    // Remove from DJ queue if present
    const inDJQueue = this.state.djQueue.some((e) => e.sessionId === client.sessionId)
    if (inDJQueue) {
      this.dispatcher.dispatch(new DJQueueLeaveCommand(), { client })
    }
  }

  onDispose() {
    console.log('room', this.roomId, 'disposing...')

    this.stopMusicStreamTickIfNeeded()
    this.dispatcher.stop()
  }
}
