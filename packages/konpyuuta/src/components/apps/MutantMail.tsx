import { useState, useCallback, useEffect } from 'react'
import {
  useMailStore,
  type MailMessage,
  type MailFolder,
} from '../../stores/mailStore'

const FOLDER_LABELS: Record<MailFolder, string> = {
  inbox: 'Inbox',
  sent: 'Sent',
  drafts: 'Drafts',
  trash: 'Trash',
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function MutantMail() {
  const {
    messages,
    selectedMessageId,
    currentFolder,
    composing,
    setSelectedMessage,
    setCurrentFolder,
    setComposing,
    addMessage,
    removeMessage,
    markAsRead,
    moveToTrash,
    getFolderMessages,
    getUnreadCount,
  } = useMailStore()

  const [toField, setToField] = useState('')
  const [subjectField, setSubjectField] = useState('')
  const [bodyField, setBodyField] = useState('')
  const [sending, setSending] = useState(false)

  const folderMessages = getFolderMessages(currentFolder)
  const unreadCount = getUnreadCount(currentFolder)
  const selectedMessage = messages.find((m) => m.id === selectedMessageId)

  // Mark as read when selected
  useEffect(() => {
    if (selectedMessageId && selectedMessage && !selectedMessage.read) {
      markAsRead(selectedMessageId)
    }
  }, [selectedMessageId, selectedMessage, markAsRead])

  const handleSelectMessage = useCallback((id: string) => {
    setSelectedMessage(id)
    setComposing(false)
  }, [setSelectedMessage, setComposing])

  const handleDelete = useCallback(() => {
    if (!selectedMessageId) return

    if (currentFolder === 'trash') {
      if (confirm('Permanently delete this message?')) {
        removeMessage(selectedMessageId)
      }
    } else {
      moveToTrash(selectedMessageId)
    }
  }, [selectedMessageId, currentFolder, removeMessage, moveToTrash])

  const handleSend = useCallback(async () => {
    if (!toField.trim() || !subjectField.trim() || sending) return

    setSending(true)

    // Create sent message
    const sentMessage: MailMessage = {
      id: crypto.randomUUID(),
      from: 'me',
      to: toField.trim(),
      subject: subjectField.trim(),
      body: bodyField.trim(),
      read: true,
      folder: 'sent',
      createdAt: Date.now(),
    }

    addMessage(sentMessage)

    // Reset form
    setToField('')
    setSubjectField('')
    setBodyField('')
    setComposing(false)
    setSending(false)

    // Switch to sent folder
    setCurrentFolder('sent')
  }, [toField, subjectField, bodyField, sending, addMessage, setComposing, setCurrentFolder])

  const handleNewMessage = useCallback(() => {
    setComposing(true)
    setSelectedMessage(null)
    setToField('')
    setSubjectField('')
    setBodyField('')
  }, [setComposing, setSelectedMessage])

  const handleReply = useCallback(() => {
    if (!selectedMessage) return

    setComposing(true)
    setToField(selectedMessage.from)
    setSubjectField(`Re: ${selectedMessage.subject}`)
    setBodyField(`\n\n--- Original Message ---\n${selectedMessage.body}`)
  }, [selectedMessage])

  return (
    <div className="ml-root">
      {/* Folder sidebar */}
      <div className="ml-sidebar">
        <div className="ml-logo">
          <span className="ml-logo-icon">✉</span>
          <span className="ml-logo-text">MutantMail</span>
        </div>

        <button className="ml-compose-btn" onClick={handleNewMessage}>
          Compose
        </button>

        <div className="ml-folders">
          {(['inbox', 'sent', 'drafts', 'trash'] as MailFolder[]).map((folder) => {
            const count = getUnreadCount(folder)
            return (
              <div
                key={folder}
                className={`ml-folder${currentFolder === folder ? ' active' : ''}`}
                onClick={() => setCurrentFolder(folder)}
              >
                <span className="ml-folder-icon">
                  {folder === 'inbox' && '📥'}
                  {folder === 'sent' && '📤'}
                  {folder === 'drafts' && '📝'}
                  {folder === 'trash' && '🗑️'}
                </span>
                <span className="ml-folder-label">{FOLDER_LABELS[folder]}</span>
                {count > 0 && (
                  <span className="ml-folder-count">{count}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="ml-main">
        {/* Message list */}
        <div className="ml-list">
          <div className="ml-list-header">
            <span className="ml-list-title">{FOLDER_LABELS[currentFolder]}</span>
            {unreadCount > 0 && (
              <span className="ml-list-count">{unreadCount} unread</span>
            )}
          </div>

          <div className="ml-messages">
            {folderMessages.length === 0 ? (
              <div className="ml-empty">No messages in {FOLDER_LABELS[currentFolder].toLowerCase()}</div>
            ) : (
              folderMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`ml-message-row${msg.read ? '' : ' unread'}${selectedMessageId === msg.id ? ' selected' : ''}`}
                  onClick={() => handleSelectMessage(msg.id)}
                >
                  <div className="ml-message-checkbox">
                    <input type="checkbox" />
                  </div>
                  <div className="ml-message-from">
                    {msg.read ? '' : <span className="ml-unread-dot">●</span>}
                    {msg.from}
                  </div>
                  <div className="ml-message-subject">{msg.subject}</div>
                  <div className="ml-message-date">{formatDate(msg.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Preview pane */}
        <div className="ml-preview">
          {composing ? (
            <div className="ml-compose-form">
              <div className="ml-compose-header">New Message</div>
              <div className="ml-compose-field">
                <label>To:</label>
                <input
                  type="text"
                  value={toField}
                  onChange={(e) => setToField(e.target.value)}
                  placeholder="recipient@example.com"
                />
              </div>
              <div className="ml-compose-field">
                <label>Subject:</label>
                <input
                  type="text"
                  value={subjectField}
                  onChange={(e) => setSubjectField(e.target.value)}
                  placeholder="Enter subject"
                />
              </div>
              <div className="ml-compose-body">
                <textarea
                  value={bodyField}
                  onChange={(e) => setBodyField(e.target.value)}
                  placeholder="Write your message..."
                />
              </div>
              <div className="ml-compose-actions">
                <button
                  className="ml-send-btn"
                  onClick={handleSend}
                  disabled={!toField.trim() || !subjectField.trim() || sending}
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
                <button
                  className="ml-cancel-btn"
                  onClick={() => setComposing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : selectedMessage ? (
            <div className="ml-message-view">
              <div className="ml-view-header">
                <div className="ml-view-subject">{selectedMessage.subject}</div>
                <div className="ml-view-meta">
                  <span className="ml-view-from">From: {selectedMessage.from}</span>
                  <span className="ml-view-to">To: {selectedMessage.to}</span>
                  <span className="ml-view-date">
                    {new Date(selectedMessage.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="ml-view-body">
                {escapeHtml(selectedMessage.body)}
              </div>
              <div className="ml-view-actions">
                <button className="ml-action-btn" onClick={handleReply}>
                  Reply
                </button>
                <button className="ml-action-btn delete" onClick={handleDelete}>
                  {currentFolder === 'trash' ? 'Delete Forever' : 'Delete'}
                </button>
              </div>
            </div>
          ) : (
            <div className="ml-no-selection">
              Select a message to read
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
