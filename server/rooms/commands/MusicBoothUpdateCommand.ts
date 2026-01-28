import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import type { SkyOffice } from '../SkyOffice'

type Payload = {
  client: Client
  musicBoothIndex?: number
}

export class MusicBoothConnectUserCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, musicBoothIndex } = data
    const clientId = client.sessionId

    if (typeof musicBoothIndex !== 'number') return

    const musicBooth = this.state.musicBooths[musicBoothIndex]
    if (!musicBooth) return

    if (musicBooth.connectedUser !== null && musicBooth.connectedUser !== '') return
    musicBooth.connectedUser = clientId
    console.log('////MusicBoothConnect musicboth index', musicBoothIndex)
    console.log(
      '////MusicBoothConnectUserCommand, musicBooth.connectedUser',
      musicBooth.connectedUser
    )
  }
}

export class MusicBoothDisconnectUserCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, musicBoothIndex } = data
    const clientId = client.sessionId

    if (typeof musicBoothIndex !== 'number') return

    const musicBooth = this.state.musicBooths[musicBoothIndex]
    if (!musicBooth) return
    for (let i = this.state.musicBoothQueue.length - 1; i >= 0; i -= 1) {
      if (this.state.musicBoothQueue[i] === musicBoothIndex) {
        this.state.musicBoothQueue.splice(i, 1)
      }
    }
    console.log('////MusicBoothDisconnectUserCommand, musicBooth', musicBooth)
    console.log(
      '////MusicBoothDisconnectUserCommand, this.state.musicQueue',
      this.state.musicBoothQueue
    )

    if (musicBooth.connectedUser === clientId) {
      musicBooth.connectedUser = ''
    }
  }
}
