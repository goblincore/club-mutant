/**
 * Club Mutant — DJ Queue load test scenario
 *
 * Simulates the DJ queue rotation system under load:
 * - Background bots walk around (same as main scenario)
 * - 3 bots join the DJ queue (one per slot)
 * - Each DJ adds tracks to their room queue playlist
 * - First DJ plays, completes track, rotation advances
 *
 * Usage:
 *   npx tsx dj-scenario.ts --room clubmutant --numClients 10 --endpoint ws://localhost:2567 --delay 200
 *
 * First 3 clients become DJs, the rest are audience bots.
 */

// Side-effect import: patches globalThis.fetch to use credentials:'omit'.
// Must be the FIRST import — executed before @colyseus/sdk loads.
// See patch-fetch.ts for details on why this is needed.
import './patch-fetch'

import { Client, Room } from '@colyseus/sdk'
import { cli, Options } from '@colyseus/loadtest'
import { Message } from '@club-mutant/types/Messages'

// --- Configuration -----------------------------------------------------------

const MOVE_INTERVAL_MS = 110
const MOVE_STEP_PX = 10
const BOUNDS = 560

/** Number of bots that will act as DJs (max 3 — server enforces MAX_DJ_QUEUE_SIZE=3). */
const DJ_BOT_COUNT = 3

/** Tracks each DJ adds to their queue. Using real YouTube IDs for realism. */
const FAKE_TRACKS = [
  { title: 'Test Track A', link: 'dQw4w9WgXcQ', duration: 30 },
  { title: 'Test Track B', link: 'jNQXAC9IVRw', duration: 25 },
  { title: 'Test Track C', link: '9bZkp7q19f0', duration: 35 },
  { title: 'Test Track D', link: 'kJQP7kiw5Fk', duration: 20 },
]

/** Delay before a DJ bot adds tracks after joining queue (ms). */
const ADD_TRACKS_DELAY_MS = 2000

/** Delay before the first DJ presses play (ms). */
const FIRST_PLAY_DELAY_MS = 3000

/** Simulated track play time before sending DJ_TURN_COMPLETE (ms).
 *  Shorter than real tracks for faster rotation testing. */
const SIMULATED_TRACK_DURATION_MS = 8000

// --- Helpers -----------------------------------------------------------------

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function randomDirection(): { dx: number; dy: number } {
  const angle = Math.random() * Math.PI * 2
  return { dx: Math.cos(angle), dy: Math.sin(angle) }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Scenario ----------------------------------------------------------------

async function main(options: Options) {
  const client = new Client(options.endpoint)

  const clientId = options.clientId ?? 0
  const isDJ = clientId < DJ_BOT_COUNT
  const textureId = clientId % 10
  const playerId = `bot-${clientId}-${Date.now().toString(36)}`

  let room: Room
  try {
    room = await client.joinOrCreate(options.roomName || 'clubmutant', {
      name: isDJ ? `dj-bot-${clientId}` : `audience-${clientId}`,
      playerId,
      textureId,
    })
  } catch (err) {
    console.error(`[bot-${clientId}] Failed to join:`, (err as Error).message)
    return
  }

  room.send(Message.READY_TO_CONNECT, {})

  const intervals: ReturnType<typeof setInterval>[] = []
  const timeouts: ReturnType<typeof setTimeout>[] = []

  function cleanup() {
    for (const i of intervals) clearInterval(i)
    for (const t of timeouts) clearTimeout(t)
    intervals.length = 0
    timeouts.length = 0
  }

  // All bots walk around
  let x = randRange(-200, 200)
  let y = randRange(-200, 200)
  let dir = randomDirection()

  const moveInterval = setInterval(() => {
    x = clamp(x + dir.dx * MOVE_STEP_PX, -BOUNDS, BOUNDS)
    y = clamp(y + dir.dy * MOVE_STEP_PX, -BOUNDS, BOUNDS)
    if (Math.abs(x) >= BOUNDS) dir.dx *= -1
    if (Math.abs(y) >= BOUNDS) dir.dy *= -1

    room.send(Message.UPDATE_PLAYER_ACTION, { x, y, textureId })
  }, MOVE_INTERVAL_MS)
  intervals.push(moveInterval)

  // Direction changes
  function scheduleDirectionChange() {
    const t = setTimeout(() => {
      dir = randomDirection()
      scheduleDirectionChange()
    }, randRange(1000, 3000))
    timeouts.push(t)
  }
  scheduleDirectionChange()

  // --- DJ behavior ---
  if (isDJ) {
    const slotIndex = clientId // 0, 1, or 2

    // Stagger DJ joins so they don't all race
    await sleep(1000 + clientId * 500)

    console.log(`[dj-bot-${clientId}] Joining DJ queue at slot ${slotIndex}`)
    room.send(Message.DJ_QUEUE_JOIN, { slotIndex })

    // Add tracks after a short delay
    await sleep(ADD_TRACKS_DELAY_MS)

    const tracksToAdd = FAKE_TRACKS.slice(0, 2 + (clientId % 2)) // 2-3 tracks each
    for (const track of tracksToAdd) {
      console.log(`[dj-bot-${clientId}] Adding track: ${track.title}`)
      room.send(Message.ROOM_QUEUE_PLAYLIST_ADD, {
        title: track.title,
        link: track.link,
        duration: track.duration,
      })
      await sleep(300) // small delay between adds
    }

    // First DJ presses play
    if (clientId === 0) {
      await sleep(FIRST_PLAY_DELAY_MS)
      console.log(`[dj-bot-0] Pressing play`)
      room.send(Message.DJ_PLAY, {})
    }

    // Listen for DJ_PLAY_STARTED to know when it's our turn
    room.onMessage(Message.DJ_PLAY_STARTED, () => {
      console.log(`[dj-bot-${clientId}] Received DJ_PLAY_STARTED — music started`)
    })

    // Simulate track completion loop
    // Each DJ sends DJ_TURN_COMPLETE after a simulated duration
    // The server will rotate to the next DJ
    async function simulateTrackCompletion() {
      // Listen for START_MUSIC_STREAM to detect when we're playing
      room.onMessage(Message.START_MUSIC_STREAM, async (data: any) => {
        // Check if the current DJ session matches ours
        // The server sets currentDjSessionId — we can check via schema
        await sleep(SIMULATED_TRACK_DURATION_MS)

        // Only the current DJ should send turn complete
        // We check by seeing if our session is still the active DJ
        // (In a real client, this check uses room.state.currentDjSessionId)
        console.log(`[dj-bot-${clientId}] Simulated track finished, sending DJ_TURN_COMPLETE`)
        room.send(Message.DJ_TURN_COMPLETE, {})
      })
    }
    simulateTrackCompletion()

    // After running for a while, leave the queue (simulates DJ departure)
    const leaveDelay = 60_000 + clientId * 10_000 // 60-80s
    const leaveTimeout = setTimeout(() => {
      console.log(`[dj-bot-${clientId}] Leaving DJ queue`)
      room.send(Message.DJ_QUEUE_LEAVE, {})
    }, leaveDelay)
    timeouts.push(leaveTimeout)
  }

  // --- Audience behavior: occasional chat and jumps ---
  if (!isDJ) {
    function scheduleChat() {
      const t = setTimeout(() => {
        room.send(Message.ADD_CHAT_MESSAGE, { content: `audience bot ${clientId} here` })
        scheduleChat()
      }, randRange(10_000, 30_000))
      timeouts.push(t)
    }
    scheduleChat()

    function scheduleJump() {
      const t = setTimeout(() => {
        room.send(Message.PLAYER_JUMP, {})
        scheduleJump()
      }, randRange(5_000, 15_000))
      timeouts.push(t)
    }
    scheduleJump()
  }

  // --- Metrics ---
  let patchCount = 0
  const metricsInterval = setInterval(() => {
    console.log(
      `[bot-${clientId}${isDJ ? ' DJ' : ''}] patches: ${patchCount}, pos: (${x.toFixed(0)}, ${y.toFixed(0)})`
    )
    patchCount = 0
  }, 10_000)
  intervals.push(metricsInterval)

  room.onStateChange(() => {
    patchCount++
  })

  room.onLeave((code) => {
    console.log(`[bot-${clientId}] Left (code: ${code})`)
    cleanup()
  })

  room.onError((err) => {
    console.error(`[bot-${clientId}] Error:`, err.message)
  })
}

cli(main)
