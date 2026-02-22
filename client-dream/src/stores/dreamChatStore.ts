import { create } from 'zustand'

export interface ChatMessage {
  id: string
  sender: 'player' | 'npc'
  npcId: string
  text: string
  timestamp: number
}

export interface ChatBubble {
  id: string
  entityId: string // 'player' or npc id
  text: string
  expiresAt: number
}

interface DreamChatState {
  // Active NPC conversation
  activeNpcId: string | null
  activeNpcName: string | null

  // Chat history (per-NPC, keyed by npcId)
  messageHistory: Record<string, ChatMessage[]>

  // Visible bubbles above sprites
  bubbles: ChatBubble[]

  // UI state
  thinking: boolean // NPC is "thinking" (API call in flight)
  lastMessageTime: number // for debounce

  // Actions
  setActiveNpc: (id: string | null, name?: string | null) => void
  clearActiveNpc: () => void
  addMessage: (npcId: string, sender: 'player' | 'npc', text: string) => void
  addBubble: (bubble: Omit<ChatBubble, 'id'>) => void
  removeBubble: (id: string) => void
  clearExpiredBubbles: () => void
  setThinking: (thinking: boolean) => void
  setLastMessageTime: (time: number) => void
}

let bubbleId = 0
let messageId = 0

export const useDreamChatStore = create<DreamChatState>((set) => ({
  activeNpcId: null,
  activeNpcName: null,
  messageHistory: {},
  bubbles: [],
  thinking: false,
  lastMessageTime: 0,

  setActiveNpc: (id, name = null) =>
    set({ activeNpcId: id, activeNpcName: name ?? null, thinking: false }),

  clearActiveNpc: () =>
    set({ activeNpcId: null, activeNpcName: null, thinking: false }),

  addMessage: (npcId, sender, text) =>
    set((state) => {
      const msg: ChatMessage = {
        id: `msg_${++messageId}`,
        npcId,
        sender,
        text,
        timestamp: Date.now(),
      }
      const history = { ...state.messageHistory }
      const npcMessages = [...(history[npcId] || []), msg]
      // Keep last 20 messages per NPC for context
      history[npcId] = npcMessages.slice(-20)
      return { messageHistory: history }
    }),

  addBubble: (bubble) =>
    set((state) => ({
      bubbles: [
        ...state.bubbles,
        { ...bubble, id: `bubble_${++bubbleId}` },
      ],
    })),

  removeBubble: (id) =>
    set((state) => ({
      bubbles: state.bubbles.filter((b) => b.id !== id),
    })),

  clearExpiredBubbles: () =>
    set((state) => ({
      bubbles: state.bubbles.filter((b) => b.expiresAt > Date.now()),
    })),

  setThinking: (thinking) => set({ thinking }),
  setLastMessageTime: (time) => set({ lastMessageTime: time }),
}))
