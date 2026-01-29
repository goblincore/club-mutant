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
    player.x = x
    player.y = y
    player.textureId = textureId
    player.animId = animId
  }
}
