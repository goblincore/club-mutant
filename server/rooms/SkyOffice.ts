import bcrypt from 'bcrypt'
import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { v4 as uuidv4 } from 'uuid'

import {
  Player,
  OfficeState,
  MusicBooth,
  PlaylistItem,
  RoomPlaylistItem,
  DJUserInfo,
} from './schema/OfficeState'
import { IRoomData } from '../../types/Rooms'
import { Message } from '../../types/Messages'

import PlayerUpdateActionCommand from './commands/PlayerUpdateActionCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  PlayerSetCurrentPlaylistItemCommand,
  PlayerSetNextPlaylistItemCommand,
  PlayerSyncShortPlaylist,
} from './commands/PlayerUpdatePlaylistCommand'

import {
  MusicBoothConnectUserCommand,
  MusicBoothDisconnectUserCommand,
} from './commands/MusicBoothUpdateCommand'

import { MusicStreamNextCommand } from './commands/MusicStreamUpdateCommand'

import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'
import Queue from '../Queue'

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name = ''
  private description = ''
  private password: string | null = null
  private musicBoothQueue: Queue | null = null
  private isPublic = false
  private publicBackgroundSeed: number | null = null

  private musicStreamTickIntervalId: NodeJS.Timeout | null = null

  private ambientPublicVideoId = 'CAWJ2PO1V_g'

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

    const djSessionId = this.state.musicBooths[0]?.connectedUser
    if (djSessionId) return

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

    this.setState(new OfficeState())

    this.startMusicStreamTickIfNeeded()

    const setStoppedMusicStream = () => {
      this.setStoppedMusicStream()
    }

    const startRoomPlaylistAtIndex = (requestedIndex: number) => {
      const musicStream = this.state.musicStream

      const djSessionId = this.state.musicBooths[0]?.connectedUser
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
      if (this.state.musicBooths[0]?.connectedUser !== client.sessionId) return

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
      if (this.state.musicBooths[0]?.connectedUser !== client.sessionId) return

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
      if (this.state.musicBooths[0]?.connectedUser !== client.sessionId) return

      if (this.state.roomPlaylist.length === 0) return

      const musicStream = this.state.musicStream
      const nextIndex = musicStream.isRoomPlaylist ? musicStream.roomPlaylistIndex - 1 : 0

      startRoomPlaylistAtIndex(Math.max(0, nextIndex))
    })

    this.onMessage(Message.ROOM_PLAYLIST_PLAY, (client) => {
      if (this.state.musicBooths[0]?.connectedUser !== client.sessionId) return

      const musicStream = this.state.musicStream
      const index = musicStream.isRoomPlaylist ? musicStream.roomPlaylistIndex : 0
      startRoomPlaylistAtIndex(index)
    })

    // when a player starts playing a song
    this.onMessage(Message.SYNC_MUSIC_STREAM, (client, message: { item?: PlaylistItem }) => {
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

        if (
          this.isPublic &&
          this.state.musicBooths[musicBoothIndex]?.connectedUser === client.sessionId
        ) {
          this.stopAmbientIfNeeded()
        }

        if (
          (this.state.musicStream.status === 'waiting' ||
            this.state.musicStream.status === 'seeking') &&
          this.state.musicBooths[musicBoothIndex]?.connectedUser === client.sessionId
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

    // when a player disconnects from a music booth, remove the user to the musicBooth connectedUser array
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

        if (this.isPublic && !this.state.musicBooths[musicBoothIndex]?.connectedUser) {
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
      (client, message: { x: number; y: number; anim: string }) => {
        const sanitizedAnim =
          this.isPublic && typeof message.anim === 'string'
            ? (() => {
                const allowedSpecialAnims = new Set([
                  'mutant_boombox',
                  'mutant_djwip',
                  'mutant_transform',
                  'mutant_transform_reverse',
                ])

                if (allowedSpecialAnims.has(message.anim)) return message.anim

                const parts = message.anim.split('_')
                if (parts.length < 2) return 'mutant_idle_down'
                parts[0] = 'mutant'
                return parts.join('_')
              })()
            : message.anim

        this.dispatcher.dispatch(new PlayerUpdateActionCommand(), {
          client,
          x: message.x,
          y: message.y,
          anim: sanitizedAnim,
        })
      }
    )

    this.onMessage(Message.PUNCH_PLAYER, (client, message: { targetId: string }) => {
      const attacker = this.state.players.get(client.sessionId)
      if (!attacker) return

      const targetId = typeof message.targetId === 'string' ? message.targetId : ''
      if (!targetId) return

      if (targetId === client.sessionId) return

      const victim = this.state.players.get(targetId)
      if (!victim) return

      const dx = attacker.x - victim.x
      const dy = attacker.y - victim.y
      const punchRangePx = 56
      const punchDyWeight = 1.5
      const weightedDistanceSq = dx * dx + dy * punchDyWeight * (dy * punchDyWeight)
      if (weightedDistanceSq > punchRangePx * punchRangePx) return

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

      const victimTexture =
        typeof victim.anim === 'string' && victim.anim.includes('_')
          ? victim.anim.split('_')[0]
          : ''

      if (victimTexture !== 'mutant') return

      // Randomly pick hit1 or hit2
      const hitType = Math.random() > 0.5 ? 'hit1' : 'hit2'
      const hitAnimKey = `mutant_${hitType}_${dir}`

      const punchImpactDelayMs = 350

      const attackerAtPunch = { x: attacker.x, y: attacker.y }

      this.clock.setTimeout(() => {
        const victimCurrent = this.state.players.get(targetId)
        if (!victimCurrent) return

        const punchKnockbackPx = 10

        const kbDx = victimCurrent.x - attackerAtPunch.x
        const kbDy = victimCurrent.y - attackerAtPunch.y
        const kbLen = Math.sqrt(kbDx * kbDx + kbDy * kbDy)

        const kbUnitX = kbLen > 0 ? kbDx / kbLen : 0
        const kbUnitY = kbLen > 0 ? kbDy / kbLen : 0

        victimCurrent.x += kbUnitX * punchKnockbackPx
        victimCurrent.y += kbUnitY * punchKnockbackPx

        victimCurrent.anim = hitAnimKey

        const victimClient = this.clients.find((c) => c.sessionId === targetId)

        // Broadcast to everyone ELSE (OtherPlayer instances)
        this.broadcast(
          Message.UPDATE_PLAYER_ACTION,
          {
            x: victimCurrent.x,
            y: victimCurrent.y,
            anim: hitAnimKey,
            sessionId: targetId,
          },
          { except: victimClient }
        )

        // Send to the victim specifically
        if (victimClient) {
          victimClient.send(Message.PUNCH_PLAYER, {
            anim: hitAnimKey,
            x: victimCurrent.x,
            y: victimCurrent.y,
          })
        }
      }, punchImpactDelayMs)
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
      Message.SYNC_USER_SHORT_PLAYLIST,
      (client, message: { items: PlaylistItem[] }) => {
        console.log('////onMessage, SYNC USER SHORT PLAYLIST', message.items)
        this.dispatcher.dispatch(new PlayerSyncShortPlaylist(), {
          client,
          items: message.items,
        })
      }
    )
    this.onMessage(
      Message.SET_USER_NEXT_PLAYLIST_ITEM,
      (client, message: { item: PlaylistItem }) => {
        console.log('////SET NEXT USER PLAYLIST ITEM', message.item)
        this.dispatcher.dispatch(new PlayerSetNextPlaylistItemCommand(), {
          client,
          item: message.item,
        })
      }
    )

    this.onMessage(Message.SET_USER_PLAYLIST_ITEM, (client, message: { item: PlaylistItem }) => {
      console.log('////SET USER PLAYLIST ITEM', message.item)
      this.dispatcher.dispatch(new PlayerSetCurrentPlaylistItemCommand(), {
        client,
        item: message.item,
      })
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
    console.log('////onJoin, client', client)

    const player = new Player()

    if (this.isPublic) {
      player.name = `mutant-${client.sessionId}`
      player.anim = 'mutant_idle_down'
    }

    this.state.players.set(client.sessionId, player)
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

  onLeave(client: Client, consented: boolean) {
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }
    this.state.musicBooths.forEach((musicBooth, index) => {
      if (musicBooth.connectedUser === client.sessionId) {
        this.dispatcher.dispatch(new MusicBoothDisconnectUserCommand(), {
          client,
          musicBoothIndex: index,
        })

        if (this.isPublic) {
          this.startAmbientIfNeeded()
          return
        }

        if (this.state.musicStream.currentBooth === index) {
          this.dispatcher.dispatch(new MusicStreamNextCommand(), {})
        }
      }
    })
  }

  onDispose() {
    console.log('room', this.roomId, 'disposing...')

    this.stopMusicStreamTickIfNeeded()
    this.dispatcher.stop()
  }
}
