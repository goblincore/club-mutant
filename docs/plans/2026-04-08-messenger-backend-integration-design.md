# Messenger Backend Integration — Design Spec

> Wire the KonpyuuTA Messenger (ICQ-style IM) to Nakama DMs with real-time delivery and typing indicators.

## Context

The Messenger UI (`packages/konpyuuta/src/components/apps/Messenger.tsx`) is fully built with buddy list, chat view, typing indicator display, and unread badges. The Nakama backend has complete DM RPCs (`send_message`, `list_conversations`, `get_messages`, `mark_read`). The client already wraps these in `client-3d/src/network/nakamaClient.ts` (`sendDirectMessage`, `listConversations`, `getDirectMessages`, `markMessagesRead`). The Nakama socket is connected with notification handling (code 100 for DMs).

**Gap:** The Messenger component uses only `socialService.listFriends()` for contacts and has a `// TODO: Send via Nakama chat channel` placeholder. Messages are purely in-memory. No real-time delivery. No typing indicators.

## Architecture

All messaging stays in the Nakama domain — no Colyseus involvement. Three integration layers:

### 1. MessengerService Interface (konpyuuta types)

New service interface in `packages/konpyuuta/src/types.ts`, added to `KonpyuuTAContextValue`:

```typescript
export interface MessengerService {
  // DM operations (backed by existing Nakama RPCs)
  sendMessage(recipientId: string, body: string): Promise<{ messageId: string; createdAt: number }>
  getMessages(partnerId: string, cursor?: string): Promise<{ messages: DmMessage[]; cursor?: string }>
  listConversations(): Promise<ConversationSummary[]>
  markRead(partnerId: string): Promise<void>

  // Real-time (Nakama socket + channels)
  onMessageReceived(cb: (msg: DmMessage) => void): () => void   // returns unsubscribe
  onTypingIndicator(cb: (userId: string, typing: boolean) => void): () => void
  joinConversationChannel(partnerId: string): Promise<void>
  sendTypingIndicator(partnerId: string): void

  // Lifecycle
  connect(): void     // setup socket listeners
  disconnect(): void  // cleanup
}

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
```

### 2. MessengerService Implementation (client-3d)

New file: `client-3d/src/services/messengerService.ts`

Wraps existing `nakamaClient.ts` functions and adds socket channel management:

**DM Operations:**
- `sendMessage()` → calls `sendDirectMessage()` from nakamaClient (uses `send_message` RPC). Passes subject as "dm" (the RPC requires it but Messenger doesn't use subjects).
- `getMessages()` → calls `getDirectMessages()` from nakamaClient. Maps the `MailMessage` response type to `DmMessage`.
- `listConversations()` → calls `listConversations()` from nakamaClient. Returns `ConversationSummary[]`.
- `markRead()` → calls `markMessagesRead()` from nakamaClient.

**Real-time Delivery (Nakama Notifications):**
- `connect()` registers a callback on the existing `socket.onnotification` handler for code 100 (DM notifications). When a notification arrives, it constructs a `DmMessage` from the notification payload and invokes registered `onMessageReceived` callbacks.
- Need to export `getSocket()` from nakamaClient (currently `_socket` is private).

**Typing Indicators (Nakama Realtime Channels):**
- `joinConversationChannel(partnerId)` → joins a Nakama DM channel. Channel ID: deterministic from sorted user IDs so both parties join the same channel. Uses `socket.joinChat(partnerId, 2)` (type 2 = direct message channel in Nakama).
- `sendTypingIndicator(partnerId)` → sends a channel message with `{ type: "typing" }` on the joined channel. Debounced to max once per 2 seconds.
- `socket.onchannelmessage` listener checks for typing messages and invokes `onTypingIndicator` callbacks. Auto-clears typing after 3 seconds of silence.
- Channels are joined lazily when a conversation is opened, and tracked in a `Map<partnerId, channelId>`.

**Cleanup:**
- `disconnect()` removes notification listeners, leaves all joined channels, clears the channel map.

### 3. nakamaClient.ts Changes

Minimal additions to expose socket access:
- Export `getSocket(): Socket | null` — returns `_socket` for the messenger service to register listeners.
- Export `onNotification(code: number, cb: (data: any) => void): () => void` — registers a typed notification callback, returns unsubscribe. Wraps the existing `socket.onnotification` to support multiple listeners (current implementation only has one handler).

### 4. KonpyuuTAShell Wiring

In `client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx`:
- Create `messengerService` instance using the new service class
- Pass it through `KonpyuuTAProvider` alongside existing `playlistService` and `socialService`
- Call `connect()` on mount, `disconnect()` on unmount

### 5. Messenger Store Updates

In `packages/konpyuuta/src/stores/messengerStore.ts`:

**New state:**
- `loaded: Record<string, boolean>` — tracks which conversations have had history fetched
- `loadingMessages: boolean` — loading state for message fetch

**Changed behavior:**
- Remove hardcoded `senderId: 'me'` — use actual user ID from socialService

### 6. Messenger.tsx Updates

**Initialization (useEffect on mount):**
1. Call `messengerService.listConversations()` to get conversation list with unread counts and last message previews
2. Merge with `socialService.listFriends()` for online status (conversations RPC doesn't include presence)
3. Call `messengerService.connect()` to start listening for real-time messages

**Opening a conversation:**
1. If not already loaded (`!loaded[channelId]`), fetch history via `messengerService.getMessages(partnerId)`
2. Store messages in messengerStore, mark as loaded
3. Call `messengerService.joinConversationChannel(partnerId)` for typing indicators
4. Call `messengerService.markRead(partnerId)` to clear server-side unread count

**Sending a message:**
1. Add message optimistically to store (keep current behavior)
2. Call `messengerService.sendMessage(recipientId, body)`
3. On failure, mark message as failed in store (add `failed?: boolean` to Message type)

**Receiving a message (real-time):**
1. `onMessageReceived` callback adds to store via `addMessage()`
2. If conversation not in list, add it (new conversation from someone not yet chatted with)
3. If not the active conversation, increment unread
4. Play notification sound (optional, stretch)

**Typing indicators:**
1. On text input change, call `messengerService.sendTypingIndicator(partnerId)` (debounced)
2. `onTypingIndicator` callback updates store via `setTyping()`

## Nakama Channel Strategy

Nakama's built-in DM channels (type 2) handle the channel ID deterministically — you call `socket.joinChat(otherUserId, 2)` and Nakama creates a channel scoped to both users. No manual channel ID construction needed.

Channel messages are ephemeral (not persisted) — we use them ONLY for typing indicators. Actual messages go through the storage RPCs for persistence and dual-copy semantics.

## Data Flow Diagram

```
SENDING:
  Messenger.tsx → handleSend()
    → store.addMessage() [optimistic]
    → messengerService.sendMessage(recipientId, body)
      → nakamaClient.sendDirectMessage() → Nakama RPC "send_message"
        → Nakama stores message + sends notification (code 100) to recipient

RECEIVING:
  Nakama notification (code 100)
    → nakamaClient socket.onnotification
    → messengerService notification listener
    → onMessageReceived callback
    → store.addMessage() + incrementUnread (if not active conversation)
    → Messenger.tsx re-renders

TYPING:
  Messenger.tsx → onInput
    → messengerService.sendTypingIndicator(partnerId) [debounced 2s]
      → socket.writeChatMessage(channelId, { type: "typing" })
    
  Partner's socket.onchannelmessage
    → messengerService channel message listener
    → onTypingIndicator callback
    → store.setTyping(channelId, true)
    → auto-clear after 3s timeout
```

## Files Changed

| File | Change |
|------|--------|
| `packages/konpyuuta/src/types.ts` | Add `MessengerService`, `DmMessage`, `ConversationSummary` interfaces; add to `KonpyuuTAContextValue` |
| `client-3d/src/services/messengerService.ts` | **New** — implements MessengerService, wraps nakamaClient + socket channels |
| `client-3d/src/network/nakamaClient.ts` | Export `getSocket()`, add multi-listener notification support |
| `client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx` | Create and wire messengerService into provider |
| `packages/konpyuuta/src/stores/messengerStore.ts` | Add `loaded`, `loadingMessages` state; update Message type |
| `packages/konpyuuta/src/components/apps/Messenger.tsx` | Wire to messengerService for send/receive/typing/history |

## Out of Scope

- Group chat / room channels (stays in Colyseus)
- Message editing or deletion
- File/image attachments
- Read receipts UI (mark_read is called but no visual indicator)
- Notification sounds
- Offline message queue
