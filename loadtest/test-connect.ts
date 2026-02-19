/**
 * Minimal connection test — isolates the "fetch failed" issue.
 * Run: cd loadtest && npx tsx test-connect.ts
 */
import './patch-fetch'

import { Client } from '@colyseus/sdk'

async function main() {
  // Try both http:// and ws:// endpoints
  for (const endpoint of ['http://localhost:2567', 'ws://localhost:2567']) {
    console.log(`\nTrying endpoint: ${endpoint}`)
    const client = new Client(endpoint)
    try {
      const room = await client.joinOrCreate('clubmutant', {
        name: 'test-bot',
        playerId: 'test-1',
        textureId: 0,
      })
      console.log(`  ✅ Connected! sessionId=${room.sessionId}`)
      room.leave()
    } catch (err) {
      console.log(`  ❌ Failed: ${(err as Error).message}`)
    }
  }
}

main()
