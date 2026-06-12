import { Room } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { useGameStore } from '../../stores/gameStore'
import { useChatStore } from '../../stores/chatStore'
import { playNpcTtsAudio } from '../../audio/npcTtsPlayer'

export function wireChatHandlers(room: Room<RoomState>): void {
  // Chat messages (from other players)
  room.onMessage(Message.ADD_CHAT_MESSAGE, (data: { clientId: string; content: string; imageUrl?: string }) => {
    const player = useGameStore.getState().players.get(data.clientId)
    const chatStore = useChatStore.getState()

    chatStore.addMessage({
      id: crypto.randomUUID(),
      author: player?.name ?? data.clientId,
      content: data.content,
      imageUrl: data.imageUrl || undefined,
      createdAt: Date.now(),
    })

    // Show in-world chat bubble
    if (data.clientId) {
      chatStore.setBubble(data.clientId, data.content, data.imageUrl || undefined)
    }
  })

  // NPC TTS audio (base64 WAV from SAPI4)
  room.onMessage(Message.NPC_TTS_AUDIO, (data: { audioBase64: string; durationMs: number }) => {
    if (data.audioBase64) {
      playNpcTtsAudio(data.audioBase64)
    }
  })

  // Chat history (bulk load on join)
  room.onMessage(Message.CHAT_HISTORY, (messages: Array<{ author: string; content: string; imageUrl: string; createdAt: number }>) => {
    const chatStore = useChatStore.getState()
    chatStore.setMessages(
      messages.map((m) => ({
        id: crypto.randomUUID(),
        author: m.author,
        content: m.content,
        imageUrl: m.imageUrl || undefined,
        createdAt: m.createdAt,
      }))
    )
  })
}
