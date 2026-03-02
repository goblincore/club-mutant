import { create } from 'zustand'

interface PresenceState {
  onlineUserIds: Set<string>
  addOnline: (userIds: string[]) => void
  removeOnline: (userIds: string[]) => void
  clear: () => void
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUserIds: new Set(),

  addOnline: (userIds) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      for (const id of userIds) next.add(id)
      return { onlineUserIds: next }
    }),

  removeOnline: (userIds) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      for (const id of userIds) next.delete(id)
      return { onlineUserIds: next }
    }),

  clear: () => set({ onlineUserIds: new Set() }),
}))
