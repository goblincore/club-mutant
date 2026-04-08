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

    const loadData = async () => {
      try {
        const [friends, serverConvos] = await Promise.all([
          socialService.listFriends(),
          messengerService?.listConversations() ?? Promise.resolve([]),
        ])

        const serverMap = new Map(serverConvos.map((c) => [c.otherUserId, c]))

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

      const active = useMessengerStore.getState().activeConversationId
      if (active !== channelId) {
        incrementUnread(channelId)
      }

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

    messengerService.markRead(partnerId).catch((err) =>
      console.warn('[messenger] Failed to mark read:', err)
    )

    messengerService.joinConversationChannel(partnerId).catch((err) =>
      console.warn('[messenger] Failed to join channel:', err)
    )

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

            {conversations.some((c) => c.online) && conversations.some((c) => !c.online) && (
              <div className="mm-separator">Offline</div>
            )}

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
