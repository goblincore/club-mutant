import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MailLetter } from '../types'

export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'trash'
export interface MailMessage {
  id: string
  from: string
  to: string
  subject: string
  body: string
  read: boolean
  folder: MailFolder
  originalFolder?: Exclude<MailFolder, 'trash'>
  createdAt: number
  legacySourceId?: string
  delivered?: boolean
}
interface MailStoreState {
  ownerId: string | null
  accounts: Record<string, MailMessage[]>
  messages: MailMessage[]
  selectedMessageId: string | null
  activeDraftId: string | null
  currentFolder: MailFolder
  resetForUser(ownerId: string): void
  mergeLetters(ownerId: string, letters: MailLetter[]): void
  startDraft(from: string, initial?: Partial<Pick<MailMessage, 'to' | 'subject' | 'body'>>): string
  updateDraft(id: string, fields: Partial<Pick<MailMessage, 'to' | 'subject' | 'body'>>): void
  openDraft(id: string): void
  closeDraft(): void
  finishSend(ownerId: string, draftId: string, letter: MailLetter): void
  putLetter(ownerId: string, letter: MailLetter): void
  removeMessage(ownerId: string, id: string): void
  moveLocalMessage(id: string, restore?: boolean): void
  importLocalArchive(archive: unknown, from: string): void
  setSelectedMessage(id: string | null): void
  setCurrentFolder(folder: MailFolder): void
}
export const useMailStore = create<MailStoreState>()(persist((set, get) => {
  const commit = (messages: MailMessage[], extra: Partial<MailStoreState> = {}) => {
    const { ownerId, accounts } = get()
    if (!ownerId) return
    set({ messages, accounts: { ...accounts, [ownerId]: messages }, ...extra })
  }
  return {
    ownerId: null, accounts: {}, messages: [], selectedMessageId: null, activeDraftId: null, currentFolder: 'inbox',
    resetForUser(ownerId) {
      if (get().ownerId === ownerId) return
      set({ ownerId, messages: get().accounts[ownerId] ?? [], selectedMessageId: null, activeDraftId: null, currentFolder: 'inbox' })
    },
    mergeLetters(ownerId, letters) {
      if (get().ownerId !== ownerId) return
      // Remote sync never overwrites the user's local draft, including edits made during a request.
      commit([...get().messages.filter((m) => !m.delivered), ...letters])
    },
    startDraft(from, initial = {}) {
      const id = crypto.randomUUID()
      commit([...get().messages, { id, from, to: initial.to ?? '', subject: initial.subject ?? '', body: initial.body ?? '', folder: 'drafts', read: true, createdAt: Date.now() }], { activeDraftId: id, selectedMessageId: null })
      return id
    },
    updateDraft(id, fields) {
      commit(get().messages.map((m) => m.id === id && m.folder === 'drafts' ? { ...m, ...fields } : m))
    },
    openDraft(id) {
      if (get().messages.some((m) => m.id === id && m.folder === 'drafts')) set({ activeDraftId: id, selectedMessageId: null })
    },
    closeDraft() { set({ activeDraftId: null }) },
    finishSend(ownerId, draftId, letter) {
      if (get().ownerId !== ownerId) return
      commit([...get().messages.filter((m) => m.id !== draftId && m.id !== letter.id), letter], { activeDraftId: null, selectedMessageId: letter.id, currentFolder: 'sent' })
    },
    putLetter(ownerId, letter) {
      if (get().ownerId !== ownerId) return
      commit([...get().messages.filter((m) => m.id !== letter.id), letter], { selectedMessageId: get().selectedMessageId === letter.id && letter.folder !== get().currentFolder ? null : get().selectedMessageId })
    },
    removeMessage(ownerId, id) {
      if (get().ownerId !== ownerId) return
      commit(get().messages.filter((m) => m.id !== id), { selectedMessageId: get().selectedMessageId === id ? null : get().selectedMessageId, activeDraftId: get().activeDraftId === id ? null : get().activeDraftId })
    },
    moveLocalMessage(id, restore = false) {
      commit(get().messages.map((m) => {
        if (m.id !== id || m.delivered) return m
        return restore ? { ...m, folder: m.originalFolder ?? 'inbox' } : { ...m, originalFolder: m.folder === 'trash' ? m.originalFolder : m.folder, folder: 'trash' }
      }), { selectedMessageId: null, activeDraftId: null })
    },
    importLocalArchive(archive, from) {
      if (!Array.isArray(archive)) return
      const existing = new Set(get().messages.map((m) => m.legacySourceId))
      const recovered: MailMessage[] = []
      for (const value of archive.slice(0, 1000)) {
        if (!value || typeof value.id !== 'string' || typeof value.body !== 'string' || typeof value.subject !== 'string' || typeof value.to !== 'string' || typeof value.from !== 'string') continue
        if (existing.has(value.id)) continue
        existing.add(value.id)
        const id = crypto.randomUUID()
        const folder: MailFolder = ['inbox', 'sent', 'drafts', 'trash'].includes(value.folder) ? value.folder : 'drafts'
        recovered.push({ id, legacySourceId: value.id, from: value.from === 'me' ? from : value.from, to: value.to, subject: value.subject.slice(0, 100), body: value.body.slice(0, 10000), folder, read: !!value.read, createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now(), delivered: false })
      }
      commit([...get().messages, ...recovered])
    },
    setSelectedMessage(id) { set({ selectedMessageId: id, activeDraftId: null }) },
    setCurrentFolder(folder) { set({ currentFolder: folder, selectedMessageId: null, activeDraftId: null }) },
  }
}, {
  // Leave the original unowned prototype data intact; never assign it to a logged-in account.
  name: 'konpyuuta-postbox',
  partialize: (state) => ({ accounts: state.accounts }),
}))
