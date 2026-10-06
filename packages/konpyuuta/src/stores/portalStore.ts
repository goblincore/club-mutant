import { create } from 'zustand'

// Messenger is a companion window, independent of the main reading surface.
export const usePortalStore = create<{
  messengerOpen: boolean
  messengerFocused: boolean
  openMessenger: () => void
  closeMessenger: () => void
  focusMessenger: (focused: boolean) => void
}>((set) => ({
  messengerOpen: true,
  messengerFocused: false,
  openMessenger: () => set({ messengerOpen: true, messengerFocused: true }),
  closeMessenger: () => set({ messengerOpen: false, messengerFocused: false }),
  focusMessenger: (messengerFocused) => set({ messengerFocused }),
}))
