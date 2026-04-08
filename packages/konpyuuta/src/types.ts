// Shared types for KonpyuuTA React package

export interface WindowState {
  id: string
  title: string
  app: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
  minimized: boolean
  maximized: boolean
  shaded: boolean
  workspace: number
  props?: Record<string, unknown>
}

export interface DesktopIcon {
  id: string
  label: string
  icon: string          // path to icon image
  app: string           // app name to open
  appProps?: Record<string, unknown>
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  icon?: string
  app?: string          // which app to open on click
  appProps?: Record<string, unknown>
  createdAt: number
}

// ── Service Interfaces for Social Apps ─────────────────────────────────────

export interface PlaylistTrack {
  id: string
  title: string
  link: string
  duration: number
  thumbnail?: string
}

export interface Playlist {
  id: string
  name: string
  items: PlaylistTrack[]
}

export interface PlaylistService {
  getPlaylists: () => Playlist[]
  createPlaylist: (name: string) => void
  removePlaylist: (id: string) => void
  addTrack: (playlistId: string, track: PlaylistTrack) => void
  removeTrack: (playlistId: string, trackId: string) => void
  loadFromServer: () => Promise<void>
}

export interface WallPost {
  postId: string
  authorId: string
  authorUsername: string
  targetUserId: string
  content: string
  createdAt: number
}

export interface UserProfileMetadata {
  bio?: string
  favoriteSong?: string
  links?: Array<{ label: string; url: string }>
  [key: string]: unknown
}

export interface UserProfile {
  user_id: string
  username: string
  display_name: string
  avatar_url: string
  metadata: UserProfileMetadata
}

export interface SocialService {
  getCurrentUserId: () => string | null
  getCurrentUsername: () => string | null
  getUserProfile: (userId: string) => Promise<UserProfile>
  getMyAccount: () => Promise<UserProfile>
  getWallPosts: (targetUserId: string, cursor?: string) => Promise<{ posts: WallPost[]; cursor?: string }>
  createWallPost: (targetUserId: string, content: string) => Promise<WallPost>
  deleteWallPost: (postId: string, targetUserId: string) => Promise<void>
  listFriends: () => Promise<Array<{ userId: string; username: string; displayName: string; online: boolean }>>
}

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

export interface KonpyuuTAContextValue {
  playlistService?: PlaylistService
  socialService?: SocialService
  messengerService?: MessengerService
  env: {
    youtubeApiUrl?: string
  }
}
