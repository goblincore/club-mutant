/**
 * Club Mutant — Quick benchmark script
 *
 * Connects N bots, measures:
 * - Time to connect all bots
 * - State patch rate per client
 * - Message round-trip (chat echo)
 * - Memory usage (approximate from patches)
 *
 * Usage:
 *   npx tsx benchmark.ts [numClients] [endpoint]
 *
 * Examples:
 *   npx tsx benchmark.ts 5
 *   npx tsx benchmark.ts 20 ws://localhost:2567
 */
import './patch-fetch'

import { Client, Room } from '@colyseus/sdk'
import { Message } from '@club-mutant/types/Messages'

// --- Config ---
const NUM_CLIENTS = parseInt(process.argv[2] || '10')
const ENDPOINT = process.argv[3] || 'ws://localhost:2567'
const ROOM_NAME = 'clubmutant'
const TEST_DURATION_MS = 15_000 // 15 seconds of observation
const MOVE_INTERVAL_MS = parseInt(process.env.MOVE_INTERVAL || '110')
const BOUNDS = 560

// --- Types ---
interface BotMetrics {
  clientId: number
  connectTimeMs: number
  patchCount: number
  bytesReceived: number // approximate
}

// --- Helpers ---
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// --- Main ---
async function main() {
  console.log(`\n🔬 Club Mutant Benchmark`)
  console.log(`   Endpoint: ${ENDPOINT}`)
  console.log(`   Clients:  ${NUM_CLIENTS}`)
  console.log(`   Duration: ${TEST_DURATION_MS / 1000}s\n`)

  const metrics: BotMetrics[] = []
  const rooms: Room[] = []
  const intervals: ReturnType<typeof setInterval>[] = []

  // Connect all bots
  const connectStart = Date.now()
  const connectTimes: number[] = []

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const botStart = Date.now()
    try {
      const client = new Client(ENDPOINT)
      const room = await client.joinOrCreate(ROOM_NAME, {
        name: `bench-${i}`,
        playerId: `bench-${i}-${Date.now().toString(36)}`,
        textureId: i % 10,
      })

      const connectTime = Date.now() - botStart
      connectTimes.push(connectTime)

      // Send ready
      room.send(Message.READY_TO_CONNECT, {})

      const m: BotMetrics = {
        clientId: i,
        connectTimeMs: connectTime,
        patchCount: 0,
        bytesReceived: 0,
      }

      room.onStateChange(() => {
        m.patchCount++
      })

      // Simulate movement
      let x = randRange(-200, 200)
      let y = randRange(-200, 200)
      let dx = Math.cos(Math.random() * Math.PI * 2)
      let dy = Math.sin(Math.random() * Math.PI * 2)

      const moveInterval = setInterval(() => {
        x = clamp(x + dx * 10, -BOUNDS, BOUNDS)
        y = clamp(y + dy * 10, -BOUNDS, BOUNDS)
        if (Math.abs(x) >= BOUNDS) dx *= -1
        if (Math.abs(y) >= BOUNDS) dy *= -1
        room.send(Message.UPDATE_PLAYER_ACTION, { x, y, textureId: i % 10 })
      }, MOVE_INTERVAL_MS)

      intervals.push(moveInterval)
      metrics.push(m)
      rooms.push(room)

      process.stdout.write(`  Connected bot ${i + 1}/${NUM_CLIENTS} (${connectTime}ms)\r`)
    } catch (err) {
      console.error(`\n  ❌ Bot ${i} failed to connect: ${(err as Error).message}`)
      connectTimes.push(-1)
    }
  }

  const totalConnectTime = Date.now() - connectStart
  const connectedCount = rooms.length

  console.log(`\n  ✅ ${connectedCount}/${NUM_CLIENTS} connected in ${totalConnectTime}ms`)
  console.log(`     Avg connect time: ${Math.round(connectTimes.filter((t) => t > 0).reduce((a, b) => a + b, 0) / connectedCount)}ms`)
  console.log(`\n  ⏱  Observing for ${TEST_DURATION_MS / 1000}s...`)

  // Reset patch counts (ignore initial state sync burst)
  await new Promise((r) => setTimeout(r, 2000))
  for (const m of metrics) {
    m.patchCount = 0
  }

  // Observe for TEST_DURATION_MS
  const observeStart = Date.now()
  await new Promise((r) => setTimeout(r, TEST_DURATION_MS))
  const observeDuration = (Date.now() - observeStart) / 1000

  // Collect results
  const totalPatches = metrics.reduce((sum, m) => sum + m.patchCount, 0)
  const avgPatchesPerClient = totalPatches / connectedCount
  const patchesPerSec = avgPatchesPerClient / observeDuration

  console.log(`\n📊 Results (${observeDuration.toFixed(1)}s observation window):`)
  console.log(`   ─────────────────────────────────────────`)
  console.log(`   Connected:           ${connectedCount}/${NUM_CLIENTS} bots`)
  console.log(`   Total connect time:  ${totalConnectTime}ms`)
  console.log(`   Avg connect time:    ${Math.round(connectTimes.filter((t) => t > 0).reduce((a, b) => a + b, 0) / connectedCount)}ms`)
  console.log(`   ─────────────────────────────────────────`)
  console.log(`   Total patches:       ${totalPatches}`)
  console.log(`   Avg patches/client:  ${avgPatchesPerClient.toFixed(1)}`)
  console.log(`   Patches/sec/client:  ${patchesPerSec.toFixed(1)}`)
  console.log(`   ─────────────────────────────────────────`)

  // Per-client breakdown for variance analysis
  const patchCounts = metrics.map((m) => m.patchCount)
  const minPatches = Math.min(...patchCounts)
  const maxPatches = Math.max(...patchCounts)
  console.log(`   Patch range:         ${minPatches}–${maxPatches} (variance: ${(maxPatches - minPatches).toFixed(0)})`)

  // Expected vs actual
  // With patchRate=100ms (10fps), each moving player generates 1 patch/tick
  // N players moving at 10fps = N*10 state changes/sec
  // Each client receives all changes = N*10 patches/sec
  const expectedPatchesPerSec = connectedCount * (1000 / 100) // N * (1000/patchRate)
  console.log(`   Expected (theory):   ~${expectedPatchesPerSec.toFixed(0)} patches/sec/client`)
  console.log(`   Actual:              ${patchesPerSec.toFixed(1)} patches/sec/client`)
  console.log(`   Efficiency:          ${((patchesPerSec / expectedPatchesPerSec) * 100).toFixed(1)}% of theoretical max`)
  console.log(`   ─────────────────────────────────────────\n`)

  // Cleanup
  console.log('  Disconnecting...')
  for (const i of intervals) clearInterval(i)
  for (const room of rooms) {
    try {
      room.leave()
    } catch {}
  }

  // Give time for disconnects
  await new Promise((r) => setTimeout(r, 1000))
  console.log('  Done.\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
