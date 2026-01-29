import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import type { ClubMutant } from '../ClubMutant'

type Payload = {
  client: Client
  name: string
}

export default class PlayerUpdateNameCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client, name } = data

    const player = this.state.players.get(client.sessionId)

    if (!player) return
    player.name = name
  }
}
