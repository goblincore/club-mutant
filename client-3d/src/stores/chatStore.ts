import { create } from 'zustand'

export interface ChatMessage {
  id: string
  author: string
  content: string
  createdAt: number
}

export interface ChatBubble {
  id: string
  content: string
  timestamp: number
}

interface ChatState {
  messages: ChatMessage[]
  inputValue: string
  bubbles: Map<string, ChatBubble[]> // sessionId → stacked bubbles (newest first)

  addMessage: (msg: ChatMessage) => void
  setInputValue: (value: string) => void
  setBubble: (sessionId: string, content: string) => void
  clearBubble: (sessionId: string) => void
}

export const BUBBLE_DURATION = 5000 // ms before each bubble auto-clears
const MAX_STACK = 4
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
    const id = `${sessionId}-${Date.now()}`

    // Per-bubble auto-clear timer
    const timer = setTimeout(() => {
      bubbleTimers.delete(id)

      set((s) => {
        const arr = s.bubbles.get(sessionId)
        if (!arr) return s

        const next = new Map(s.bubbles)
        const filtered = arr.filter((b) => b.id !== id)

        if (filtered.length === 0) {
          next.delete(sessionId)
        } else {
          next.set(sessionId, filtered)
        }

        return { bubbles: next }
      })
    }, BUBBLE_DURATION)

    bubbleTimers.set(id, timer)

    set((s) => {
      const next = new Map(s.bubbles)
      const existing = next.get(sessionId) ?? []
      const updated = [{ id, content, timestamp: Date.now() }, ...existing].slice(0, MAX_STACK)
      next.set(sessionId, updated)
      return { bubbles: next }
    })
  },

  clearBubble: (sessionId) => {
    const arr = useChatStore.getState().bubbles.get(sessionId)

    if (arr) {
      for (const b of arr) {
        const timer = bubbleTimers.get(b.id)
        if (timer) clearTimeout(timer)
        bubbleTimers.delete(b.id)
      }
    }

    set((s) => {
      const next = new Map(s.bubbles)
      next.delete(sessionId)
      return { bubbles: next }
    })
  },
}))
