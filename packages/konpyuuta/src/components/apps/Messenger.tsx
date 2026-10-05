import { SignalTransition } from './SignalTransition'
import { IncomingMessageText } from './IncomingMessageText'
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useKonpyuuTA } from '../../context/KonpyuuTAContext'
import { useMessengerStore, type Message, type Conversation } from '../../stores/messengerStore'
import { useWindowStore } from '../../stores/windowStore'
import { SOCIAL_ICONS } from '../../lib/socialIcons'
import { SignalOrgan } from './SignalOrgan'
import { SignalAvatar } from './SignalOrgan'
import { AppWordmark } from './AnalogAccents'
import { PixelSymbol } from './PixelSymbol'
import type { DmMessage } from '../../types'

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
function sendError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 180)
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error.slice(0, 180)
  return 'Could not reach the server. Please try again.'
}
const dayLabel = (timestamp: number) => new Date(timestamp).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const toMessage = (m: DmMessage): Message => ({ id: m.messageId, senderId: m.senderId, senderUsername: m.senderUsername, content: m.body, createdAt: m.createdAt, isPreview: m.isPreview })
interface HistoryState { loading?: boolean; loaded?: boolean; error?: string }

export function Messenger({ windowId }: { windowId?: string }) {
  const { socialService: social, messengerService: service } = useKonpyuuTA()
  const store = useMessengerStore()
  const ownerId = social?.getCurrentUserId() ?? null
  const focused = useWindowStore((s) => !windowId || s.activeWindowId === windowId)
  const [visible, setVisible] = useState(() => !document.hidden && document.hasFocus())
  const [connected, setConnected] = useState(!service?.onConnectionChanged)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [readError, setReadError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [history, setHistory] = useState<Record<string, HistoryState>>({})
  const [visibleCount, setVisibleCount] = useState(80)
  const [jumpToLatest, setJumpToLatest] = useState(false)
  const pendingLoads = useRef(new Map<string, Promise<void>>())
  const mounted = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLTextAreaElement>(null)
  const nearBottom = useRef(true)
  const previousScroll = useRef({ channel: '', count: 0, height: 0, visibleCount: 80 })
  const owned = store.ownerId === ownerId
  const conversations = owned ? store.conversations : []
  const activeId = owned ? store.activeConversationId : null
  const active = conversations.find((c) => c.channelId === activeId)
  const messages = activeId ? store.messages[activeId] ?? [] : []
  const draft = activeId ? store.drafts[activeId] ?? '' : ''

  useEffect(() => {
    mounted.current = true
    const update = () => setVisible(!document.hidden && document.hasFocus())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])

  useEffect(() => {
    store.resetForUser(ownerId)
    setHistory({})
    pendingLoads.current.clear()
    setReadError('')
    setQuery('')
  }, [ownerId, store.resetForUser])

  useEffect(() => service?.onConnectionChanged?.((online) => {
    setConnected(online)
    if (online) setRefresh((r) => r + 1)
  }), [service])

  useEffect(() => {
    let cancelled = false
    setError('')
    setLoading(true)
    if (!ownerId || !social || !service) { setLoading(false); return }
    Promise.allSettled([social.listFriends(), service.listConversations()]).then(([friendsResult, conversationResult]) => {
      if (cancelled || useMessengerStore.getState().ownerId !== ownerId) return
      const friends = friendsResult.status === 'fulfilled' ? friendsResult.value : []
      const summaries = conversationResult.status === 'fulfilled' ? conversationResult.value : []
      const contacts = new Map<string, Conversation>()
      for (const c of summaries) contacts.set(c.otherUserId, {
        channelId: `dm:${c.otherUserId}`, userId: c.otherUserId, username: c.otherUsername,
        displayName: c.otherUsername, online: false, unread: c.unreadCount,
        lastMessage: c.lastMessagePreview, lastMessageAt: c.lastMessageAt,
      })
      for (const friend of friends) contacts.set(friend.userId, {
        channelId: `dm:${friend.userId}`, unread: 0, ...contacts.get(friend.userId), ...friend,
        displayName: friend.displayName || friend.username,
      })
      store.mergeConversations([...contacts.values()])
      if (friendsResult.status === 'rejected' || conversationResult.status === 'rejected') {
        setError('Some contacts or conversations could not load. Try again.')
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [social, service, ownerId, refresh, store.mergeConversations])

  useEffect(() => social?.onPresenceChanged?.(store.setPresence), [social, store.setPresence])

  const loadHistory = useCallback((channelId: string): Promise<void> => {
    if (!service || !ownerId) return Promise.resolve()
    const pending = pendingLoads.current.get(channelId)
    if (pending) return pending
    setHistory((h) => ({ ...h, [channelId]: { ...h[channelId], loading: true, error: '' } }))
    const request = service.getMessages(channelId.slice(3)).then((result) => {
      if (!mounted.current || useMessengerStore.getState().ownerId !== ownerId) return
      store.mergeMessages(channelId, result.messages.map(toMessage))
      setHistory((h) => ({ ...h, [channelId]: { loaded: true, loading: false } }))
    }).catch(() => {
      if (!mounted.current || useMessengerStore.getState().ownerId !== ownerId) return
      setHistory((h) => ({ ...h, [channelId]: { ...h[channelId], loading: false, error: 'History could not load. Your draft is safe.' } }))
    }).finally(() => {
      if (pendingLoads.current.get(channelId) === request) pendingLoads.current.delete(channelId)
    })
    pendingLoads.current.set(channelId, request)
    return request
  }, [service, ownerId, store.mergeMessages])

  useEffect(() => {
    if (!service || !ownerId) return
    const unsubMessages = service.onMessageReceived((message) => {
      if (useMessengerStore.getState().ownerId !== ownerId) return
      // Mark read only after the visible thread has synchronized successfully.
      store.receiveMessage(toMessage(message), false)
      if (message.isPreview && useMessengerStore.getState().activeConversationId === `dm:${message.senderId}`) void loadHistory(`dm:${message.senderId}`)
    })
    const unsubTyping = service.onTypingIndicator((id, typing) => store.setTyping(`dm:${id}`, typing))
    return () => { unsubMessages(); unsubTyping() }
  }, [service, ownerId, loadHistory, store.receiveMessage, store.setTyping])

  useEffect(() => {
    if (!activeId || !service) return
    void loadHistory(activeId)
    service.joinConversationChannel(activeId.slice(3)).catch(() => {})
  }, [activeId, service, refresh, loadHistory])

  const unread = active?.unread ?? 0
  const loaded = activeId ? history[activeId]?.loaded : false
  const historyLoading = activeId ? history[activeId]?.loading : false
  useEffect(() => {
    if (!activeId || !service || !loaded || historyLoading || !focused || !visible || !unread) return
    let cancelled = false
    const count = unread
    setReadError('')
    service.markRead(activeId.slice(3)).then(() => {
      if (cancelled || useMessengerStore.getState().ownerId !== ownerId) return
      const current = useMessengerStore.getState().conversations.find((c) => c.channelId === activeId)
      if (current?.unread === count) store.clearUnread(activeId)
    }).catch(() => { if (!cancelled) setReadError('Could not sync read status. Reopen this chat to retry.') })
    return () => { cancelled = true }
  }, [activeId, service, ownerId, loaded, historyLoading, focused, visible, unread, refresh, store.clearUnread])

  useLayoutEffect(() => {
    const element = listRef.current
    if (!element || !activeId) return
    const previous = previousScroll.current
    if (previous.channel !== activeId) {
      nearBottom.current = true
      setVisibleCount(80)
      setJumpToLatest(false)
      setReadError('')
      element.scrollTop = element.scrollHeight
    } else if (visibleCount > previous.visibleCount) {
      element.scrollTop += element.scrollHeight - previous.height
    } else if (nearBottom.current) {
      element.scrollTop = element.scrollHeight
    } else if (messages.length > previous.count) setJumpToLatest(true)
    previousScroll.current = { channel: activeId, count: messages.length, height: element.scrollHeight, visibleCount }
  }, [activeId, messages, visibleCount, historyLoading])

  async function sendMessage(retry?: Message) {
    if (!activeId || !service || !ownerId) return
    const channel = activeId
    const content = retry?.content ?? draft.trim()
    if (!content || content.length > 2000 || (useMessengerStore.getState().messages[channel] ?? []).some((m) => m.pending)) return
    const id = retry?.id ?? `temp-${crypto.randomUUID()}`
    if (retry) store.updateMessage(channel, id, { pending: true, failed: false, error: undefined })
    else {
      store.setDraft(channel, '')
      store.mergeMessages(channel, [{ id, senderId: ownerId, content, createdAt: Date.now(), pending: true }])
    }
    nearBottom.current = true
    composeRef.current?.focus()
    try {
      const sent = await service.sendMessage(channel.slice(3), content)
      if (useMessengerStore.getState().ownerId !== ownerId) return
      store.updateMessage(channel, id, { id: sent.messageId, createdAt: sent.createdAt, pending: false, failed: false, error: undefined })
      store.updateConversationPreview(channel, content.slice(0, 80), sent.createdAt)
    } catch (error) {
      if (useMessengerStore.getState().ownerId === ownerId) store.updateMessage(channel, id, { pending: false, failed: true, error: sendError(error) })
    }
  }

  const contacts = conversations.filter((c) => `${c.displayName} ${c.username}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) =>
    (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0) || Number(b.online) - Number(a.online) || (a.displayName || a.username).localeCompare(b.displayName || b.username))
  const onlineCount = conversations.filter((c) => c.online).length
  const shownMessages = messages.slice(-visibleCount)
  const inputId = `mm-message-${windowId ?? 'standalone'}`
  const sending = messages.some((m) => m.pending)

  if (!ownerId || !social || !service) return <div className="mm-root mm-sign-in"><SignalTransition selective trigger="sign-in" /><SignalOrgan /><span className="mm-eyebrow">MESSENGER / OFFLINE</span><h2 data-signal-text>Is anybody there?</h2><p>Sign in to chat with your Club Mutant friends.</p></div>

  return <div className={`mm-root${active ? ' mm-has-chat' : ''}`}>
    <SignalTransition selective enabled={!loading && !activeId} trigger="welcome" />
    <header className="mm-toolbar"><img src={SOCIAL_ICONS.messenger} alt="" /><div><AppWordmark label="Messenger" /><span>A CONNECTION ACROSS THE ETHER</span></div><span className={`mm-connection${connected ? ' mm-connected' : ''}`}><i />{connected ? 'Connected' : 'Disconnected'}{!connected && <button onClick={() => service.connect()}>Reconnect</button>}</span></header>
    {error && <div className="mm-notice" role="alert">{error}<button onClick={() => setRefresh((r) => r + 1)}>Retry</button></div>}
    <div className="mm-layout">
      <aside className="mm-contacts" aria-label="Conversations">
        <div className="mm-contacts-heading"><strong>CONTACTS</strong><span>{onlineCount} online</span></div>
        <label className="mm-search"><span className="mm-sr-only">Find a friend</span><input type="search" placeholder="Find a friend…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div className="mm-contact-list">
          {loading && !contacts.length && <p className="mm-list-note" role="status">Gathering your people…</p>}
          {!loading && !contacts.length && <p className="mm-list-note">{query ? 'No matching friends.' : 'No conversations yet. Add a friend in Guestbook to say hello.'}</p>}
          {contacts.map((c) => <button key={c.channelId} className={`mm-contact${activeId === c.channelId ? ' mm-selected' : ''}`} aria-pressed={activeId === c.channelId} onClick={() => store.setActiveConversation(c.channelId)}>
            <span className="mm-avatar" aria-hidden="true"><SignalAvatar seed={c.userId} /><i className={c.online ? 'mm-online' : ''} /></span>
            <span className="mm-contact-text"><strong>{c.displayName || c.username}</strong><span>{c.lastMessage || (c.online ? 'Online · say hello' : 'Leave a message')}</span></span>
            {!!c.unread && <span className="mm-unread" aria-label={`${c.unread} unread messages`}>{c.unread > 99 ? '99+' : c.unread}</span>}
          </button>)}
        </div>
        <footer className="mm-self"><i />Signed in as <strong>{social.getCurrentUsername() || 'you'}</strong></footer>
      </aside>
      <main className="mm-chat">
        {!active ? <div className="mm-welcome"><SignalOrgan /><span className="mm-eyebrow">CHANNEL OPEN / AWAITING CONTACT</span><h2 data-signal-text>Is anybody there?</h2><p>Choose a contact. Make a connection.<br />Offline friends will find it when they’re back.</p><div className="mm-welcome-stamps" aria-hidden="true"><SignalAvatar seed="imp" /><SignalAvatar seed="troll" /><SignalAvatar seed="moth" /></div></div> : <>
          <header className="mm-chat-heading"><button className="mm-back" onClick={() => store.setActiveConversation(null)} aria-label="Back to conversations">←</button><span className="mm-avatar" aria-hidden="true"><SignalAvatar seed={active.userId} /></span><div><strong>{active.displayName || active.username}</strong><span><i className={active.online ? 'mm-online' : ''} />{active.online ? 'Online now' : 'Offline · messages will be waiting'}</span></div><button className="mm-refresh" onClick={() => { void loadHistory(activeId!); setRefresh((r) => r + 1) }} aria-label="Refresh conversation" title="Refresh conversation">↻</button></header>
          <div className="mm-messages" ref={listRef} role="log" aria-label={`Messages with ${active.displayName || active.username}`} aria-live="polite" aria-relevant="additions text" onScroll={() => {
            const el = listRef.current!
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
            if (nearBottom.current) setJumpToLatest(false)
          }}>
            {historyLoading && <p className="mm-history-status" role="status">Fetching your conversation…</p>}
            {activeId && history[activeId]?.error && <div className="mm-history-error" role="alert">{history[activeId].error}<button onClick={() => void loadHistory(activeId)}>Retry history</button></div>}
            {readError && <p className="mm-history-error" role="alert">{readError}</p>}
            {messages.length > visibleCount && <button className="mm-earlier" onClick={() => setVisibleCount((n) => n + 80)}>Show earlier messages</button>}
            {!messages.length && loaded && !historyLoading && <div className="mm-first-note"><img src={SOCIAL_ICONS.mutantmail} alt="" /><p>The start of a little conversation.<br />Send a hello below.</p></div>}
            {shownMessages.map((message, index) => {
              const mine = message.senderId === ownerId
              const previous = shownMessages[index - 1]
              const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
              return <div key={message.id}>{newDay && <div className="mm-date"><span>{dayLabel(message.createdAt)}</span></div>}<div className={`mm-message${mine ? ' mm-mine' : ''}${message.failed ? ' mm-failed' : ''}`}><div className="mm-bubble"><p>{mine || message.isPreview ? message.content : <IncomingMessageText key={`${message.id}:full`} text={message.content} messageId={message.id} receivedAt={store.incomingSignals[message.id]} />}</p>{message.isPreview && <small>Preview · refresh to load the full message</small>}</div><div className="mm-message-meta"><time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt)}</time>{message.pending ? <span>Sending…</span> : message.failed ? <><span role="alert">Not sent{message.error ? ` · ${message.error}` : ''}</span><button disabled={sending} onClick={() => void sendMessage(message)}>Retry</button></> : mine ? <span>Sent</span> : null}</div></div></div>
            })}
          </div>
          {jumpToLatest && <button className="mm-jump" onClick={() => { nearBottom.current = true; listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); setJumpToLatest(false) }}>↓ New messages · jump to latest</button>}
          <div className="mm-typing" role="status">{activeId && store.typing[activeId] ? <><span className="mm-typing-dots" aria-hidden="true">•••</span> {active.displayName || active.username} is typing</> : <span><PixelSymbol kind="tape" /> Draft retained on this device.</span>}</div>
          <form className="mm-compose" onSubmit={(event) => { event.preventDefault(); void sendMessage() }}><div className="mm-compose-label" aria-hidden="true"><span>OUTGOING SIGNAL</span><PixelSymbol kind="star" /></div><label className="mm-sr-only" htmlFor={inputId}>Message {active.displayName || active.username}</label><textarea id={inputId} ref={composeRef} value={draft} maxLength={2000} rows={2} placeholder={`Say hello to ${active.displayName || active.username}…`} onChange={(e) => { store.setDraft(activeId!, e.target.value); if (e.target.value.trim()) service.sendTypingIndicator(active.userId) }} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void sendMessage() }
          }} /><div className="mm-compose-bottom"><span>Enter to send · Shift + Enter for a new line</span><span className={draft.length >= 1900 ? 'mm-limit' : ''}>{draft.length}/2000</span><button type="submit" disabled={!draft.trim() || sending}><PixelSymbol kind="send" />{sending ? 'Sending…' : 'Send'}</button></div></form>
        </>}
      </main>
    </div>
  </div>
}
