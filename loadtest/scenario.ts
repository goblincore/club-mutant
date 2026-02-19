/**
 * Club Mutant — Main load test scenario
 *
 * Simulates players joining the public room, walking around randomly,
 * chatting, and jumping. Uses @colyseus/loadtest's cli() for a live
 * terminal dashboard.
 *
 * Usage:
 *   npx tsx scenario.ts --room clubmutant --numClients 20 --endpoint ws://localhost:2567 --delay 100
 */

// Side-effect import: patches globalThis.fetch to use credentials:'omit'.
// Must be the FIRST import — executed before @colyseus/sdk loads.
// See patch-fetch.ts for details on why this is needed.
import './patch-fetch'

import { Client, Room } from '@colyseus/sdk'
import { cli, Options } from '@colyseus/loadtest'
import { Message } from '@club-mutant/types/Messages'

// --- Configuration -----------------------------------------------------------

/** Interval between position updates (ms). Must be > 100ms server throttle. */
const MOVE_INTERVAL_MS = 110

/** Pixels moved per update tick. At 110ms interval = ~91 px/sec (under 240 limit). */
const MOVE_STEP_PX = 10

/** How often a bot changes walking direction (ms range). */
const DIRECTION_CHANGE_MIN_MS = 1000
const DIRECTION_CHANGE_MAX_MS = 3000

/** How often a bot sends a chat message (ms range). */
const CHAT_MIN_MS = 10_000
const CHAT_MAX_MS = 30_000

/** How often a bot jumps (ms range). */
const JUMP_MIN_MS = 5_000
const JUMP_MAX_MS = 15_000

/** Room coordinate bounds (server clamps to ±580). */
const BOUNDS = 560 // stay slightly inside to avoid edge clamping

/** Chat messages bots will randomly pick from. */
const CHAT_MESSAGES = [
  'hey everyone',
  'vibes',
  'nice track',
  'lol',
  'anyone else here?',
  'love this place',
  'bump',
  ':)',
  'testing 1 2 3',
  'beep boop',
]

// --- Helpers -----------------------------------------------------------------

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Returns a random unit-vector direction { dx, dy }. */
function randomDirection(): { dx: number; dy: number } {
  const angle = Math.random() * Math.PI * 2
  return { dx: Math.cos(angle), dy: Math.sin(angle) }
}

// --- Scenario ----------------------------------------------------------------

async function main(options: Options) {
  const client = new Client(options.endpoint)

  const clientId = options.clientId ?? 0
  const textureId = clientId % 10 // spread across 10 character textures
  const playerId = `bot-${clientId}-${Date.now().toString(36)}`

  let room: Room
  try {
    room = await client.joinOrCreate(options.roomName || 'clubmutant', {
      name: `loadtest-${clientId}`,
      playerId,
      textureId,
    })
  } catch (err) {
    console.error(`[bot-${clientId}] Failed to join:`, (err as Error).message)
    return
  }

  // Signal ready
  room.send(Message.READY_TO_CONNECT, {})

  // --- Movement state ---
  let x = randRange(-200, 200) // spread spawn positions
  let y = randRange(-200, 200)
  let dir = randomDirection()

  const intervals: ReturnType<typeof setInterval>[] = []
  const timeouts: ReturnType<typeof setTimeout>[] = []

  // Movement loop — send position updates every MOVE_INTERVAL_MS
  const moveInterval = setInterval(() => {
    x = clamp(x + dir.dx * MOVE_STEP_PX, -BOUNDS, BOUNDS)
    y = clamp(y + dir.dy * MOVE_STEP_PX, -BOUNDS, BOUNDS)

    // Bounce off walls
    if (Math.abs(x) >= BOUNDS) dir.dx *= -1
    if (Math.abs(y) >= BOUNDS) dir.dy *= -1

    room.send(Message.UPDATE_PLAYER_ACTION, {
      x,
      y,
      textureId,
    })
  }, MOVE_INTERVAL_MS)
  intervals.push(moveInterval)

  // Direction change — randomly change direction periodically
  function scheduleDirectionChange() {
    const delay = randRange(DIRECTION_CHANGE_MIN_MS, DIRECTION_CHANGE_MAX_MS)
    const t = setTimeout(() => {
      dir = randomDirection()
      scheduleDirectionChange()
    }, delay)
    timeouts.push(t)
  }
  scheduleDirectionChange()

  // Chat loop — send messages at random intervals
  function scheduleChat() {
    const delay = randRange(CHAT_MIN_MS, CHAT_MAX_MS)
    const t = setTimeout(() => {
      room.send(Message.ADD_CHAT_MESSAGE, {
        content: pickRandom(CHAT_MESSAGES),
      })
      scheduleChat()
    }, delay)
    timeouts.push(t)
  }
  scheduleChat()

  // Jump loop — jump at random intervals
  function scheduleJump() {
    const delay = randRange(JUMP_MIN_MS, JUMP_MAX_MS)
    const t = setTimeout(() => {
      room.send(Message.PLAYER_JUMP, {})
      scheduleJump()
    }, delay)
    timeouts.push(t)
  }
  scheduleJump()

  // --- Metrics tracking ---
  let patchCount = 0
  let messageCount = 0

  room.onStateChange(() => {
    patchCount++
  })

  room.onMessage('*', () => {
    messageCount++
  })

  // Log metrics every 10s (useful when running without the cli dashboard)
  const metricsInterval = setInterval(() => {
    console.log(
      `[bot-${clientId}] patches: ${patchCount}, messages: ${messageCount}, pos: (${x.toFixed(0)}, ${y.toFixed(0)})`
    )
    patchCount = 0
    messageCount = 0
  }, 10_000)
  intervals.push(metricsInterval)

  // --- Cleanup ---
  room.onLeave((code) => {
    console.log(`[bot-${clientId}] Left room (code: ${code})`)
    cleanup()
  })

  room.onError((err) => {
    console.error(`[bot-${clientId}] Room error:`, err.message)
  })

  function cleanup() {
    for (const i of intervals) clearInterval(i)
    for (const t of timeouts) clearTimeout(t)
    intervals.length = 0
    timeouts.length = 0
  }
}

// @colyseus/loadtest entry — renders live dashboard, spawns numClients bots
cli(main)
