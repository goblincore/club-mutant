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
  failed?: boolean
}

interface MessengerStoreState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Record<string, Message[]>
  typing: Record<string, boolean>
  buddyListOpen: boolean
  /** Tracks which conversations have had history fetched from server */
  loaded: Record<string, boolean>
  loadingMessages: boolean

  setConversations: (conversations: Conversation[]) => void
  addConversation: (conv: Conversation) => void
  setActiveConversation: (channelId: string | null) => void
  addMessage: (channelId: string, message: Message) => void
  setMessages: (channelId: string, messages: Message[]) => void
  setTyping: (channelId: string, isTyping: boolean) => void
  setBuddyListOpen: (open: boolean) => void
  incrementUnread: (channelId: string) => void
  clearUnread: (channelId: string) => void
  setLoaded: (channelId: string) => void
  setLoadingMessages: (loading: boolean) => void
  updateConversationPreview: (channelId: string, preview: string, timestamp: number) => void
  markMessageFailed: (channelId: string, messageId: string) => void
}

export const useMessengerStore = create<MessengerStoreState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typing: {},
  buddyListOpen: true,
  loaded: {},
  loadingMessages: false,

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conv) =>
    set((state) => ({
      conversations: state.conversations.some((c) => c.channelId === conv.channelId)
        ? state.conversations
        : [...state.conversations, conv],
    })),

  setActiveConversation: (channelId) => set({ activeConversationId: channelId }),

  addMessage: (channelId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), message],
      },
    })),

  setMessages: (channelId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: messages,
      },
    })),

  setTyping: (channelId, isTyping) =>
    set((state) => ({
      typing: {
        ...state.typing,
        [channelId]: isTyping,
      },
    })),

  setBuddyListOpen: (open) => set({ buddyListOpen: open }),

  incrementUnread: (channelId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.channelId === channelId ? { ...c, unread: c.unread + 1 } : c
      ),
    })),

  clearUnread: (channelId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.channelId === channelId ? { ...c, unread: 0 } : c
      ),
    })),

  setLoaded: (channelId) =>
    set((state) => ({
      loaded: { ...state.loaded, [channelId]: true },
    })),

  setLoadingMessages: (loading) => set({ loadingMessages: loading }),

  updateConversationPreview: (channelId, preview, timestamp) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.channelId === channelId
          ? { ...c, lastMessage: preview, lastMessageAt: timestamp }
          : c
      ),
    })),

  markMessageFailed: (channelId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, failed: true } : m
        ),
      },
    })),
}))
