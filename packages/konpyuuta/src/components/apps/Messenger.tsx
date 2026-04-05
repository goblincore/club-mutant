import { useState, useEffect, useCallback, useRef } from 'react'
import { useKonpyuuTA } from '../../context/KonpyuuTAContext'
import { useMessengerStore, type Message } from '../../stores/messengerStore'

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
  const { socialService } = useKonpyuuTA()
  const {
    conversations,
    activeConversationId,
    messages,
    typing,
    buddyListOpen,
    setConversations,
    addConversation,
    setActiveConversation,
    addMessage,
    setMessages,
    setTyping,
    setBuddyListOpen,
    clearUnread,
  } = useMessengerStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composeText, setComposeText] = useState('')
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLTextAreaElement>(null)

  const activeConv = conversations.find((c) => c.channelId === activeConversationId)
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : []

  // Load friends as potential conversation partners
  useEffect(() => {
    if (!socialService) {
      setError('Social service not available')
      setLoading(false)
      return
    }

    setLoading(true)
    socialService.listFriends()
      .then((friends) => {
        const convs = friends.map((f) => ({
          channelId: `dm:${f.userId}`,
          userId: f.userId,
          username: f.username,
          displayName: f.displayName,
          online: f.online,
          unread: 0,
        }))
        setConversations(convs)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load contacts')
        setLoading(false)
      })
  }, [socialService, setConversations])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages.length])

  // Clear unread when opening conversation
  useEffect(() => {
    if (activeConversationId) {
      clearUnread(activeConversationId)
    }
  }, [activeConversationId, clearUnread])

  const handleSelectConversation = useCallback((channelId: string) => {
    setActiveConversation(channelId)
    setBuddyListOpen(false)
  }, [setActiveConversation, setBuddyListOpen])

  const handleSend = useCallback(async () => {
    if (!activeConversationId || !composeText.trim() || sending) return

    const content = composeText.trim()
    setComposeText('')
    setSending(true)

    // Add message optimistically
    const tempId = `temp-${Date.now()}`
    const tempMessage: Message = {
      id: tempId,
      senderId: 'me',
      content,
      createdAt: Date.now(),
    }
    addMessage(activeConversationId, tempMessage)

    // TODO: Send via Nakama chat channel
    // For now, simulate echo after delay
    setTimeout(() => {
      setSending(false)
    }, 500)
  }, [activeConversationId, composeText, sending, addMessage])

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
            {activeMessages.length === 0 ? (
              <div className="mm-messages-empty">
                Start a conversation with {activeConv?.displayName}
              </div>
            ) : (
              activeMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`mm-message ${msg.senderId === 'me' ? 'outgoing' : 'incoming'}`}
                >
                  <div className="mm-message-content">
                    {escapeHtml(msg.content)}
                  </div>
                  <div className="mm-message-time">
                    {timeAgo(msg.createdAt)}
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
              onChange={(e) => setComposeText(e.target.value)}
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
