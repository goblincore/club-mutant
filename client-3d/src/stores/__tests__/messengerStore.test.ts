import { beforeEach, describe, expect, it } from 'vitest'
import { useMessengerStore as store } from '../../../../packages/konpyuuta/src/stores/messengerStore'
const friend = { channelId: 'dm:friend', userId: 'friend', username: 'Friend', displayName: 'Friend', online: false, unread: 0 }
const message = { id: 'one', senderId: 'friend', content: 'hello', createdAt: 2 }
beforeEach(() => { store.getState().resetForUser(null); store.getState().resetForUser('me'); store.getState().mergeConversations([friend]) })
describe('Messenger state regressions', () => {
  it('keeps optimistic and failed messages during history refresh and orders by time', () => {
    store.getState().mergeMessages('dm:friend', [{ id: 'temp-a', senderId: 'me', content: 'pending', createdAt: 3, pending: true }, { id: 'temp-b', senderId: 'me', content: 'failed', createdAt: 4, failed: true }])
    store.getState().mergeMessages('dm:friend', [message, { ...message, id: 'old', createdAt: 1 }])
    expect(store.getState().messages['dm:friend'].map((m) => m.id)).toEqual(['old', 'one', 'temp-a', 'temp-b'])
    store.getState().updateMessage('dm:friend', 'temp-a', { id: 'real', createdAt: 3, pending: false })
    store.getState().mergeMessages('dm:friend', [{ id: 'real', senderId: 'me', content: 'pending', createdAt: 3 }])
    expect(store.getState().messages['dm:friend'].filter((m) => m.id === 'real')).toHaveLength(1)
  })
  it('does not double count duplicate notifications or truncate full bodies', () => {
    store.getState().receiveMessage({ ...message, content: 'full'.repeat(80) }, false)
    store.getState().receiveMessage({ ...message, content: 'preview', isPreview: true }, false)
    expect(store.getState().conversations[0].unread).toBe(1)
    expect(store.getState().messages['dm:friend'][0].content).toBe('full'.repeat(80))
  })
  it('keeps notifications received while the contacts fetch was in flight', () => {
    store.getState().receiveMessage(message, false)
    store.getState().mergeConversations([friend])
    expect(store.getState().conversations[0]).toMatchObject({ lastMessage: 'hello', unread: 1 })
    store.getState().updateConversationPreview('dm:friend', 'stale', 1)
    expect(store.getState().conversations[0].lastMessage).toBe('hello')
  })
  it('isolates drafts and clears private state when accounts change', () => {
    store.getState().setDraft('dm:friend', 'a little note')
    store.getState().setDraft('dm:other', 'different note')
    store.getState().receiveMessage(message, false)
    store.getState().resetForUser('someone-else')
    expect(store.getState()).toMatchObject({ messages: {}, conversations: [], drafts: {}, ownerId: 'someone-else' })
  })
})
