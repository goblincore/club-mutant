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
