export interface OS5kMessage {
  type: 'os5k:request' | 'os5k:response' | 'os5k:push'
  id: string
  method: string
  payload: unknown
  error?: string
}

export interface UserProfile {
  userId: string
  username: string
  displayName: string
  avatarUrl: string
  bio: string
  favoriteSong: string
  links: Array<{ label: string; url: string }>
  backgroundUrl: string
}

export interface FriendEntry {
  userId: string
  username: string
  displayName: string
  avatarUrl: string
  online: boolean
}

export interface MailMessage {
  messageId: string
  senderId: string
  recipientId: string
  senderUsername: string
  recipientUsername: string
  subject: string
  body: string
  createdAt: number
  read: boolean
}

export interface ConversationSummary {
  otherUserId: string
  otherUsername: string
  lastMessagePreview: string
  lastMessageAt: number
  unreadCount: number
}

export interface PlaylistEntry {
  id: string
  name: string
  trackCount: number
}
