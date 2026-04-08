// client-3d/src/services/messengerService.ts
import type { MessengerService, DmMessage, ConversationSummary } from '../../../packages/konpyuuta/src/types'
import type { ChannelMessage } from '@heroiclabs/nakama-js'
import {
  sendDirectMessage,
  listConversations as nakamaListConversations,
  getDirectMessages,
  markMessagesRead,
  getSocket,
  onNotification,
} from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'

const DM_NOTIFICATION_CODE = 100
const TYPING_DEBOUNCE_MS = 2000
const TYPING_CLEAR_MS = 3000

export function createMessengerService(): MessengerService {
  const messageCallbacks: Array<(msg: DmMessage) => void> = []
  const typingCallbacks: Array<(userId: string, typing: boolean) => void> = []

  // Track joined channels: partnerId → channelId
  const joinedChannels = new Map<string, string>()

  // Typing debounce timers: partnerId → timeout
  const typingDebounce = new Map<string, ReturnType<typeof setTimeout>>()

  // Typing clear timers: partnerId → timeout (auto-clear after silence)
  const typingClearTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // Unsubscribe functions for cleanup
  let unsubNotification: (() => void) | null = null

  const service: MessengerService = {
    async sendMessage(recipientId: string, body: string) {
      return sendDirectMessage(recipientId, 'dm', body)
    },

    async getMessages(partnerId: string, cursor?: string) {
      const result = await getDirectMessages(partnerId, cursor)
      const messages: DmMessage[] = (result.messages || []).map((m) => ({
        messageId: m.messageId,
        senderId: m.senderId,
        senderUsername: m.senderUsername,
        body: m.body,
        createdAt: m.createdAt,
      }))
      return { messages, cursor: result.cursor }
    },

    async listConversations() {
      const result = await nakamaListConversations()
      return result.conversations || []
    },

    async markRead(partnerId: string) {
      await markMessagesRead(partnerId)
    },

    onMessageReceived(cb: (msg: DmMessage) => void) {
      messageCallbacks.push(cb)
      return () => {
        const idx = messageCallbacks.indexOf(cb)
        if (idx >= 0) messageCallbacks.splice(idx, 1)
      }
    },

    onTypingIndicator(cb: (userId: string, typing: boolean) => void) {
      typingCallbacks.push(cb)
      return () => {
        const idx = typingCallbacks.indexOf(cb)
        if (idx >= 0) typingCallbacks.splice(idx, 1)
      }
    },

    async joinConversationChannel(partnerId: string) {
      if (joinedChannels.has(partnerId)) return
      const socket = getSocket()
      if (!socket) {
        console.warn('[messenger] Cannot join channel — socket not connected')
        return
      }
      try {
        // Type 2 = Direct Message channel in Nakama; persistence=false, hidden=true
        const channel = await socket.joinChat(partnerId, 2, false, true)
        joinedChannels.set(partnerId, channel.id)
        console.log('[messenger] Joined DM channel with %s: %s', partnerId, channel.id)
      } catch (err) {
        console.warn('[messenger] Failed to join DM channel:', err)
      }
    },

    sendTypingIndicator(partnerId: string) {
      const channelId = joinedChannels.get(partnerId)
      if (!channelId) return

      // Debounce: only send once per TYPING_DEBOUNCE_MS
      if (typingDebounce.has(partnerId)) return
      typingDebounce.set(partnerId, setTimeout(() => {
        typingDebounce.delete(partnerId)
      }, TYPING_DEBOUNCE_MS))

      const socket = getSocket()
      if (!socket) return
      socket.writeChatMessage(channelId, { type: 'typing' }).catch((err: unknown) => {
        console.warn('[messenger] Failed to send typing indicator:', err)
      })
    },

    connect() {
      // Listen for DM notifications (new messages from other users)
      unsubNotification = onNotification((notification) => {
        if (notification.code !== DM_NOTIFICATION_CODE) return
        const data = notification.content as {
          messageId: string
          senderId: string
          senderUsername: string
          subject: string
          preview: string
        }
        const msg: DmMessage = {
          messageId: data.messageId,
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          body: data.preview, // notification only has preview, full body loaded on conversation open
          createdAt: Date.now(),
        }
        for (const cb of messageCallbacks) {
          try { cb(msg) } catch (err) { console.warn('[messenger] Message callback error:', err) }
        }
      })

      // Listen for channel messages (typing indicators)
      const socket = getSocket()
      if (socket) {
        socket.onchannelmessage = (message: ChannelMessage) => {
          const content = message.content as { type?: string } | undefined
          if (content?.type !== 'typing') return

          const myUserId = useAuthStore.getState().userId
          if (message.sender_id === myUserId) return

          // Find partnerId from channelId
          let partnerId: string | null = null
          for (const [pid, cid] of joinedChannels) {
            if (cid === message.channel_id) {
              partnerId = pid
              break
            }
          }
          if (!partnerId) return

          // Notify typing=true
          for (const cb of typingCallbacks) {
            try { cb(partnerId, true) } catch (err) { console.warn('[messenger] Typing callback error:', err) }
          }

          // Auto-clear typing after TYPING_CLEAR_MS
          const existingTimer = typingClearTimers.get(partnerId)
          if (existingTimer) clearTimeout(existingTimer)
          const capturedPartnerId = partnerId // capture for closure
          typingClearTimers.set(capturedPartnerId, setTimeout(() => {
            typingClearTimers.delete(capturedPartnerId)
            for (const cb of typingCallbacks) {
              try { cb(capturedPartnerId, false) } catch (err) { console.warn('[messenger] Typing callback error:', err) }
            }
          }, TYPING_CLEAR_MS))
        }
      }

      console.log('[messenger] Service connected — listening for notifications and channel messages')
    },

    disconnect() {
      // Unsubscribe notification listener
      if (unsubNotification) {
        unsubNotification()
        unsubNotification = null
      }

      // Clear channel message handler
      const socket = getSocket()
      if (socket) {
        socket.onchannelmessage = () => {}
      }

      // Leave all channels
      for (const [, channelId] of joinedChannels) {
        if (socket) {
          socket.leaveChat(channelId).catch(() => {})
        }
      }
      joinedChannels.clear()

      // Clear all timers
      for (const timer of typingDebounce.values()) clearTimeout(timer)
      typingDebounce.clear()
      for (const timer of typingClearTimers.values()) clearTimeout(timer)
      typingClearTimers.clear()

      // Clear callbacks
      messageCallbacks.length = 0
      typingCallbacks.length = 0

      console.log('[messenger] Service disconnected')
    },
  }

  return service
}
