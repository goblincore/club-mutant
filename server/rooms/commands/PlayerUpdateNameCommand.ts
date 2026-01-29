import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import type { SkyOffice } from '../SkyOffice'

type Payload = {
  client: Client
  name: string
}

export default class PlayerUpdateNameCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, name } = data

    const player = this.state.players.get(client.sessionId)

    if (!player) return
    player.name = name
  }
}
