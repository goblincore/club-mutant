import { create } from 'zustand'

interface DreamStore {
  /** Latest NPC response text — triggers Bonzi speaking animation + TTS */
  dreamNpcMessage: string | null
  setDreamNpcMessage: (text: string | null) => void
}

export const useDreamStore = create<DreamStore>((set) => ({
  dreamNpcMessage: null,
  setDreamNpcMessage: (text) => set({ dreamNpcMessage: text }),
}))
