# Messenger Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the KonpyuuTA Messenger (ICQ-style IM) to Nakama DMs with real-time message delivery via notifications and typing indicators via Nakama realtime channels.

**Architecture:** MessengerService interface in konpyuuta types (decoupled from Nakama SDK), implementation in client-3d wrapping existing nakamaClient functions + socket channel management, wired through KonpyuuTAProvider. Messages persisted via Nakama storage RPCs, real-time delivery via socket notifications, typing via Nakama DM channels.

**Tech Stack:** TypeScript, Zustand, Nakama JS SDK (@heroiclabs/nakama-js), React

**Design spec:** `docs/plans/2026-04-08-messenger-backend-integration-design.md`

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/konpyuuta/src/types.ts` | Modify | Add MessengerService, DmMessage, ConversationSummary interfaces |
| `client-3d/src/network/nakamaClient.ts` | Modify | Export getSocket(), add multi-listener notification support |
| `client-3d/src/services/messengerService.ts` | Create | MessengerService implementation wrapping nakamaClient + channels |
| `client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx` | Modify | Wire messengerService into KonpyuuTAProvider |
| `packages/konpyuuta/src/stores/messengerStore.ts` | Modify | Add loaded tracking, update Message type with real IDs |
| `packages/konpyuuta/src/components/apps/Messenger.tsx` | Modify | Wire to messengerService for all DM operations |

---

### Task 1: Add MessengerService Interface to KonpyuuTA Types

**Files:**
- Modify: `packages/konpyuuta/src/types.ts`

- [ ] **Step 1: Add DM types and MessengerService interface**

Add after the `SocialService` interface (after line 93):

```typescript
// ── Messenger Service Interface ───────────────────────────────────────────

export interface DmMessage {
  messageId: string
  senderId: string
  senderUsername: string
  body: string
  createdAt: number
}

export interface ConversationSummary {
  otherUserId: string
  otherUsername: string
  lastMessagePreview: string
  lastMessageAt: number
  unreadCount: number
}

export interface MessengerService {
  /** Send a DM. Returns the server-assigned message ID and timestamp. */
  sendMessage(recipientId: string, body: string): Promise<{ messageId: string; createdAt: number }>
  /** Fetch message history for a conversation. Cursor-based pagination. */
  getMessages(partnerId: string, cursor?: string): Promise<{ messages: DmMessage[]; cursor?: string }>
  /** List all conversations with last message preview and unread counts. */
  listConversations(): Promise<ConversationSummary[]>
  /** Mark all messages from a partner as read. */
  markRead(partnerId: string): Promise<void>

  /** Register callback for incoming messages. Returns unsubscribe function. */
  onMessageReceived(cb: (msg: DmMessage) => void): () => void
  /** Register callback for typing indicators. Returns unsubscribe function. */
  onTypingIndicator(cb: (userId: string, typing: boolean) => void): () => void
  /** Join the DM channel for a partner (enables typing indicators). */
  joinConversationChannel(partnerId: string): Promise<void>
  /** Send a typing indicator to the partner. Debounced internally. */
  sendTypingIndicator(partnerId: string): void

  /** Setup socket listeners for real-time features. */
  connect(): void
  /** Cleanup socket listeners and leave channels. */
  disconnect(): void
}
```

- [ ] **Step 2: Add messengerService to KonpyuuTAContextValue**

Replace the `KonpyuuTAContextValue` interface (line 95-101):

```typescript
export interface KonpyuuTAContextValue {
  playlistService?: PlaylistService
  socialService?: SocialService
  messengerService?: MessengerService
  env: {
    youtubeApiUrl?: string
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/konpyuuta && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/konpyuuta/src/types.ts
git commit -m "feat(messenger): add MessengerService interface to konpyuuta types"
```

---

### Task 2: Add Multi-Listener Notification Support + getSocket to nakamaClient

**Files:**
- Modify: `client-3d/src/network/nakamaClient.ts`

The current `socket.onnotification` handler is a single function. We need to support multiple listeners so the messenger service can register its own without clobbering the existing handler.

- [ ] **Step 1: Add notification listener registry and getSocket export**

Add after the `_reconnectAttempts` variable declarations (after line 16):

```typescript
// ── Notification listener registry ─────────────────────────────────────────
type NotificationListener = (notification: { code: number; content: unknown; sender_id: string }) => void
const _notificationListeners: NotificationListener[] = []

/**
 * Register a notification listener. Returns an unsubscribe function.
 * Listeners are called for ALL notifications — filter by code in your callback.
 */
export function onNotification(listener: NotificationListener): () => void {
  _notificationListeners.push(listener)
  return () => {
    const idx = _notificationListeners.indexOf(listener)
    if (idx >= 0) _notificationListeners.splice(idx, 1)
  }
}
```

- [ ] **Step 2: Update connectSocket to dispatch to all listeners**

Replace the `socket.onnotification` block (lines 206-218) with:

```typescript
  socket.onnotification = (notification) => {
    for (const listener of _notificationListeners) {
      try {
        listener(notification as { code: number; content: unknown; sender_id: string })
      } catch (err) {
        console.warn('[nakama] Notification listener error:', err)
      }
    }
  }
```

- [ ] **Step 3: Register the existing DM log as a default listener**

Add after the `onNotification` function definition (after the code from Step 1):

```typescript
// Default DM notification logger
onNotification((notification) => {
  if (notification.code === 100) {
    const data = notification.content as {
      messageId: string
      senderId: string
      senderUsername: string
      subject: string
      preview: string
    }
    console.log('[nakama] DM notification from %s', data.senderUsername)
  }
})
```

- [ ] **Step 4: Export getSocket**

Add after the `disconnectSocket` function (after line 241):

```typescript
/**
 * Get the current Nakama socket for direct channel operations.
 * Returns null if not connected.
 */
export function getSocket(): Socket | null {
  return _socket
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd client-3d && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add client-3d/src/network/nakamaClient.ts
git commit -m "feat(messenger): multi-listener notifications + getSocket export"
```

---

### Task 3: Create MessengerService Implementation

**Files:**
- Create: `client-3d/src/services/messengerService.ts`

**Reference:** The existing DM wrapper functions in `client-3d/src/network/nakamaClient.ts`:
- `sendDirectMessage(recipientId, subject, body)` → calls `send_message` RPC
- `listConversations(cursor?)` → calls `list_conversations` RPC
- `getDirectMessages(otherUserId, cursor?)` → calls `get_messages` RPC
- `markMessagesRead(otherUserId)` → calls `mark_read` RPC
- `getSocket()` → returns the Nakama socket
- `onNotification(listener)` → registers notification listener

The `MailMessage` type from `types/Mail.ts` has fields: `messageId, senderId, recipientId, senderUsername, recipientUsername, subject, body, createdAt, read`. We map this to the simpler `DmMessage`.

- [ ] **Step 1: Create the services directory**

Run: `mkdir -p client-3d/src/services`

- [ ] **Step 2: Create messengerService.ts**

```typescript
// client-3d/src/services/messengerService.ts
import type { MessengerService, DmMessage, ConversationSummary } from '../../../packages/konpyuuta/src/types'
import {
  sendDirectMessage,
  listConversations as nakamaListConversations,
  getDirectMessages,
  markMessagesRead,
  getSocket,
  onNotification,
} from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'

const DM_NOTIFICATION_CODE = 100
const TYPING_DEBOUNCE_MS = 2000
const TYPING_CLEAR_MS = 3000

export function createMessengerService(): MessengerService {
  const messageCallbacks: Array<(msg: DmMessage) => void> = []
  const typingCallbacks: Array<(userId: string, typing: boolean) => void> = []

  // Track joined channels: partnerId → channelId
  const joinedChannels = new Map<string, string>()

  // Typing debounce timers: partnerId → timeout
  const typingDebounce = new Map<string, ReturnType<typeof setTimeout>>()

  // Typing clear timers: partnerId → timeout (auto-clear after silence)
  const typingClearTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // Unsubscribe functions for cleanup
  let unsubNotification: (() => void) | null = null
  let channelMessageHandler: ((message: unknown) => void) | null = null

  const service: MessengerService = {
    async sendMessage(recipientId: string, body: string) {
      return sendDirectMessage(recipientId, 'dm', body)
    },

    async getMessages(partnerId: string, cursor?: string) {
      const result = await getDirectMessages(partnerId, cursor)
      const messages: DmMessage[] = (result.messages || []).map((m) => ({
        messageId: m.messageId,
        senderId: m.senderId,
        senderUsername: m.senderUsername,
        body: m.body,
        createdAt: m.createdAt,
      }))
      return { messages, cursor: result.cursor }
    },

    async listConversations() {
      const result = await nakamaListConversations()
      return result.conversations || []
    },

    async markRead(partnerId: string) {
      await markMessagesRead(partnerId)
    },

    onMessageReceived(cb: (msg: DmMessage) => void) {
      messageCallbacks.push(cb)
      return () => {
        const idx = messageCallbacks.indexOf(cb)
        if (idx >= 0) messageCallbacks.splice(idx, 1)
      }
    },

    onTypingIndicator(cb: (userId: string, typing: boolean) => void) {
      typingCallbacks.push(cb)
      return () => {
        const idx = typingCallbacks.indexOf(cb)
        if (idx >= 0) typingCallbacks.splice(idx, 1)
      }
    },

    async joinConversationChannel(partnerId: string) {
      if (joinedChannels.has(partnerId)) return
      const socket = getSocket()
      if (!socket) {
        console.warn('[messenger] Cannot join channel — socket not connected')
        return
      }
      try {
        // Type 2 = Direct Message channel in Nakama
        const channel = await socket.joinChat(partnerId, 2)
        joinedChannels.set(partnerId, channel.id)
        console.log('[messenger] Joined DM channel with %s: %s', partnerId, channel.id)
      } catch (err) {
        console.warn('[messenger] Failed to join DM channel:', err)
      }
    },

    sendTypingIndicator(partnerId: string) {
      const channelId = joinedChannels.get(partnerId)
      if (!channelId) return

      // Debounce: only send once per TYPING_DEBOUNCE_MS
      if (typingDebounce.has(partnerId)) return
      typingDebounce.set(partnerId, setTimeout(() => {
        typingDebounce.delete(partnerId)
      }, TYPING_DEBOUNCE_MS))

      const socket = getSocket()
      if (!socket) return
      socket.writeChatMessage(channelId, { type: 'typing' }).catch((err: unknown) => {
        console.warn('[messenger] Failed to send typing indicator:', err)
      })
    },

    connect() {
      // Listen for DM notifications (new messages from other users)
      unsubNotification = onNotification((notification) => {
        if (notification.code !== DM_NOTIFICATION_CODE) return
        const data = notification.content as {
          messageId: string
          senderId: string
          senderUsername: string
          subject: string
          preview: string
        }
        const msg: DmMessage = {
          messageId: data.messageId,
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          body: data.preview, // notification only has preview, full body loaded on conversation open
          createdAt: Date.now(),
        }
        for (const cb of messageCallbacks) {
          try { cb(msg) } catch (err) { console.warn('[messenger] Message callback error:', err) }
        }
      })

      // Listen for channel messages (typing indicators)
      const socket = getSocket()
      if (socket) {
        channelMessageHandler = (rawMessage: unknown) => {
          const message = rawMessage as {
            channel_id: string
            sender_id: string
            content: { type?: string }
          }
          if (message.content?.type !== 'typing') return

          const myUserId = useAuthStore.getState().userId
          if (message.sender_id === myUserId) return

          // Find partnerId from channelId
          let partnerId: string | null = null
          for (const [pid, cid] of joinedChannels) {
            if (cid === message.channel_id) {
              partnerId = pid
              break
            }
          }
          if (!partnerId) return

          // Notify typing=true
          for (const cb of typingCallbacks) {
            try { cb(partnerId, true) } catch (err) { console.warn('[messenger] Typing callback error:', err) }
          }

          // Auto-clear typing after TYPING_CLEAR_MS
          const existingTimer = typingClearTimers.get(partnerId)
          if (existingTimer) clearTimeout(existingTimer)
          const pid = partnerId // capture for closure
          typingClearTimers.set(pid, setTimeout(() => {
            typingClearTimers.delete(pid)
            for (const cb of typingCallbacks) {
              try { cb(pid, false) } catch (err) { console.warn('[messenger] Typing callback error:', err) }
            }
          }, TYPING_CLEAR_MS))
        }
        socket.onchannelmessage = channelMessageHandler as typeof socket.onchannelmessage
      }

      console.log('[messenger] Service connected — listening for notifications and channel messages')
    },

    disconnect() {
      // Unsubscribe notification listener
      if (unsubNotification) {
        unsubNotification()
        unsubNotification = null
      }

      // Clear channel message handler
      const socket = getSocket()
      if (socket && channelMessageHandler) {
        socket.onchannelmessage = () => {}
        channelMessageHandler = null
      }

      // Leave all channels
      for (const [, channelId] of joinedChannels) {
        if (socket) {
          socket.leaveChat(channelId).catch(() => {})
        }
      }
      joinedChannels.clear()

      // Clear all timers
      for (const timer of typingDebounce.values()) clearTimeout(timer)
      typingDebounce.clear()
      for (const timer of typingClearTimers.values()) clearTimeout(timer)
      typingClearTimers.clear()

      // Clear callbacks
      messageCallbacks.length = 0
      typingCallbacks.length = 0

      console.log('[messenger] Service disconnected')
    },
  }

  return service
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client-3d && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add client-3d/src/services/messengerService.ts
git commit -m "feat(messenger): create MessengerService implementation"
```

---

### Task 4: Wire MessengerService into KonpyuuTAShell

**Files:**
- Modify: `client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx`

- [ ] **Step 1: Import and create messengerService**

Add to the imports at the top of the file:

```typescript
import type { MessengerService } from '../../../../packages/konpyuuta/src/types'
import { createMessengerService } from '../../services/messengerService'
```

- [ ] **Step 2: Create messengerService with useMemo and lifecycle with useEffect**

Add these inside the `KonpyuuTAShell` component, after the `socialService` useMemo (after line 77):

```typescript
  const messengerService = useMemo<MessengerService>(() => createMessengerService(), [])

  // Connect/disconnect messenger service lifecycle
  useEffect(() => {
    messengerService.connect()
    return () => messengerService.disconnect()
  }, [messengerService])
```

Add `useEffect` to the import from react (line 1):

```typescript
import { useEffect, useMemo } from 'react'
```

- [ ] **Step 3: Pass messengerService to KonpyuuTAProvider**

Update the `<KonpyuuTAProvider>` to include `messengerService`:

```typescript
    <KonpyuuTAProvider
      playlistService={playlistService}
      socialService={socialService}
      messengerService={messengerService}
      env={{
        youtubeApiUrl:
          import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
          (window.location.hostname === 'localhost'
            ? 'http://localhost:8081'
            : `${window.location.origin}/youtube`),
      }}
    >
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client-3d && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx
git commit -m "feat(messenger): wire MessengerService into KonpyuuTAProvider"
```

---

### Task 5: Update Messenger Store

**Files:**
- Modify: `packages/konpyuuta/src/stores/messengerStore.ts`

- [ ] **Step 1: Update the Message interface and add loaded tracking**

Replace the entire file:

```typescript
import { create } from 'zustand'

export interface Conversation {
  channelId: string
  userId: string
  username: string
  displayName: string
  online: boolean
  unread: number
  lastMessage?: string
  lastMessageAt?: number
}

export interface Message {
  id: string
  senderId: string
  senderUsername?: string
  content: string
  createdAt: number
  failed?: boolean
}

interface MessengerStoreState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Record<string, Message[]>
  typing: Record<string, boolean>
  buddyListOpen: boolean
  /** Tracks which conversations have had history fetched from server */
  loaded: Record<string, boolean>
  loadingMessages: boolean

  setConversations: (conversations: Conversation[]) => void
  addConversation: (conv: Conversation) => void
  setActiveConversation: (channelId: string | null) => void
  addMessage: (channelId: string, message: Message) => void
  setMessages: (channelId: string, messages: Message[]) => void
  setTyping: (channelId: string, isTyping: boolean) => void
  setBuddyListOpen: (open: boolean) => void
  incrementUnread: (channelId: string) => void
  clearUnread: (channelId: string) => void
  setLoaded: (channelId: string) => void
  setLoadingMessages: (loading: boolean) => void
  updateConversationPreview: (channelId: string, preview: string, timestamp: number) => void
  markMessageFailed: (channelId: string, messageId: string) => void
}

export const useMessengerStore = create<MessengerStoreState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typing: {},
  buddyListOpen: true,
  loaded: {},
  loadingMessages: false,

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conv) =>
    set((state) => ({
      conversations: state.conversations.some((c) => c.channelId === conv.channelId)
        ? state.conversations
        : [...state.conversations, conv],
    })),

  setActiveConversation: (channelId) => set({ activeConversationId: channelId }),

  addMessage: (channelId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), message],
      },
    })),

  setMessages: (channelId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: messages,
      },
    })),

  setTyping: (channelId, isTyping) =>
    set((state) => ({
      typing: {
        ...state.typing,
        [channelId]: isTyping,
      },
    })),

  setBuddyListOpen: (open) => set({ buddyListOpen: open }),

  incrementUnread: (channelId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.channelId === channelId ? { ...c, unread: c.unread + 1 } : c
      ),
    })),

  clearUnread: (channelId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.channelId === channelId ? { ...c, unread: 0 } : c
      ),
    })),

  setLoaded: (channelId) =>
    set((state) => ({
      loaded: { ...state.loaded, [channelId]: true },
    })),

  setLoadingMessages: (loading) => set({ loadingMessages: loading }),

  updateConversationPreview: (channelId, preview, timestamp) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.channelId === channelId
          ? { ...c, lastMessage: preview, lastMessageAt: timestamp }
          : c
      ),
    })),

  markMessageFailed: (channelId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, failed: true } : m
        ),
      },
    })),
}))
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/konpyuuta && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/konpyuuta/src/stores/messengerStore.ts
git commit -m "feat(messenger): add loaded tracking, failed state, preview updates to store"
```

---

### Task 6: Wire Messenger.tsx to Real Backend

**Files:**
- Modify: `packages/konpyuuta/src/components/apps/Messenger.tsx`

This is the biggest change — replacing all mock behavior with real MessengerService calls.

- [ ] **Step 1: Replace the entire Messenger component**

Replace the full file with:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { useKonpyuuTA } from '../../context/KonpyuuTAContext'
import { useMessengerStore, type Message } from '../../stores/messengerStore'
import type { DmMessage } from '../../types'

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function Messenger() {
  const { socialService, messengerService } = useKonpyuuTA()
  const {
    conversations,
    activeConversationId,
    messages,
    typing,
    buddyListOpen,
    loaded,
    loadingMessages,
    setConversations,
    addConversation,
    setActiveConversation,
    addMessage,
    setMessages,
    setTyping,
    setBuddyListOpen,
    clearUnread,
    incrementUnread,
    setLoaded,
    setLoadingMessages,
    updateConversationPreview,
    markMessageFailed,
  } = useMessengerStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composeText, setComposeText] = useState('')
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLTextAreaElement>(null)

  const activeConv = conversations.find((c) => c.channelId === activeConversationId)
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : []

  // ── Initialize: load conversations from Nakama + merge friend presence ──
  useEffect(() => {
    if (!socialService) {
      setError('Social service not available')
      setLoading(false)
      return
    }

    setLoading(true)

    // Load both conversations (from DM RPCs) and friends (for presence)
    const loadData = async () => {
      try {
        const [friends, serverConvos] = await Promise.all([
          socialService.listFriends(),
          messengerService?.listConversations() ?? Promise.resolve([]),
        ])

        // Build a map of server conversations for unread/preview data
        const serverMap = new Map(serverConvos.map((c) => [c.otherUserId, c]))

        // Merge: use friends list as base (for presence), enrich with server data
        const convs = friends.map((f) => {
          const server = serverMap.get(f.userId)
          return {
            channelId: `dm:${f.userId}`,
            userId: f.userId,
            username: f.username,
            displayName: f.displayName,
            online: f.online,
            unread: server?.unreadCount ?? 0,
            lastMessage: server?.lastMessagePreview,
            lastMessageAt: server?.lastMessageAt,
          }
        })

        // Also add any server conversations not in friends list (historical chats)
        for (const sc of serverConvos) {
          if (!friends.some((f) => f.userId === sc.otherUserId)) {
            convs.push({
              channelId: `dm:${sc.otherUserId}`,
              userId: sc.otherUserId,
              username: sc.otherUsername,
              displayName: sc.otherUsername,
              online: false,
              unread: sc.unreadCount,
              lastMessage: sc.lastMessagePreview,
              lastMessageAt: sc.lastMessageAt,
            })
          }
        }

        // Sort: unread first, then by lastMessageAt
        convs.sort((a, b) => {
          if (a.unread > 0 && b.unread === 0) return -1
          if (a.unread === 0 && b.unread > 0) return 1
          return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
        })

        setConversations(convs)
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load contacts')
        setLoading(false)
      }
    }

    loadData()
  }, [socialService, messengerService, setConversations])

  // ── Real-time message listener ──
  useEffect(() => {
    if (!messengerService) return

    const unsub = messengerService.onMessageReceived((msg: DmMessage) => {
      const channelId = `dm:${msg.senderId}`
      const storeMsg: Message = {
        id: msg.messageId,
        senderId: msg.senderId,
        senderUsername: msg.senderUsername,
        content: msg.body,
        createdAt: msg.createdAt,
      }
      addMessage(channelId, storeMsg)
      updateConversationPreview(channelId, msg.body.substring(0, 80), msg.createdAt)

      // If not the active conversation, increment unread
      const active = useMessengerStore.getState().activeConversationId
      if (active !== channelId) {
        incrementUnread(channelId)
      }

      // If sender not in conversation list, add them
      const exists = useMessengerStore.getState().conversations.some((c) => c.channelId === channelId)
      if (!exists) {
        addConversation({
          channelId,
          userId: msg.senderId,
          username: msg.senderUsername,
          displayName: msg.senderUsername,
          online: true,
          unread: 1,
          lastMessage: msg.body.substring(0, 80),
          lastMessageAt: msg.createdAt,
        })
      }
    })

    return unsub
  }, [messengerService, addMessage, incrementUnread, addConversation, updateConversationPreview])

  // ── Typing indicator listener ──
  useEffect(() => {
    if (!messengerService) return

    const unsub = messengerService.onTypingIndicator((userId: string, isTyping: boolean) => {
      setTyping(`dm:${userId}`, isTyping)
    })

    return unsub
  }, [messengerService, setTyping])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages.length])

  // ── Open conversation: fetch history + join channel + mark read ──
  useEffect(() => {
    if (!activeConversationId || !messengerService) return

    clearUnread(activeConversationId)

    const partnerId = activeConversationId.replace('dm:', '')

    // Mark read on server
    messengerService.markRead(partnerId).catch((err) =>
      console.warn('[messenger] Failed to mark read:', err)
    )

    // Join DM channel for typing indicators
    messengerService.joinConversationChannel(partnerId).catch((err) =>
      console.warn('[messenger] Failed to join channel:', err)
    )

    // Fetch history if not already loaded
    if (!loaded[activeConversationId]) {
      setLoadingMessages(true)
      messengerService.getMessages(partnerId)
        .then((result) => {
          const msgs: Message[] = result.messages.map((m) => ({
            id: m.messageId,
            senderId: m.senderId,
            senderUsername: m.senderUsername,
            content: m.body,
            createdAt: m.createdAt,
          }))
          setMessages(activeConversationId, msgs)
          setLoaded(activeConversationId)
          setLoadingMessages(false)
        })
        .catch((err) => {
          console.warn('[messenger] Failed to load messages:', err)
          setLoadingMessages(false)
        })
    }
  }, [activeConversationId, messengerService, loaded, clearUnread, setMessages, setLoaded, setLoadingMessages])

  const handleSelectConversation = useCallback((channelId: string) => {
    setActiveConversation(channelId)
    setBuddyListOpen(false)
  }, [setActiveConversation, setBuddyListOpen])

  // ── Send message ──
  const handleSend = useCallback(async () => {
    if (!activeConversationId || !composeText.trim() || sending || !messengerService) return

    const content = composeText.trim()
    const partnerId = activeConversationId.replace('dm:', '')
    setComposeText('')
    setSending(true)

    // Add message optimistically
    const tempId = `temp-${Date.now()}`
    const currentUserId = socialService?.getCurrentUserId() ?? 'me'
    const tempMessage: Message = {
      id: tempId,
      senderId: currentUserId,
      content,
      createdAt: Date.now(),
    }
    addMessage(activeConversationId, tempMessage)
    updateConversationPreview(activeConversationId, content.substring(0, 80), Date.now())

    try {
      await messengerService.sendMessage(partnerId, content)
      setSending(false)
    } catch (err) {
      console.error('[messenger] Failed to send message:', err)
      markMessageFailed(activeConversationId, tempId)
      setSending(false)
    }
  }, [activeConversationId, composeText, sending, messengerService, socialService, addMessage, updateConversationPreview, markMessageFailed])

  // ── Typing indicator on input ──
  const handleComposeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComposeText(e.target.value)
    if (activeConversationId && messengerService && e.target.value.length > 0) {
      const partnerId = activeConversationId.replace('dm:', '')
      messengerService.sendTypingIndicator(partnerId)
    }
  }, [activeConversationId, messengerService])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleBack = useCallback(() => {
    setBuddyListOpen(true)
  }, [setBuddyListOpen])

  // Calculate total unread
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0)

  const currentUserId = socialService?.getCurrentUserId()

  if (loading) {
    return (
      <div className="mm-root">
        <div className="mm-loading">Loading contacts...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mm-root">
        <div className="mm-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="mm-root">
      {/* Buddy List / Conversation List */}
      {buddyListOpen ? (
        <div className="mm-buddy-list">
          <div className="mm-header">
            <div className="mm-flower">✿</div>
            <div className="mm-title">Mutant Messenger</div>
            {totalUnread > 0 && (
              <div className="mm-unread-badge">{totalUnread}</div>
            )}
          </div>

          <div className="mm-status-bar">
            {conversations.filter((c) => c.online).length} online
          </div>

          <div className="mm-contacts">
            {/* Online first */}
            {conversations
              .filter((c) => c.online)
              .sort((a, b) => a.displayName.localeCompare(b.displayName))
              .map((conv) => (
                <div
                  key={conv.channelId}
                  className={`mm-contact${conv.unread > 0 ? ' unread' : ''}`}
                  onClick={() => handleSelectConversation(conv.channelId)}
                >
                  <div className="mm-contact-avatar">
                    {conv.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="mm-contact-info">
                    <div className="mm-contact-name">{conv.displayName}</div>
                    <div className="mm-contact-status online">Online</div>
                    {conv.lastMessage && (
                      <div className="mm-contact-preview">{conv.lastMessage}</div>
                    )}
                  </div>
                  {conv.unread > 0 && (
                    <div className="mm-contact-unread">{conv.unread}</div>
                  )}
                </div>
              ))}

            {/* Separator if both online and offline */}
            {conversations.some((c) => c.online) && conversations.some((c) => !c.online) && (
              <div className="mm-separator">Offline</div>
            )}

            {/* Offline */}
            {conversations
              .filter((c) => !c.online)
              .sort((a, b) => a.displayName.localeCompare(b.displayName))
              .map((conv) => (
                <div
                  key={conv.channelId}
                  className={`mm-contact offline${conv.unread > 0 ? ' unread' : ''}`}
                  onClick={() => handleSelectConversation(conv.channelId)}
                >
                  <div className="mm-contact-avatar">
                    {conv.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="mm-contact-info">
                    <div className="mm-contact-name">{conv.displayName}</div>
                    <div className="mm-contact-status">Offline</div>
                    {conv.lastMessage && (
                      <div className="mm-contact-preview">{conv.lastMessage}</div>
                    )}
                  </div>
                  {conv.unread > 0 && (
                    <div className="mm-contact-unread">{conv.unread}</div>
                  )}
                </div>
              ))}

            {conversations.length === 0 && (
              <div className="mm-empty">No contacts yet</div>
            )}
          </div>
        </div>
      ) : (
        /* Chat View */
        <div className="mm-chat">
          <div className="mm-chat-header">
            <button className="mm-back-btn" onClick={handleBack}>
              ◀
            </button>
            <div className="mm-chat-avatar">
              {activeConv?.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="mm-chat-info">
              <div className="mm-chat-name">{activeConv?.displayName}</div>
              <div className={`mm-chat-status ${activeConv?.online ? 'online' : ''}`}>
                {activeConv?.online ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>

          <div className="mm-messages">
            {loadingMessages ? (
              <div className="mm-messages-empty">Loading messages...</div>
            ) : activeMessages.length === 0 ? (
              <div className="mm-messages-empty">
                Start a conversation with {activeConv?.displayName}
              </div>
            ) : (
              activeMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`mm-message ${msg.senderId === currentUserId ? 'outgoing' : 'incoming'}${msg.failed ? ' failed' : ''}`}
                >
                  <div className="mm-message-content">
                    {escapeHtml(msg.content)}
                  </div>
                  <div className="mm-message-time">
                    {msg.failed ? 'Failed to send' : timeAgo(msg.createdAt)}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {typing[activeConversationId || ''] && (
            <div className="mm-typing">
              {activeConv?.displayName} is typing...
            </div>
          )}

          <div className="mm-compose">
            <textarea
              ref={composeRef}
              placeholder="Type a message..."
              value={composeText}
              onChange={handleComposeChange}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              className="mm-send-btn"
              onClick={handleSend}
              disabled={!composeText.trim() || sending}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/konpyuuta && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/konpyuuta/src/components/apps/Messenger.tsx
git commit -m "feat(messenger): wire Messenger UI to real Nakama DM backend"
```

---

### Task 7: Add CSS for New UI States

**Files:**
- Modify: `packages/konpyuuta/src/styles/cde.css`

- [ ] **Step 1: Add CSS for message preview, loading, and failed states**

Append to the Messenger section of `cde.css` (find the existing `.mm-` rules and add after them):

```css
/* ── Messenger: conversation preview ── */
.mm-contact-preview {
  font-size: 10px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
  margin-top: 1px;
}

/* ── Messenger: failed message ── */
.mm-message.failed .mm-message-content {
  opacity: 0.5;
}

.mm-message.failed .mm-message-time {
  color: #e74c3c;
  font-weight: bold;
}
```

- [ ] **Step 2: Verify the build**

Run: `cd packages/konpyuuta && npx tsc --noEmit`
Expected: 0 errors (CSS doesn't affect tsc but good to confirm nothing else broke)

- [ ] **Step 3: Commit**

```bash
git add packages/konpyuuta/src/styles/cde.css
git commit -m "feat(messenger): CSS for message preview and failed states"
```

---

### Task 8: Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Build konpyuuta package**

Run: `pnpm --filter @club-mutant/konpyuuta build`
Expected: Build succeeds

- [ ] **Step 2: Build client-3d**

Run: `cd client-3d && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Build full workspace**

Run: `pnpm -r build`
Expected: All packages build successfully

- [ ] **Step 4: Final commit if any fixups were needed**

If any build issues were found and fixed in previous steps, commit the fixes:

```bash
git add -A
git commit -m "fix(messenger): build fixups from verification"
```
