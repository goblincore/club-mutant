import type { MessengerService, DmMessage, ConversationSummary } from '../../../packages/konpyuuta/src/types'
import {
  sendDirectMessage, listConversations as nakamaListConversations, getDirectMessages,
  markMessagesRead, getSocket, connectSocket, onNotification, onChannelMessage, onSocketChange,
} from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'

export function createMessengerService(): MessengerService {
  const messageCallbacks = new Set<(message: DmMessage) => void>()
  const typingCallbacks = new Set<(userId: string, typing: boolean) => void>()
  const connectionCallbacks = new Set<(connected: boolean) => void>()
  const desiredPartners = new Set<string>()
  const channels = new Map<string, string>()
  const joining = new Map<string, Promise<void>>()
  const debounce = new Map<string, ReturnType<typeof setTimeout>>()
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let cleanup: (() => void) | null = null
  let connected = false
  let generation = 0

  function clearTyping() {
    for (const [partner, timer] of typingTimers) {
      clearTimeout(timer)
      typingCallbacks.forEach((cb) => cb(partner, false))
    }
    typingTimers.clear()
    for (const timer of debounce.values()) clearTimeout(timer)
    debounce.clear()
  }

  const service: MessengerService = {
    sendMessage: (recipientId, body) => sendDirectMessage(recipientId, 'dm', body),
    async getMessages(partnerId, cursor) {
      // Legacy storage is ordered oldest-first across ALL partners. Walk every
      // cursor (even empty filtered pages) before presenting a complete thread.
      // This avoids showing an arbitrary old page as the latest conversation.
      const owner = useAuthStore.getState().userId
      const messages = new Map<string, DmMessage>()
      const seenCursors = new Set<string>()
      let next = cursor
      do {
        const result = await getDirectMessages(partnerId, next)
        if (useAuthStore.getState().userId !== owner) throw new Error('Account changed. Reopen this conversation.')
        for (const m of result.messages ?? []) messages.set(m.messageId, {
          messageId: m.messageId, senderId: m.senderId, senderUsername: m.senderUsername,
          body: m.body, createdAt: m.createdAt,
        })
        next = result.cursor || undefined
        if (next && seenCursors.has(next)) throw new Error('History could not finish loading. Please retry.')
        if (next) seenCursors.add(next)
      } while (next)
      return { messages: [...messages.values()].sort((a, b) => a.createdAt - b.createdAt || a.messageId.localeCompare(b.messageId)) }
    },
    async listConversations() {
      const conversations = new Map<string, ConversationSummary>()
      const seen = new Set<string>()
      let cursor: string | undefined
      do {
        const result = await nakamaListConversations(cursor)
        for (const conversation of result.conversations ?? []) conversations.set(conversation.otherUserId, conversation)
        cursor = result.cursor || undefined
        if (cursor && seen.has(cursor)) throw new Error('Contacts could not finish loading. Please retry.')
        if (cursor) seen.add(cursor)
      } while (cursor)
      return [...conversations.values()].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    },
    markRead: (partnerId) => markMessagesRead(partnerId),
    onMessageReceived(cb) { messageCallbacks.add(cb); return () => { messageCallbacks.delete(cb) } },
    onTypingIndicator(cb) { typingCallbacks.add(cb); return () => { typingCallbacks.delete(cb) } },
    onConnectionChanged(cb) { connectionCallbacks.add(cb); cb(connected); return () => { connectionCallbacks.delete(cb) } },
    async joinConversationChannel(partnerId) {
      desiredPartners.add(partnerId)
      const socket = getSocket()
      if (!socket || channels.has(partnerId)) return
      const pending = joining.get(partnerId)
      if (pending) return pending
      const currentGeneration = generation
      const request = socket.joinChat(partnerId, 2, false, true).then((channel) => {
        if (currentGeneration === generation && socket === getSocket()) channels.set(partnerId, channel.id)
      }).finally(() => { if (joining.get(partnerId) === request) joining.delete(partnerId) })
      joining.set(partnerId, request)
      return request
    },
    sendTypingIndicator(partnerId) {
      const channelId = channels.get(partnerId)
      const socket = getSocket()
      if (!socket || !channelId || debounce.has(partnerId)) return
      debounce.set(partnerId, setTimeout(() => debounce.delete(partnerId), 2000))
      socket.writeChatMessage(channelId, { type: 'typing' }).catch(() => {})
    },
    connect() {
      if (useAuthStore.getState().userId) connectSocket().catch(() => {})
      if (cleanup) return
      const unsubNotification = onNotification((notification) => {
        if (notification.code !== 100) return
        const data = notification.content as Partial<DmMessage> & { preview?: string }
        if (!data || typeof data.messageId !== 'string' || typeof data.senderId !== 'string') return
        const isPreview = typeof data.body !== 'string'
        const message: DmMessage = {
          messageId: data.messageId, senderId: data.senderId, senderUsername: data.senderUsername || 'Friend',
          body: isPreview ? data.preview || '' : data.body!, createdAt: data.createdAt || Date.now(), isPreview,
        }
        messageCallbacks.forEach((cb) => cb(message))
      })
      const unsubChannel = onChannelMessage((message) => {
        if ((message.content as { type?: string } | undefined)?.type !== 'typing' || message.sender_id === useAuthStore.getState().userId) return
        const partner = [...channels].find(([id, channel]) => channel === message.channel_id && id === message.sender_id)?.[0]
        if (!partner) return
        typingCallbacks.forEach((cb) => cb(partner, true))
        const timer = typingTimers.get(partner)
        if (timer) clearTimeout(timer)
        typingTimers.set(partner, setTimeout(() => {
          typingTimers.delete(partner)
          typingCallbacks.forEach((cb) => cb(partner, false))
        }, 3000))
      })
      const unsubSocket = onSocketChange((socket) => {
        generation++
        channels.clear()
        joining.clear()
        clearTyping()
        connected = !!socket
        connectionCallbacks.forEach((cb) => cb(connected))
        if (socket) for (const partner of desiredPartners) service.joinConversationChannel(partner).catch(() => {})
      })
      cleanup = () => { unsubNotification(); unsubChannel(); unsubSocket() }
    },
    disconnect() {
      cleanup?.()
      cleanup = null
      generation++
      const socket = getSocket()
      for (const channelId of channels.values()) socket?.leaveChat(channelId).catch(() => {})
      channels.clear()
      joining.clear()
      desiredPartners.clear()
      clearTyping()
      connected = false
      connectionCallbacks.forEach((cb) => cb(false))
      // UI subscriptions own their lifetimes, including React StrictMode replay.
    },
  }
  return service
}
