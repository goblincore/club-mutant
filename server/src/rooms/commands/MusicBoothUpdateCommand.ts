import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import type { ClubMutant } from '../ClubMutant'

type Payload = {
  client: Client
  musicBoothIndex?: number
}

export class MusicBoothConnectUserCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client, musicBoothIndex } = data
    const clientId = client.sessionId

    if (typeof musicBoothIndex !== 'number') return

    const musicBooth = this.state.musicBooths[musicBoothIndex]
    if (!musicBooth) return

    const occupiedCount = musicBooth.connectedUsers.filter((id) => id !== '').length

    if (occupiedCount >= 4) {
      console.log('////MusicBoothConnectUserCommand: booth is full')
      return
    }

    // Check if user is already connected
    if (musicBooth.connectedUsers.includes(clientId)) {
      console.log('////MusicBoothConnectUserCommand: user already connected')
      return
    }

    const emptyIndex = musicBooth.connectedUsers.findIndex((id) => id === '')
    if (emptyIndex < 0) {
      console.log('////MusicBoothConnectUserCommand: no empty slot found')
      return
    }

    musicBooth.connectedUsers.splice(emptyIndex, 1, clientId)
    console.log('////MusicBoothConnect musicboth index', musicBoothIndex)
    console.log(
      '////MusicBoothConnectUserCommand, connectedUsers count:',
      musicBooth.connectedUsers.filter((id) => id !== '').length,
      'users:',
      Array.from(musicBooth.connectedUsers)
    )
  }
}

export class MusicBoothDisconnectUserCommand extends Command<ClubMutant, Payload> {
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

    const userIndex = musicBooth.connectedUsers.findIndex((id) => id === clientId)
    if (userIndex !== -1) {
      musicBooth.connectedUsers.splice(userIndex, 1, '')
      console.log(
        '////MusicBoothDisconnectUserCommand: removed user, remaining:',
        musicBooth.connectedUsers.filter((id) => id !== '').length
      )
    }
  }
}
