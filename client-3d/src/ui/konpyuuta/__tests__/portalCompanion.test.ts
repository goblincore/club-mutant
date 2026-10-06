import { beforeEach, describe, expect, it } from 'vitest'
import { clampPanelSize } from '../../../../../packages/konpyuuta/src/lib/panelSize'
import { openPortalApp } from '../../../../../packages/konpyuuta/src/lib/portalApps'
import { usePortalStore } from '../../../../../packages/konpyuuta/src/stores/portalStore'
import { onlineFriendCount, useMessengerStore } from '../../../../../packages/konpyuuta/src/stores/messengerStore'
import { useWindowStore } from '../../../../../packages/konpyuuta/src/stores/windowStore'

beforeEach(() => {
  usePortalStore.setState({ messengerOpen: true, messengerFocused: false })
  useWindowStore.setState({ windows: {}, activeWindowId: null })
  useMessengerStore.getState().resetForUser(null)
  useMessengerStore.getState().resetForUser('me')
})

describe('Messenger companion navigation', () => {
  it('reopens the buddy list without replacing the active app or losing a draft', () => {
    openPortalApp('mutanttube')
    const activeId = useWindowStore.getState().activeWindowId
    useMessengerStore.getState().setActiveConversation('dm:friend')
    useMessengerStore.getState().setDraft('dm:friend', 'unfinished')
    usePortalStore.getState().closeMessenger()
    openPortalApp('messenger')
    expect(usePortalStore.getState()).toMatchObject({ messengerOpen: true, messengerFocused: true })
    expect(useWindowStore.getState().activeWindowId).toBe(activeId)
    expect(Object.values(useWindowStore.getState().windows)).toHaveLength(1)
    expect(useMessengerStore.getState().activeConversationId).toBeNull()
    expect(useMessengerStore.getState().drafts['dm:friend']).toBe('unfinished')
  })
  it('keeps background messages unread until explicitly cleared', () => {
    usePortalStore.getState().closeMessenger()
    useMessengerStore.getState().receiveMessage({ id: 'live', senderId: 'friend', content: 'hello', createdAt: 10 }, false)
    openPortalApp('messenger')
    expect(useMessengerStore.getState().conversations[0].unread).toBe(1)
  })
})

describe('Online friends count', () => {
  it('counts accepted friends, excluding other conversations and removed friends', () => {
    const store = useMessengerStore.getState()
    store.setConnected(true)
    store.setFriendIds(['friend', 'offline'])
    store.mergeConversations(['friend', 'offline', 'stranger'].map((userId) => ({ channelId: `dm:${userId}`, userId, username: userId, displayName: userId, online: userId !== 'offline', unread: 0 })))
    expect(onlineFriendCount(useMessengerStore.getState())).toBe(1)
    store.setPresence(['offline', 'stranger'])
    expect(onlineFriendCount(useMessengerStore.getState())).toBe(1)
    store.setFriendIds([])
    expect(onlineFriendCount(useMessengerStore.getState())).toBe(0)
  })
  it('shows unavailable during disconnect/loading and clears membership on account change', () => {
    const store = useMessengerStore.getState()
    expect(onlineFriendCount(useMessengerStore.getState())).toBeNull()
    store.setConnected(true)
    store.setFriendIds([])
    expect(onlineFriendCount(useMessengerStore.getState())).toBe(0)
    store.setConnected(false)
    expect(onlineFriendCount(useMessengerStore.getState())).toBeNull()
    store.resetForUser('other')
    expect(useMessengerStore.getState().friendIds).toBeNull()
  })
})

describe('Panel resize constraints', () => {
  it('keeps windows usable and within the viewport', () => {
    expect(clampPanelSize({ width: 1, height: 1 }, { width: 900, height: 600 }, { width: 300, height: 280 })).toEqual({ width: 300, height: 280 })
    expect(clampPanelSize({ width: 1500, height: 900 }, { width: 900, height: 600 }, { width: 300, height: 280 })).toEqual({ width: 900, height: 600 })
    expect(clampPanelSize({ width: 600, height: 500 }, { width: 250, height: 240 }, { width: 300, height: 280 })).toEqual({ width: 250, height: 240 })
  })
})
