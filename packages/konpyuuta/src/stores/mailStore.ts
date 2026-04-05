import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'trash'

export interface MailMessage {
  id: string
  from: string
  to: string
  subject: string
  body: string
  read: boolean
  folder: MailFolder
  createdAt: number
}

interface MailStoreState {
  messages: MailMessage[]
  selectedMessageId: string | null
  currentFolder: MailFolder
  composing: boolean

  setMessages: (messages: MailMessage[]) => void
  addMessage: (message: MailMessage) => void
  removeMessage: (id: string) => void
  setSelectedMessage: (id: string | null) => void
  setCurrentFolder: (folder: MailFolder) => void
  setComposing: (composing: boolean) => void
  markAsRead: (id: string) => void
  moveToTrash: (id: string) => void
  getFolderMessages: (folder: MailFolder) => MailMessage[]
  getUnreadCount: (folder: MailFolder) => number
}

export const useMailStore = create<MailStoreState>()(
  persist(
    (set, get) => ({
      messages: [],
      selectedMessageId: null,
      currentFolder: 'inbox',
      composing: false,

      setMessages: (messages) => set({ messages }),

      addMessage: (message) =>
        set((state) => ({
          messages: [message, ...state.messages],
        })),

      removeMessage: (id) =>
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== id),
          selectedMessageId: state.selectedMessageId === id ? null : state.selectedMessageId,
        })),

      setSelectedMessage: (id) => set({ selectedMessageId: id }),

      setCurrentFolder: (folder) =>
        set({
          currentFolder: folder,
          selectedMessageId: null,
          composing: false,
        }),

      setComposing: (composing) => set({ composing }),

      markAsRead: (id) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, read: true } : m
          ),
        })),

      moveToTrash: (id) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, folder: 'trash' as MailFolder } : m
          ),
          selectedMessageId: state.selectedMessageId === id ? null : state.selectedMessageId,
        })),

      getFolderMessages: (folder) => {
        return get().messages.filter((m) => m.folder === folder)
      },

      getUnreadCount: (folder) => {
        return get().messages.filter((m) => m.folder === folder && !m.read).length
      },
    }),
    {
      name: 'konpyuuta-mail',
    }
  )
)
