import bcrypt from 'bcrypt'
import { Room, Client, ServerError, CloseCode } from 'colyseus'
import { Dispatcher } from '@colyseus/command'

import { Player, OfficeState, MusicBooth } from './schema/OfficeState'
import { IRoomData, type MusicMode } from '@club-mutant/types/Rooms'
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

import {
  JukeboxAddCommand,
  JukeboxRemoveCommand,
  JukeboxPlayCommand,
  JukeboxStopCommand,
  JukeboxSkipCommand,
  JukeboxTrackCompleteCommand,
} from './commands/JukeboxCommand'

import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'
import PunchPlayerCommand from './commands/PunchPlayerCommand'

const LOG_ENABLED = process.env.NODE_ENV !== 'production'

export class ClubMutant extends Room {
  state = new OfficeState()

  private dispatcher = new Dispatcher(this)
  private name = ''
  private description = ''
  private password: string | null = null
  private isPublic = false
  private musicMode: MusicMode = 'djqueue'
  private publicBackgroundSeed: number | null = null

  private lastPlayerActionAtMsBySessionId = new Map<string, number>()

  // Per-client message throttling: sessionId → messageType → lastSentMs
  private messageThrottles = new Map<string, Map<number, number>>()

  private musicStreamTickIntervalId: NodeJS.Timeout | null = null
  private trackWatchdogTimerId: NodeJS.Timeout | null = null

  private ambientPublicVideoId = '5-gDL5G-VQQ' //'5-gDL5G-VQQ'

  /** Returns true if the message should be dropped (too frequent). */
  private throttle(client: Client, messageType: number, minIntervalMs: number): boolean {
    const nowMs = Date.now()
    let clientMap = this.messageThrottles.get(client.sessionId)
    if (!clientMap) {
      clientMap = new Map()
      this.messageThrottles.set(client.sessionId, clientMap)
    }
    const lastMs = clientMap.get(messageType) ?? 0
    if (nowMs - lastMs < minIntervalMs) return true
    clientMap.set(messageType, nowMs)
    return false
  }

  /** Start a watchdog timer that auto-advances when no track-complete arrives. */
  private startTrackWatchdog(durationMs: number) {
    this.clearTrackWatchdog()

    const bufferMs = 10_000
    const timeoutMs = Math.max(durationMs, 5_000) + bufferMs

    this.trackWatchdogTimerId = setTimeout(() => {
      this.trackWatchdogTimerId = null

      const ms = this.state.musicStream
      if (ms.status !== 'playing' || !ms.currentLink) return

      if (this.musicMode === 'jukebox' || this.musicMode === 'personal') {
        console.log('[Watchdog] Jukebox track duration exceeded, auto-advancing')
        this.dispatcher.dispatch(new JukeboxTrackCompleteCommand(), {
          client: { sessionId: '' } as Client,
          streamId: ms.streamId,
        })
      } else {
        const djId = this.state.currentDjSessionId
        if (!djId) return

        console.log('[Watchdog] Track duration exceeded for DJ %s, auto-advancing', djId)
        this.dispatcher.dispatch(new DJTurnCompleteCommand(), {
          client: { sessionId: djId } as Client,
        })
      }
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

    // Compute music mode from options
    if (options.musicMode) {
      this.musicMode = options.musicMode
    } else if (this.isPublic) {
      this.musicMode = 'djqueue'
    } else {
      this.musicMode = 'djqueue' // default for custom rooms
    }

    // Performance: cap max players per room
    this.maxClients = 50

    // Performance: reduce patch rate from 20fps (50ms) to 10fps (100ms)
    // Client uses exponential lerp (REMOTE_LERP=8) so 10fps is visually smooth
    this.patchRate = 100

    if (this.isPublic) {
      this.publicBackgroundSeed = 3
    }

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    this.setMetadata({ name, description, hasPassword, musicMode: this.musicMode })

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
        const minIntervalMs = 100 // Match patchRate (100ms = 10fps)
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
      if (this.throttle(client, Message.ADD_CHAT_MESSAGE, 500)) return
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

    // ──────── DJ Queue Management (djqueue mode only) ────────
    if (this.musicMode === 'djqueue') {
      this.onMessage(Message.DJ_QUEUE_JOIN, (client, message) => {
        if (this.throttle(client, Message.DJ_QUEUE_JOIN, 2000)) return
        this.dispatcher.dispatch(new DJQueueJoinCommand(), {
          client,
          slotIndex: message?.slotIndex ?? 0,
        })
      })

      this.onMessage(Message.DJ_QUEUE_LEAVE, (client) => {
        if (this.throttle(client, Message.DJ_QUEUE_LEAVE, 2000)) return
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

      // Room Queue Playlist Management (per-player, djqueue mode only)
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

    // ──────── Jukebox Management (jukebox + personal modes) ────────
    if (this.musicMode === 'jukebox' || this.musicMode === 'personal') {
      this.onMessage(
        Message.JUKEBOX_ADD,
        (client, message: { title: string; link: string; duration: number }) => {
          this.dispatcher.dispatch(new JukeboxAddCommand(), { client, item: message })
          this.startWatchdogIfPlaying()
        }
      )

      this.onMessage(Message.JUKEBOX_REMOVE, (client, message: { itemId: string }) => {
        this.clearTrackWatchdog()
        this.dispatcher.dispatch(new JukeboxRemoveCommand(), {
          client,
          itemId: message.itemId,
        })
        this.startWatchdogIfPlaying()
      })

      this.onMessage(Message.JUKEBOX_PLAY, (client) => {
        this.dispatcher.dispatch(new JukeboxPlayCommand(), { client })
        this.startWatchdogIfPlaying()
      })

      this.onMessage(Message.JUKEBOX_STOP, (client) => {
        this.clearTrackWatchdog()
        this.dispatcher.dispatch(new JukeboxStopCommand(), { client })
      })

      this.onMessage(Message.JUKEBOX_SKIP, (client) => {
        this.clearTrackWatchdog()
        this.dispatcher.dispatch(new JukeboxSkipCommand(), { client })
        this.startWatchdogIfPlaying()
      })

      this.onMessage(Message.JUKEBOX_TRACK_COMPLETE, (client, message) => {
        this.clearTrackWatchdog()
        this.dispatcher.dispatch(new JukeboxTrackCompleteCommand(), {
          client,
          streamId: message?.streamId,
        })
        this.startWatchdogIfPlaying()
      })
    }

    // ── Dream Mode ──

    this.onMessage(Message.DREAM_SLEEP, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      player.isDreaming = true
    })

    this.onMessage(Message.DREAM_WAKE, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      player.isDreaming = false
    })

    this.onMessage(Message.DREAM_COLLECT, (client, message: { collectibleId?: string }) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      const id = message?.collectibleId
      if (typeof id !== 'string' || !id) return
      // Only add if not already collected
      if (!player.collectibles.includes(id)) {
        player.collectibles.push(id)
      }
    })

    // Trampoline jump — broadcast to all other clients (cosmetic)
    this.onMessage(Message.PLAYER_JUMP, (client) => {
      if (this.throttle(client, Message.PLAYER_JUMP, 1000)) return
      this.broadcast(Message.PLAYER_JUMP, { sessionId: client.sessionId }, { except: client })
    })
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
    if (LOG_ENABLED) console.log('////onJoin, client', client.sessionId)

    const existingPlayer = this.state.players.get(client.sessionId)
    const player = existingPlayer ?? new Player()

    if (!existingPlayer) {
      const playerId = options?.playerId || client.sessionId.slice(0, 8)
      const rawTextureId = options?.textureId
      player.textureId = rawTextureId != null ? sanitizeTextureId(rawTextureId) : TEXTURE_IDS.mutant
      player.animId = packDirectionalAnimId('idle', 'down')

      if (this.isPublic) {
        const playerName = options?.name?.trim()
        player.name = playerName || `mutant-${playerId}`
      }

      if (LOG_ENABLED)
        console.log(
          `[onJoin] name=${player.name} textureId=${player.textureId} (raw=${rawTextureId}) public=${this.isPublic}`
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
    if (LOG_ENABLED) console.log('////onJoin, Message.SEND_ROOM_DATA')

    this.startAmbientIfNeeded()

    const musicStream = this.state.musicStream
    if (LOG_ENABLED) console.log('this state musicStream', musicStream)
    if (musicStream.status === 'playing') {
      const currentTime: number = Date.now()
      client.send(Message.START_MUSIC_STREAM, {
        musicStream: musicStream,
        offset: (currentTime - musicStream.startTime) / 1000,
      })
    }
    if (LOG_ENABLED) console.log('////onJoin, musicStream.status', musicStream.status)
  }

  onDrop(client: Client, code: number) {
    if (LOG_ENABLED) console.log(`[onDrop] client ${client.sessionId} dropped, code=${code}`)

    // Allow 60 seconds for reconnection
    this.allowReconnection(client, 60)

    // Mark player as disconnected so other clients can show visual feedback
    const player = this.state.players.get(client.sessionId)

    if (player) {
      player.connected = false
    }
  }

  onReconnect(client: Client) {
    if (LOG_ENABLED) console.log(`[onReconnect] client ${client.sessionId} reconnected!`)

    const player = this.state.players.get(client.sessionId)

    if (player) {
      player.connected = true
    }
  }

  async onLeave(client: Client, code: number) {
    if (LOG_ENABLED) console.log(`[onLeave] client ${client.sessionId} left, code=${code}`)

    this.lastPlayerActionAtMsBySessionId.delete(client.sessionId)
    this.messageThrottles.delete(client.sessionId)

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
    if (LOG_ENABLED) console.log('room', this.roomId, 'disposing...')

    this.clearTrackWatchdog()
    this.stopMusicStreamTickIfNeeded()
    this.dispatcher.stop()
  }
}
