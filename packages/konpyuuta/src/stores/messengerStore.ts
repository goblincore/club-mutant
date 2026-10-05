import { create } from 'zustand'

export interface Conversation {
  channelId: string
  userId: string
  username: string
  displayName: string
  online: boolean
  unread: number
  lastMessage?: string
  lastMessageAt?: number
}

export interface Message {
  id: string
  senderId: string
  senderUsername?: string
  content: string
  createdAt: number
  pending?: boolean
  failed?: boolean
  error?: string
  isPreview?: boolean
}

export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map(existing.map((message) => [message.id, message]))
  for (const message of incoming) {
    const previous = byId.get(message.id)
    // An old-server notification preview must never replace the full history body.
    if (message.isPreview && previous && !previous.isPreview) continue
    byId.set(message.id, { ...previous, ...message })
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

const initial = () => ({
  ownerId: null as string | null,
  conversations: [] as Conversation[],
  activeConversationId: null as string | null,
  messages: {} as Record<string, Message[]>,
  typing: {} as Record<string, boolean>,
  drafts: {} as Record<string, string>,
})

interface MessengerStoreState {
  ownerId: string | null
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Record<string, Message[]>
  typing: Record<string, boolean>
  drafts: Record<string, string>
  resetForUser: (userId: string | null) => void
  mergeConversations: (conversations: Conversation[]) => void
  setActiveConversation: (channelId: string | null) => void
  mergeMessages: (channelId: string, messages: Message[]) => void
  updateMessage: (channelId: string, messageId: string, update: Partial<Message>) => void
  receiveMessage: (message: Message, read: boolean) => void
  setTyping: (channelId: string, typing: boolean) => void
  setDraft: (channelId: string, draft: string) => void
  setPresence: (onlineIds: string[]) => void
  clearUnread: (channelId: string) => void
  updateConversationPreview: (channelId: string, preview: string, timestamp: number) => void
}

export const useMessengerStore = create<MessengerStoreState>((set) => ({
  ...initial(),
  resetForUser: (ownerId) => set((s) => s.ownerId === ownerId ? {} : { ...initial(), ownerId }),
  mergeConversations: (conversations) => set((s) => {
    const byId = new Map(s.conversations.map((c) => [c.channelId, c]))
    for (const conversation of conversations) {
      const previous = byId.get(conversation.channelId)
      // Keep notifications received while the contact request was in flight.
      byId.set(conversation.channelId, previous && (previous.lastMessageAt ?? 0) > (conversation.lastMessageAt ?? 0)
        ? { ...conversation, ...previous, displayName: conversation.displayName, username: conversation.username }
        : conversation)
    }
    return { conversations: [...byId.values()] }
  }),
  setActiveConversation: (activeConversationId) => set({ activeConversationId }),
  mergeMessages: (channelId, incoming) => set((s) => ({
    messages: { ...s.messages, [channelId]: mergeMessages(s.messages[channelId] ?? [], incoming) },
  })),
  updateMessage: (channelId, messageId, update) => set((s) => ({
    messages: { ...s.messages, [channelId]: mergeMessages([], (s.messages[channelId] ?? []).map((m) => m.id === messageId ? { ...m, ...update } : m)) },
  })),
  receiveMessage: (message, read) => set((s) => {
    const channelId = `dm:${message.senderId}`
    const existing = s.messages[channelId] ?? []
    if (existing.some((m) => m.id === message.id)) {
      return { messages: { ...s.messages, [channelId]: mergeMessages(existing, [message]) } }
    }
    const previous = s.conversations.find((c) => c.channelId === channelId)
    const conversation: Conversation = previous ?? {
      channelId, userId: message.senderId, username: message.senderUsername ?? 'Friend',
      displayName: message.senderUsername ?? 'Friend', online: false, unread: 0,
    }
    return {
      messages: { ...s.messages, [channelId]: mergeMessages(existing, [message]) },
      conversations: [...s.conversations.filter((c) => c.channelId !== channelId), {
        ...conversation, unread: read ? 0 : conversation.unread + 1,
        ...((conversation.lastMessageAt ?? 0) <= message.createdAt ? { lastMessage: message.content.slice(0, 80), lastMessageAt: message.createdAt } : {}),
      }],
    }
  }),
  setTyping: (channelId, typing) => set((s) => ({ typing: { ...s.typing, [channelId]: typing } })),
  setDraft: (channelId, draft) => set((s) => ({ drafts: { ...s.drafts, [channelId]: draft } })),
  setPresence: (onlineIds) => set((s) => ({ conversations: s.conversations.map((c) => ({ ...c, online: onlineIds.includes(c.userId) })) })),
  clearUnread: (channelId) => set((s) => ({ conversations: s.conversations.map((c) => c.channelId === channelId ? { ...c, unread: 0 } : c) })),
  updateConversationPreview: (channelId, preview, timestamp) => set((s) => ({ conversations: s.conversations.map((c) =>
    c.channelId === channelId && (c.lastMessageAt ?? 0) <= timestamp ? { ...c, lastMessage: preview, lastMessageAt: timestamp } : c) })),
}))
