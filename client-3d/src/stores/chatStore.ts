import { create } from 'zustand'

export interface ChatMessage {
  id: string
  author: string
  content: string
  createdAt: number
}

interface ChatState {
  messages: ChatMessage[]
  inputValue: string

  addMessage: (msg: ChatMessage) => void
  setInputValue: (value: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  inputValue: '',

  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages.slice(-99), msg],
    })),

  setInputValue: (value) => set({ inputValue: value }),
}))
