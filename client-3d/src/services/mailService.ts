import type { MailLetter, MailService } from '../../../packages/konpyuuta/src/types'
import { postboxRpc, onNotification, onSocketChange } from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'

export function createMailService(): MailService {
  return {
    async listLetters() {
      const owner = useAuthStore.getState().userId
      const letters = new Map<string, MailLetter>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      do {
        const page: { letters: MailLetter[]; cursor?: string } = await postboxRpc('list_letters', cursor ? { cursor } : {})
        if (useAuthStore.getState().userId !== owner) throw new Error('Account changed. Reopen Postbox.')
        for (const letter of page.letters) letters.set(letter.id, letter)
        cursor = page.cursor || undefined
        if (cursor && cursors.has(cursor)) throw new Error('Postbox could not finish loading. Please refresh.')
        if (cursor) cursors.add(cursor)
      } while (cursor)
      return [...letters.values()].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    },
    async sendLetter(input) {
      const result: { letter: MailLetter } = await postboxRpc('send_letter', { request_id: input.requestId, to: input.to.trim().replace(/^@/, ''), subject: input.subject, body: input.body })
      return result.letter
    },
    async updateLetter(id, action) {
      const result: { letter: MailLetter | null } = await postboxRpc('update_letter', { id, action })
      return result.letter
    },
    onMailChanged(callback) {
      const unsubscribeNotification = onNotification((notification) => { if (notification.code === 101) callback() })
      const unsubscribeSocket = onSocketChange((socket) => { if (socket) callback() })
      return () => { unsubscribeNotification(); unsubscribeSocket() }
    },
  }
}
