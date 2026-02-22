import bcrypt from 'bcrypt'
import { Room, Client, ServerError, CloseCode } from 'colyseus'
import { Dispatcher } from '@colyseus/command'

import { Player, OfficeState, MusicBooth, ChatMessage } from './schema/OfficeState'
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

// ── NPC Constants ──
const NPC_SESSION_ID = 'npc_lily'
const NPC_NAME = 'Lily'
const NPC_CHARACTER_PATH = '/npc/denkiqt'
const NPC_PERSONALITY_ID = 'lily_bartender'
const NPC_SERVICE_URL = process.env.DREAM_NPC_SERVICE_URL || 'http://localhost:4000'

// NPC position in server coordinates (will be converted to world units on client)
// Bar island at world [2.5, 0, -1.5], front faces -X. Bartender corridor: world X ~2.9..4.2, Z ~ -2.8..0.0
// Server coords: X*100 → serverX, -Z*100 → serverY
const NPC_HOME_X = 340 // server px (world X=3.4, center of corridor)
const NPC_HOME_Y = 150 // server px (world Z=-1.5, bar center along Z)
const NPC_WANDER_BOUNDS = { minX: 290, maxX: 410, minY: 10, maxY: 280 }
const NPC_SPEED = 60 // server px/s
const NPC_UPDATE_INTERVAL = 200 // ms
const NPC_CONVO_WINDOW_MS = 20_000 // 20 second conversational window

type NpcState = 'idle' | 'walking' | 'dancing' | 'conversing'

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

  // ── NPC state ──
  private npcUpdateIntervalId: NodeJS.Timeout | null = null
  private npcState: NpcState = 'idle'
  private npcStateTimer = 0 // ms remaining in current state
  private npcTargetX = NPC_HOME_X
  private npcTargetY = NPC_HOME_Y
  private npcLastChatAt = 0 // timestamp of last NPC chat request
  private npcConversationTimeout = 0 // ms remaining before leaving conversation
  private npcChatHistory: { role: string; content: string }[] = [] // recent conversation history
  private npcLastGreetingAt = 0 // timestamp of last greeting (rate-limit greetings)
  private npcResponseQueue: string[] = [] // queued sentence chunks for chunked delivery
  private npcResponseTimer: NodeJS.Timeout | null = null // drains npcResponseQueue
  private npcConversationWindows = new Map<string, number>() // sessionId → timestamp of last exchange with Lily
  private npcRecentChatters: { sessionId: string; at: number }[] = [] // track who's been chatting recently
  private npcOverwhelmedUntil = 0 // timestamp — Lily is overwhelmed and won't respond until this time
  private npcLastMusicSilenceCheck = 0 // timestamp of last "no music" nudge
  private npcMusicSilenceSince = 0 // when silence started (0 = music is playing or not tracked yet)

  private readonly npcGreetings = [
    "hi! I'm Lily. if you need anything just say my name",
    "oh, welcome! I'm Lily~ just call my name if you wanna chat",
    "hey~ I'm Lily, the bartender here. say my name if you need me",
    "oh! hi. I'm Lily. just say \"Lily\" and I'll hear you",
    "welcome~ I'm Lily. call me by name if you want something!",
  ]

  private readonly npcOverwhelmedPhrases = [
    "ah... sorry, there's a lot of people talking... give me a second",
    "oh... I need to catch my breath... one moment",
    "too many voices at once... I'll be back in a bit",
    "s-sorry... I need a little break... just a minute",
  ]

  private readonly npcSuggestMusicPhrases = [
    "it's really quiet in here... someone should put on some music",
    "hmm... this silence is nice but... maybe a song would be good?",
    "does anyone want to play something? the jukebox is right there",
    "I keep thinking about Denki Groove... someone should play something",
    "the bar feels a little empty without music... just saying",
  ]

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

  // ── NPC Methods ──

  private spawnNpc() {
    const npc = new Player()
    npc.name = NPC_NAME
    npc.isNpc = true
    npc.npcCharacterPath = NPC_CHARACTER_PATH
    npc.x = NPC_HOME_X
    npc.y = NPC_HOME_Y
    npc.readyToConnect = true
    npc.connected = true
    this.state.players.set(NPC_SESSION_ID, npc)

    // Start NPC behavior loop
    this.npcState = 'idle'
    this.npcStateTimer = this.randomIdleTime()
    this.npcUpdateIntervalId = setInterval(() => this.updateNpc(), NPC_UPDATE_INTERVAL)

    if (LOG_ENABLED) console.log('[NPC] Lily spawned at', NPC_HOME_X, NPC_HOME_Y)
  }

  private cleanupNpc() {
    if (this.npcUpdateIntervalId) {
      clearInterval(this.npcUpdateIntervalId)
      this.npcUpdateIntervalId = null
    }
    this.stopDrainingNpcQueue()
    this.npcConversationWindows.clear()
    this.state.players.delete(NPC_SESSION_ID)
  }

  /**
   * Called when a new jukebox track starts playing.
   * ~30% chance Lily comments on it unprompted.
   */
  notifyNpcMusicStarted(title: string) {
    if (!this.state.players.has(NPC_SESSION_ID)) return
    if (Math.random() > 0.3) return // 30% chance

    // Small delay so the music announcement settles first
    setTimeout(async () => {
      try {
        const res = await fetch(`${NPC_SERVICE_URL}/bartender/npc-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalityId: NPC_PERSONALITY_ID,
            message: `[SYSTEM]: A new song just started playing: "${title}". React briefly and naturally.`,
            history: this.npcChatHistory.slice(-10),
            roomId: this.roomId,
            musicContext: `Currently playing: "${title}"`,
          }),
          signal: AbortSignal.timeout(8000),
        })

        if (!res.ok) return

        const data = (await res.json()) as { text?: string }
        if (data.text) {
          this.npcChatHistory.push({ role: 'assistant', content: data.text })
          this.broadcastNpcMessage(data.text)
        }
      } catch (e) {
        // Silent fail — spontaneous commentary is optional
        if (LOG_ENABLED) console.log('[NPC] Spontaneous music comment failed:', e)
      }
    }, 2000 + Math.random() * 3000) // 2-5s after track starts
  }

  private randomIdleTime(): number {
    return 3000 + Math.random() * 5000 // 3-8 seconds
  }

  private pickWanderTarget() {
    this.npcTargetX =
      NPC_WANDER_BOUNDS.minX + Math.random() * (NPC_WANDER_BOUNDS.maxX - NPC_WANDER_BOUNDS.minX)
    this.npcTargetY =
      NPC_WANDER_BOUNDS.minY + Math.random() * (NPC_WANDER_BOUNDS.maxY - NPC_WANDER_BOUNDS.minY)
  }

  private updateNpc() {
    const npc = this.state.players.get(NPC_SESSION_ID)
    if (!npc) return

    const dt = NPC_UPDATE_INTERVAL // ms per tick
    const isMusicPlaying =
      this.state.musicStream.status === 'playing' &&
      this.state.musicStream.currentLink !== null &&
      !this.state.musicStream.isAmbient

    // ── State transitions ──

    // Music started → dance (unless conversing)
    if (isMusicPlaying && this.npcState !== 'dancing' && this.npcState !== 'conversing') {
      this.npcState = 'dancing'
      this.npcStateTimer = 30000 // dance for 30s before brief pause
    }

    // Music stopped while dancing → idle
    if (!isMusicPlaying && this.npcState === 'dancing') {
      this.npcState = 'idle'
      this.npcStateTimer = this.randomIdleTime()
    }

    // Conversation timeout
    if (this.npcState === 'conversing') {
      this.npcConversationTimeout -= dt
      if (this.npcConversationTimeout <= 0) {
        // Return to previous state
        this.npcState = isMusicPlaying ? 'dancing' : 'idle'
        this.npcStateTimer = isMusicPlaying ? 30000 : this.randomIdleTime()
      }
    }

    // ── State behaviors ──
    switch (this.npcState) {
      case 'idle': {
        this.npcStateTimer -= dt
        if (this.npcStateTimer <= 0) {
          // Start wandering
          this.pickWanderTarget()
          this.npcState = 'walking'
        }
        break
      }

      case 'walking': {
        const dx = this.npcTargetX - npc.x
        const dy = this.npcTargetY - npc.y
        const dist = Math.hypot(dx, dy)
        const step = (NPC_SPEED * dt) / 1000

        if (dist <= step) {
          // Arrived
          npc.x = this.npcTargetX
          npc.y = this.npcTargetY
          this.npcState = isMusicPlaying ? 'dancing' : 'idle'
          this.npcStateTimer = isMusicPlaying ? 30000 : this.randomIdleTime()
        } else {
          // Move toward target
          npc.x += (dx / dist) * step
          npc.y += (dy / dist) * step
        }
        break
      }

      case 'dancing': {
        this.npcStateTimer -= dt
        if (this.npcStateTimer <= 0 && isMusicPlaying) {
          // Brief idle pause then resume dancing
          this.npcState = 'idle'
          this.npcStateTimer = 2000 + Math.random() * 3000 // 2-5s pause
        }
        // Small random jitter for "dancing in place" feel
        npc.x += (Math.random() - 0.5) * 0.5
        npc.y += (Math.random() - 0.5) * 0.5
        // Clamp to bounds
        npc.x = Math.max(NPC_WANDER_BOUNDS.minX, Math.min(NPC_WANDER_BOUNDS.maxX, npc.x))
        npc.y = Math.max(NPC_WANDER_BOUNDS.minY, Math.min(NPC_WANDER_BOUNDS.maxY, npc.y))
        break
      }

      case 'conversing': {
        // Stay in place, face toward player (no movement)
        break
      }
    }

    // ── Music silence nudge ──
    // If no music has been playing for a while and there are humans present, suggest music
    const now = Date.now()
    if (isMusicPlaying) {
      this.npcMusicSilenceSince = 0 // reset when music is playing
    } else {
      if (this.npcMusicSilenceSince === 0) {
        this.npcMusicSilenceSince = now // start tracking silence
      }
      const silenceDuration = now - this.npcMusicSilenceSince
      // After 2 minutes of silence, nudge every 3 minutes (max ~once per 3m)
      if (
        silenceDuration > 120_000 &&
        now - this.npcLastMusicSilenceCheck > 180_000 &&
        this.getHumanPlayerCount() > 0 &&
        this.npcState !== 'conversing' &&
        now >= this.npcOverwhelmedUntil
      ) {
        this.npcLastMusicSilenceCheck = now
        const phrase = this.npcSuggestMusicPhrases[Math.floor(Math.random() * this.npcSuggestMusicPhrases.length)]
        this.broadcastNpcMessage(phrase)
      }
    }
  }

  /** Count human (non-NPC) players in the room */
  private getHumanPlayerCount(): number {
    let count = 0
    this.state.players.forEach((p) => {
      if (!p.isNpc) count++
    })
    return count
  }

  /** Route a chat message to the NPC if addressed to her */
  private async handleNpcChat(senderSessionId: string, content: string) {
    const now = Date.now()

    // Rate limit: 1 request per 2 seconds
    if (now - this.npcLastChatAt < 2000) return
    this.npcLastChatAt = now

    // ── Overwhelm check: if Lily is taking a break, silently ignore ──
    if (now < this.npcOverwhelmedUntil) return

    // Track recent chatters (sliding 30s window)
    this.npcRecentChatters = this.npcRecentChatters.filter((c) => now - c.at < 30_000)
    // Only add if this player isn't already in the recent list
    if (!this.npcRecentChatters.some((c) => c.sessionId === senderSessionId)) {
      this.npcRecentChatters.push({ sessionId: senderSessionId, at: now })
    }
    // Count unique chatters in last 30s
    const uniqueChatters = new Set(this.npcRecentChatters.map((c) => c.sessionId)).size
    if (uniqueChatters > 3) {
      // Lily is overwhelmed — announce break and pause for 30s
      const phrase = this.npcOverwhelmedPhrases[Math.floor(Math.random() * this.npcOverwhelmedPhrases.length)]
      this.broadcastNpcMessage(phrase)
      this.npcOverwhelmedUntil = now + 30_000
      this.npcRecentChatters = [] // reset so the window starts fresh after break
      return
    }

    // Interrupt any pending chunked response queue
    this.stopDrainingNpcQueue()

    // Strip "lily," or "lily " prefix
    const lilyPrefixMatch = content.match(/^lily[,\s]+/i)
    const actualMessage = lilyPrefixMatch ? content.slice(lilyPrefixMatch[0].length).trim() : content

    if (!actualMessage) return

    // Enter conversing state
    this.npcState = 'conversing'
    this.npcConversationTimeout = 15000 // 15 seconds

    // Multi-player attribution: tag message with sender name
    const senderName = this.state.players.get(senderSessionId)?.name || 'someone'
    const taggedMessage = `[${senderName}]: ${actualMessage}`

    // Add to conversation history (with attribution)
    this.npcChatHistory.push({ role: 'user', content: taggedMessage })
    // Keep last 25 messages (Gemini 2.5 Flash-Lite has 1M token context — 25 msgs is trivial)
    if (this.npcChatHistory.length > 25) {
      this.npcChatHistory = this.npcChatHistory.slice(-25)
    }

    // Build music context — always send explicit state so model never hallucinates music
    let musicContext: string
    const ms = this.state.musicStream
    if (ms.status === 'playing' && ms.currentTitle && !ms.isAmbient) {
      musicContext = `Currently playing: "${ms.currentTitle}". You can hear this in the background. Comment on it only if relevant.`
    } else {
      musicContext = 'No music is playing right now. The bar is quiet.'
    }

    try {
      const res = await fetch(`${NPC_SERVICE_URL}/bartender/npc-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalityId: NPC_PERSONALITY_ID,
          message: actualMessage,
          history: this.npcChatHistory.slice(0, -1), // don't include current message (it's sent separately)
          roomId: this.roomId,
          senderName,
          musicContext,
        }),
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        console.error('[NPC] Chat service error:', res.status)
        this.sendNpcFallbackMessage()
        return
      }

      const data = (await res.json()) as { text?: string; error?: string }
      const text = data.text

      if (text) {
        // Store FULL text in history (not chunks)
        this.npcChatHistory.push({ role: 'assistant', content: text })
        // Split into sentence chunks and deliver with delays
        const chunks = this.splitIntoChunks(text)
        if (chunks.length <= 1) {
          // Single sentence — send immediately
          this.broadcastNpcMessage(text)
        } else {
          // Multiple sentences — queue for chunked delivery
          this.npcResponseQueue = chunks
          this.startDrainingNpcQueue()
        }
      } else {
        this.sendNpcFallbackMessage()
      }

      // Set/refresh conversational window for this player (whether response or fallback)
      this.npcConversationWindows.set(senderSessionId, Date.now())
    } catch (e) {
      console.error('[NPC] Chat service call failed:', e)
      this.sendNpcFallbackMessage()
      // Still set window on error — they tried to talk
      this.npcConversationWindows.set(senderSessionId, Date.now())
    }
  }

  /** Split text into sentence chunks for natural delivery */
  private splitIntoChunks(text: string): string[] {
    const parts: string[] = []
    // Split on sentence-ending punctuation, keeping punctuation with sentence
    const regex = /[^.!?…]*(?:[.!?]+|\.{3}|…)\s*/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const chunk = match[0].trim()
      if (chunk) parts.push(chunk)
    }
    // If regex didn't match (no sentence-ending punct), return whole text
    if (parts.length === 0) return [text.trim()]
    // Check if there's leftover text after the last match
    const joined = parts.join(' ')
    const leftover = text.slice(text.lastIndexOf(parts[parts.length - 1]) + parts[parts.length - 1].length).trim()
    if (leftover) parts.push(leftover)
    return parts
  }

  /**
   * Calculate delay before sending the NEXT chunk, based on the chunk just sent.
   * Bubble has maxWidth ~0.6 world units at fontSize 0.064–0.09.
   * Roughly fits ~18–22 chars per line, and BUBBLE_DURATION is 5000ms.
   * We need to wait long enough that the previous bubble is mostly read
   * before the next one arrives and pushes the stack.
   *
   * Formula: 4s base + 55ms per character, clamped 4s–7s
   */
  private chunkDelay(sentChunk: string): number {
    const len = sentChunk.length
    const delay = 4000 + len * 55
    return Math.max(4000, Math.min(delay, 7000))
  }

  /** Start draining the NPC response queue, sending one chunk at a time */
  private startDrainingNpcQueue() {
    if (this.npcResponseQueue.length === 0) return
    // Send first chunk immediately
    const first = this.npcResponseQueue.shift()!
    this.broadcastNpcMessage(first)

    if (this.npcResponseQueue.length === 0) return

    // Schedule next chunk with dynamic delay based on text length of chunk just sent
    this.scheduleNextChunk(first)
  }

  /** Schedule the next chunk delivery with a delay proportional to the previous chunk's length */
  private scheduleNextChunk(previousChunk: string) {
    if (this.npcResponseQueue.length === 0) {
      this.npcResponseTimer = null
      return
    }

    const delay = this.chunkDelay(previousChunk)
    this.npcResponseTimer = setTimeout(() => {
      if (this.npcResponseQueue.length === 0) {
        this.npcResponseTimer = null
        return
      }
      const chunk = this.npcResponseQueue.shift()!
      this.broadcastNpcMessage(chunk)
      this.scheduleNextChunk(chunk)
    }, delay)
  }

  /** Stop draining and clear the response queue (e.g., on interruption) */
  private stopDrainingNpcQueue() {
    if (this.npcResponseTimer) {
      clearTimeout(this.npcResponseTimer)
      this.npcResponseTimer = null
    }
    this.npcResponseQueue = []
  }

  private broadcastNpcMessage(content: string) {
    // Store in chat messages schema (for late joiners)
    const chatMessages = this.state.chatMessages
    if (chatMessages.length >= 100) chatMessages.shift()
    const msg = new ChatMessage()
    msg.author = NPC_NAME
    msg.content = content
    chatMessages.push(msg)

    // Broadcast to ALL clients (NPC messages go to everyone including the sender)
    this.broadcast(Message.ADD_CHAT_MESSAGE, {
      clientId: NPC_SESSION_ID,
      content,
    })
  }

  private readonly npcFallbackPhrases = [
    'oh... sorry, I spaced out for a second there',
    'hmm? oh, I was just thinking about something...',
    '...',
    "it's quiet tonight... I like it though",
    "I'm still learning how Earth drinks work honestly...",
    'some nights I just listen to the glasses clink...',
  ]

  private sendNpcFallbackMessage() {
    const phrase =
      this.npcFallbackPhrases[Math.floor(Math.random() * this.npcFallbackPhrases.length)]
    this.broadcastNpcMessage(phrase)
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

    // Spawn NPC bartender for jukebox rooms
    if (this.musicMode === 'jukebox') {
      this.spawnNpc()
    }

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

      // ── NPC chat routing ──
      // Check if message is addressed to Lily (prefix "lily," or "lily ") or if player is alone with her
      // or if player is in a conversational window (recently talked to Lily)
      if (this.state.players.has(NPC_SESSION_ID)) {
        const content = message.content.trim()
        const addressedToLily = /^lily[,\s]/i.test(content)
        const isAloneWithNpc = this.getHumanPlayerCount() === 1
        const lastConvo = this.npcConversationWindows.get(client.sessionId) ?? 0
        const inConvoWindow = (Date.now() - lastConvo) < NPC_CONVO_WINDOW_MS

        if (addressedToLily || isAloneWithNpc || inConvoWindow) {
          // Fire and forget — response will be broadcast asynchronously
          this.handleNpcChat(client.sessionId, content).catch((e) =>
            console.error('[NPC] Chat error:', e)
          )
        }
      }
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

    // ── NPC greeting on player join ──
    if (this.musicMode === 'jukebox' && this.state.players.has(NPC_SESSION_ID)) {
      const now = Date.now()
      // Rate-limit greetings to 1 per 15 seconds (avoid spam on multi-join)
      if (now - this.npcLastGreetingAt > 15_000) {
        this.npcLastGreetingAt = now
        const delay = 1500 + Math.random() * 1500 // 1.5–3s randomized delay
        const greetingSessionId = client.sessionId
        setTimeout(() => {
          // Verify player is still connected before sending
          if (this.state.players.has(greetingSessionId)) {
            const greeting = this.npcGreetings[Math.floor(Math.random() * this.npcGreetings.length)]
            this.broadcastNpcMessage(greeting)
          }
        }, delay)
      }
    }
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
    this.npcConversationWindows.delete(client.sessionId)

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

    this.cleanupNpc()
    this.clearTrackWatchdog()
    this.stopMusicStreamTickIfNeeded()
    this.dispatcher.stop()
  }
}
