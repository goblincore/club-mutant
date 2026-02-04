import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import type { ClubMutant } from '../ClubMutant'
import { ChatMessage } from '../schema/OfficeState'

type Payload = {
  client: Client
  content: string
}

export default class ChatMessageUpdateCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client, content } = data
    const player = this.state.players.get(client.sessionId)
    const chatMessages = this.room.state.chatMessages

    if (!player) return

    if (!chatMessages) return

    /**
     * Only allow server to store a maximum of 100 chat messages:
     * remove the first element before pushing a new one when array length is >= 100
     */
    if (chatMessages.length >= 100) chatMessages.shift()

    const newMessage = new ChatMessage()
    newMessage.author = player.name
    newMessage.content = content
    chatMessages.push(newMessage)
  }
}
