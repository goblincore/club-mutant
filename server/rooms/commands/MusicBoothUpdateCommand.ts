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
    const musicBooth = this.state.musicBooths[musicBoothIndex]

    if (musicBooth.connectedUser !== null) return
    musicBooth.connectedUser = clientId
    console.log('////MusicBoothConnect musicboth index', musicBoothIndex)
    console.log('////MusicBoothConnectUserCommand, musicBooth.connectedUser', musicBooth.connectedUser)
  }
}

export class MusicBoothDisconnectUserCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, musicBoothIndex } = data
    const clientId = client.sessionId
    const musicBooth = this.state.musicBooths[musicBoothIndex]
    this.state.musicBoothQueue = this.state.musicBoothQueue.filter(id => id !== musicBoothIndex)
    console.log('////MusicBoothDisconnectUserCommand, musicBooth', musicBooth)
    console.log('////MusicBoothDisconnectUserCommand, this.state.musicQueue', this.state.musicBoothQueue)

    if (musicBooth.connectedUser === clientId) {
      musicBooth.connectedUser = null
    }
  }
}
