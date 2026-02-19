import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import type { ClubMutant } from '../ClubMutant'

type Payload = {
  client: Client
  x: number
  y: number
  textureId: number
  animId: number
}

export default class PlayerUpdateActionCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client, x, y, textureId, animId } = data

    const player = this.state.players.get(client.sessionId)

    if (!player) return

    // Dead-zone suppression: skip schema mutation when position hasn't meaningfully changed.
    // This eliminates idle players from Colyseus patch diffs, reducing O(N²) broadcast volume.
    const dx = Math.abs(x - player.x)
    const dy = Math.abs(y - player.y)
    if (dx < 1 && dy < 1 && textureId === player.textureId && animId === player.animId) return

    player.x = x
    player.y = y
    player.textureId = textureId
    player.animId = animId
  }
}
