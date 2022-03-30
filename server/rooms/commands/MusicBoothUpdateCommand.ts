import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState } from '../../../types/IOfficeState'

type Payload = {
  client: Client
  musicBoothIndex?: number
}

export class MusicBoothConnectUserCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, musicBoothIndex } = data
    const clientId = client.sessionId
    const musicBooth = this.room.state.musicBooths[musicBoothIndex]
    console.log('///////////////MusicBoothConnectUserCommand, musicBooth.connectedUser', musicBooth.connectedUser)

    if (musicBooth.connectedUser !== null) return
    musicBooth.connectedUser = clientId
  }
}

export class MusicBoothDisconnectUserCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, musicBoothIndex } = data
    const clientId = client.sessionId
    const musicBooth = this.state.musicBooths[musicBoothIndex]
    console.log('///////////////MusicBoothDisconnectUserCommand, musicBooth', musicBooth)

    if (musicBooth.connectedUser === clientId) {
      musicBooth.connectedUser = null
    }
  }
}
