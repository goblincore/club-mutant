import { create } from 'zustand'

export interface ChatMessage {
  id: string
  author: string
  content: string
  createdAt: number
}

export interface ChatBubble {
  content: string
  timestamp: number
}

interface ChatState {
  messages: ChatMessage[]
  inputValue: string
  bubbles: Map<string, ChatBubble> // sessionId → active bubble

  addMessage: (msg: ChatMessage) => void
  setInputValue: (value: string) => void
  setBubble: (sessionId: string, content: string) => void
  clearBubble: (sessionId: string) => void
}

const BUBBLE_DURATION = 5000 // ms before bubble auto-clears
const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  inputValue: '',
  bubbles: new Map(),

  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages.slice(-99), msg],
    })),

  setInputValue: (value) => set({ inputValue: value }),

  setBubble: (sessionId, content) => {
    // Clear any existing timer for this player
    const existing = bubbleTimers.get(sessionId)
    if (existing) clearTimeout(existing)

    // Set auto-clear timer
    const timer = setTimeout(() => {
      bubbleTimers.delete(sessionId)
      set((s) => {
        const next = new Map(s.bubbles)
        next.delete(sessionId)
        return { bubbles: next }
      })
    }, BUBBLE_DURATION)

    bubbleTimers.set(sessionId, timer)

    set((s) => {
      const next = new Map(s.bubbles)
      next.set(sessionId, { content, timestamp: Date.now() })
      return { bubbles: next }
    })
  },

  clearBubble: (sessionId) => {
    const timer = bubbleTimers.get(sessionId)
    if (timer) clearTimeout(timer)
    bubbleTimers.delete(sessionId)

    set((s) => {
      const next = new Map(s.bubbles)
      next.delete(sessionId)
      return { bubbles: next }
    })
  },
}))
