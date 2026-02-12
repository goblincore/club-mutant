import bcrypt from 'bcrypt'
import { Room, Client, ServerError, CloseCode } from 'colyseus'
import { Dispatcher } from '@colyseus/command'

import { Player, OfficeState, MusicBooth } from './schema/OfficeState'
import { IRoomData } from '@club-mutant/types/Rooms'
import { Message } from '@club-mutant/types/Messages'
import {
  TEXTURE_IDS,
  packDirectionalAnimId,
  sanitizeAnimId,
  sanitizeTextureId,
} from '@club-mutant/types/AnimationCodec'

import PlayerUpdateActionCommand from './commands/PlayerUpdateActionCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'

import {
  MusicBoothConnectUserCommand,
  MusicBoothDisconnectUserCommand,
} from './commands/MusicBoothUpdateCommand'

import {
  DJQueueJoinCommand,
  DJQueueLeaveCommand,
  DJPlayCommand,
  DJStopCommand,
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

export class ClubMutant extends Room {
  state = new OfficeState()

  private dispatcher = new Dispatcher(this)
  private name = ''
  private description = ''
  private password: string | null = null
  private isPublic = false
  private publicBackgroundSeed: number | null = null

  private lastPlayerActionAtMsBySessionId = new Map<string, number>()

  private musicStreamTickIntervalId: NodeJS.Timeout | null = null
  private trackWatchdogTimerId: NodeJS.Timeout | null = null

  private ambientPublicVideoId = '5-gDL5G-VQQ' //'5-gDL5G-VQQ'

  /** Start a watchdog timer that auto-advances DJ rotation if no DJ_TURN_COMPLETE arrives. */
  private startTrackWatchdog(durationMs: number) {
    this.clearTrackWatchdog()

    const bufferMs = 10_000
    const timeoutMs = Math.max(durationMs, 5_000) + bufferMs

    this.trackWatchdogTimerId = setTimeout(() => {
      this.trackWatchdogTimerId = null

      const ms = this.state.musicStream
      if (ms.status !== 'playing' || !ms.currentLink) return

      const djId = this.state.currentDjSessionId
      if (!djId) return

      console.log('[Watchdog] Track duration exceeded for DJ %s, auto-advancing', djId)

      this.dispatcher.dispatch(new DJTurnCompleteCommand(), {
        client: { sessionId: djId } as Client,
      })
    }, timeoutMs)
  }

  private clearTrackWatchdog() {
    if (this.trackWatchdogTimerId) {
      clearTimeout(this.trackWatchdogTimerId)
      this.trackWatchdogTimerId = null
    }
  }

  /** Helper: start watchdog if a track is currently playing with a known duration. */
  private startWatchdogIfPlaying() {
    const ms = this.state.musicStream

    if (ms.status === 'playing' && ms.currentLink && ms.duration > 0) {
      this.startTrackWatchdog(ms.duration * 1000)
    }
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

    this.state.musicBooths.push(new MusicBooth())

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

        if (this.isPublic) {
          const isDj = this.state.musicBooths[musicBoothIndex]?.connectedUsers.includes(
            client.sessionId
          )

          if (isDj) {
            this.stopAmbientIfNeeded()
          }
        }
      }
    )

    // when a player disconnects from a music booth
    this.onMessage(
      Message.DISCONNECT_FROM_MUSIC_BOOTH,
      (client, message: { musicBoothIndex: number }) => {
        const musicBoothIndex =
          typeof message.musicBoothIndex === 'number' && Number.isFinite(message.musicBoothIndex)
            ? message.musicBoothIndex
            : 0

        if (musicBoothIndex < 0 || musicBoothIndex >= this.state.musicBooths.length) return

        this.dispatcher.dispatch(new MusicBoothDisconnectUserCommand(), {
          client,
          musicBoothIndex,
        })

        // Skip legacy booth music handling when DJ queue is active —
        // DJQueueLeaveCommand handles all music state for the DJ queue flow.
        if (this.state.djQueue.length > 0 || this.state.currentDjSessionId !== null) return

        const boothIsEmpty =
          this.state.musicBooths[musicBoothIndex]?.connectedUsers.every((id) => id === '') ?? true

        if (this.isPublic && boothIsEmpty) {
          this.startAmbientIfNeeded()
          return
        }

        // No DJ queue active and booth emptied — stop music
        if (this.state.musicStream.currentBooth === musicBoothIndex) {
          this.setStoppedMusicStream()
          this.broadcast(Message.STOP_MUSIC_STREAM, {})
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
          ? player.textureId
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

    // DJ Queue Management
    this.onMessage(Message.DJ_QUEUE_JOIN, (client) => {
      this.dispatcher.dispatch(new DJQueueJoinCommand(), { client })
    })

    this.onMessage(Message.DJ_QUEUE_LEAVE, (client) => {
      this.clearTrackWatchdog()
      this.dispatcher.dispatch(new DJQueueLeaveCommand(), { client })
      this.startWatchdogIfPlaying()
    })

    this.onMessage(Message.DJ_PLAY, (client) => {
      this.dispatcher.dispatch(new DJPlayCommand(), { client })
      this.startWatchdogIfPlaying()
    })

    this.onMessage(Message.DJ_STOP, (client) => {
      this.clearTrackWatchdog()
      this.dispatcher.dispatch(new DJStopCommand(), { client })
    })

    this.onMessage(Message.DJ_SKIP_TURN, (client) => {
      this.clearTrackWatchdog()
      this.dispatcher.dispatch(new DJSkipTurnCommand(), { client })
      this.startWatchdogIfPlaying()
    })

    this.onMessage(Message.DJ_TURN_COMPLETE, (client) => {
      this.clearTrackWatchdog()
      this.dispatcher.dispatch(new DJTurnCompleteCommand(), { client })
      this.startWatchdogIfPlaying()
    })

    // Trampoline jump — broadcast to all other clients (cosmetic)
    this.onMessage(Message.PLAYER_JUMP, (client) => {
      this.broadcast(Message.PLAYER_JUMP, { sessionId: client.sessionId }, { except: client })
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
      const playerName = options?.name?.trim()
      player.name = playerName || `mutant-${playerId}`
      const rawTextureId = options?.textureId
      player.textureId = rawTextureId != null ? sanitizeTextureId(rawTextureId) : TEXTURE_IDS.mutant
      player.animId = packDirectionalAnimId('idle', 'down')
      console.log(
        `[onJoin] name=${player.name} textureId=${player.textureId} (raw=${rawTextureId})`
      )
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

        // Skip legacy booth music handling when DJ queue is active —
        // DJQueueLeaveCommand handles all music state for the DJ queue flow.
        if (this.state.djQueue.length > 0 || this.state.currentDjSessionId !== null) return

        if (this.isPublic) {
          this.startAmbientIfNeeded()
          return
        }

        // No DJ queue active and booth emptied — stop music
        if (this.state.musicStream.currentBooth === index) {
          this.setStoppedMusicStream()
          this.broadcast(Message.STOP_MUSIC_STREAM, {})
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

    this.clearTrackWatchdog()
    this.stopMusicStreamTickIfNeeded()
    this.dispatcher.stop()
  }
}
