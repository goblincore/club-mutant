import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import type { SkyOffice } from '../SkyOffice'

type Payload = {
  client: Client
  x: number
  y: number
  anim: string
}

export default class PlayerUpdateActionCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, x, y, anim } = data

    const player = this.state.players.get(client.sessionId)

    if (!player) return
    player.x = x
    player.y = y
    player.anim = anim
  }
}
