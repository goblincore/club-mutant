import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useKonpyuuTA, useCurrentUsername } from '../../context/KonpyuuTAContext'
import { useMailStore, type MailFolder, type MailMessage } from '../../stores/mailStore'
import { SOCIAL_ICONS } from '../../lib/socialIcons'
import { AppWordmark, DoodleStar } from './AnalogAccents'
import { PixelSymbol } from './PixelSymbol'
import { postboxErrorText } from '../../lib/postbox'
import { usePopup } from './MutantTubePopup'

const FOLDERS: MailFolder[] = ['inbox', 'sent', 'drafts', 'trash']
const LABELS: Record<MailFolder, string> = { inbox: 'Inbox', sent: 'Sent letters', drafts: 'Drafts', trash: 'Trash' }
const dateLabel = (time: number) => new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' })

export function MutantMail() {
  const { userId: accountUserId, socialService, mailService } = useKonpyuuTA()
  const username = useCurrentUsername()
  const userId = accountUserId ?? socialService?.getCurrentUserId() ?? null
  const ownerId = userId ?? `guest:${username}`
  const store = useMailStore()
  const popup = usePopup()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [legacyAvailable, setLegacyAvailable] = useState(false)
  const busyRef = useRef(false)
  const request = useRef(0)
  const lifecycle = useRef(0)
  const pendingRefresh = useRef(false)
  const owned = store.ownerId === ownerId
  const messages = owned ? store.messages : []
  const draft = messages.find((m) => m.id === store.activeDraftId && m.folder === 'drafts')
  const selected = messages.find((m) => m.id === store.selectedMessageId && m.folder === store.currentFolder)
  const query = search.trim().toLowerCase()
  const folderMessages = messages.filter((m) => m.folder === store.currentFolder && (!query || `${m.from} ${m.to} ${m.subject} ${m.body}`.toLowerCase().includes(query))).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  const canDeliver = !!userId && !!mailService

  useLayoutEffect(() => {
    lifecycle.current++
    request.current++
    busyRef.current = false
    setBusy(false); setError(''); setStatus(''); setSearch(''); setLoading(false)
    store.resetForUser(ownerId)
    pendingRefresh.current = false
    try {
      const legacy = JSON.parse(localStorage.getItem('konpyuuta-mail') || 'null')?.state?.messages
      setLegacyAvailable(Array.isArray(legacy) && legacy.length > 0 && !useMailStore.getState().messages.some((m) => m.legacySourceId))
    } catch { setLegacyAvailable(false) }
    return () => { lifecycle.current++; request.current++ }
  }, [ownerId, store.resetForUser])

  const refresh = useCallback(async () => {
    if (!mailService || !userId) return
    if (busyRef.current) { pendingRefresh.current = true; return }
    const current = ++request.current
    setLoading(true)
    try {
      const letters = await mailService.listLetters()
      if (current === request.current && useMailStore.getState().ownerId === ownerId) {
        store.mergeLetters(ownerId, letters)
        setError('')
      }
    } catch (error) { const message = await postboxErrorText(error); if (current === request.current) setError(message) }
    finally { if (current === request.current) setLoading(false) }
  }, [mailService, userId, ownerId, store.mergeLetters])

  useEffect(() => {
    void refresh()
    const unsubscribe = mailService?.onMailChanged(() => { void refresh() })
    const foreground = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', foreground)
    window.addEventListener('focus', foreground)
    return () => { unsubscribe?.(); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('focus', foreground); request.current++ }
  }, [mailService, refresh])

  const mutate = async (operation: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    const generation = lifecycle.current
    request.current++
    setBusy(true); setLoading(false); setError(''); setStatus('')
    try { await operation() }
    catch (error) { const message = await postboxErrorText(error); if (generation === lifecycle.current) setError(message) }
    finally {
      if (generation === lifecycle.current) {
        busyRef.current = false; setBusy(false)
        if (pendingRefresh.current) { pendingRefresh.current = false; void refresh() }
      }
    }
  }
  const selectMessage = (message: MailMessage) => {
    if (busyRef.current) return
    setError(''); setStatus('')
    if (message.folder === 'drafts') { store.openDraft(message.id); return }
    store.setSelectedMessage(message.id)
    const generation = lifecycle.current
    if (message.delivered && !message.read && mailService) void mutate(async () => {
      const letter = await mailService.updateLetter(message.id, 'read')
      if (letter && generation === lifecycle.current) store.putLetter(ownerId, letter)
    })
  }
  const send = () => {
    if (!draft || !canDeliver || busyRef.current || !draft.to.trim() || !draft.subject.trim() || !draft.body.trim()) return
    const generation = lifecycle.current
    void mutate(async () => {
      const letter = await mailService!.sendLetter({ requestId: draft.id, to: draft.to, subject: draft.subject, body: draft.body })
      if (generation !== lifecycle.current) return
      store.finishSend(ownerId, draft.id, letter)
      setStatus(`Delivered to @${letter.to}.`)
    })
  }
  const messageAction = (action: 'trash' | 'restore' | 'delete') => {
    if (!selected || busyRef.current) return
    const generation = lifecycle.current
    void mutate(async () => {
      if (action === 'delete' && !await popup.confirm('Delete this letter forever? Your copy cannot be recovered.', 'Delete letter')) return
      if (generation !== lifecycle.current) return
      if (selected.delivered) {
        if (!mailService) throw new Error('Sign in and connect before changing this letter.')
        const letter = await mailService.updateLetter(selected.id, action)
        if (generation !== lifecycle.current) return
        if (letter) store.putLetter(ownerId, letter)
        else store.removeMessage(ownerId, selected.id)
      } else if (action === 'delete') store.removeMessage(ownerId, selected.id)
      else store.moveLocalMessage(selected.id, action === 'restore')
      setStatus(action === 'trash' ? 'Moved to Trash.' : action === 'restore' ? 'Letter restored.' : 'Letter deleted.')
    })
  }
  const startDraft = (initial?: Partial<Pick<MailMessage, 'to' | 'subject' | 'body'>>) => {
    if (busyRef.current) return
    store.startDraft(username, initial); setError(''); setStatus('')
  }

  return <div className={`ml-root${draft || selected ? ' ml-has-detail' : ''}`}>
    {popup.PopupComponent}
    <header className="ml-header"><img src={SOCIAL_ICONS.mutantmail} alt="" /><div><AppWordmark label="Postbox" /><small>LITTLE LETTERS, SENT WITH LOVE</small></div><span className="ml-postmark" aria-hidden="true"><DoodleStar />CLUB<br />POST</span></header>
    {!canDeliver && <div className="ml-notice">{userId ? 'Letter delivery isn’t available here. Open Postbox from Club Mutant.' : 'Sign in to send and receive letters. You can keep a draft here.'}</div>}
    {legacyAvailable && <div className="ml-notice">Older local letters found in this browser. They were never delivered.<button disabled={busy} onClick={() => {
      try { store.importLocalArchive(JSON.parse(localStorage.getItem('konpyuuta-mail') || 'null')?.state?.messages, username); setLegacyAvailable(false); setStatus('Old letters imported as local copies.'); } catch { setError('The old archive could not be opened.') }
    }}>Import local archive</button></div>}
    {error && <div className="ml-notice ml-error" role="alert">{error}<button onClick={() => void refresh()} disabled={!canDeliver || busy}>Refresh</button></div>}
    <div className="ml-layout">
      <aside className="ml-sidebar" aria-label="Letter folders">
        <button className="ml-compose-btn" onClick={() => startDraft()} disabled={busy}><PixelSymbol kind="send" /> Write a letter</button>
        <nav className="ml-folders">{FOLDERS.map((folder) => {
          const count = messages.filter((m) => m.folder === folder && (folder !== 'inbox' || !m.read)).length
          return <button key={folder} className={`ml-folder${store.currentFolder === folder ? ' active' : ''}`} aria-current={store.currentFolder === folder ? 'page' : undefined} disabled={busy} onClick={() => { store.setCurrentFolder(folder); setError(''); setStatus('') }}><span className="ml-folder-label">{LABELS[folder]}</span>{count > 0 && <span className="ml-folder-count" aria-label={`${count} ${folder === 'inbox' ? 'unread letters' : 'letters'}`}>{count}</span>}</button>
        })}</nav>
        <div className="ml-sidebar-note"><DoodleStar filled /><p>A little paper trail.</p><small>@{username}</small></div>
      </aside>
      <main className="ml-main">
        <section className="ml-list" aria-label={LABELS[store.currentFolder]}>
          <div className="ml-list-header"><strong>{LABELS[store.currentFolder]}</strong><button aria-label="Refresh letters" disabled={!canDeliver || busy || loading} onClick={() => void refresh()}>↻</button></div>
          <label className="ml-search"><span className="ml-sr-only">Search letters</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a little letter…" /></label>
          <div className="ml-messages">{loading && <p className="ml-list-note" role="status">Checking the post…</p>}{!loading && !folderMessages.length && <div className="ml-empty">{query ? 'No matching letters.' : `Nothing in ${LABELS[store.currentFolder].toLowerCase()} yet.`}</div>}{folderMessages.map((message) => <button key={message.id} className={`ml-message-row${message.read ? '' : ' unread'}${selected?.id === message.id || draft?.id === message.id ? ' selected' : ''}`} aria-pressed={selected?.id === message.id || draft?.id === message.id} disabled={busy} onClick={() => selectMessage(message)}><span className="ml-message-from">{!message.read && <i aria-label="Unread" />}{message.originalFolder === 'sent' || message.folder === 'sent' || message.folder === 'drafts' ? `To: ${message.to || '…'}` : message.from}<time>{dateLabel(message.createdAt)}</time></span><strong>{message.subject || 'Untitled letter'}</strong><span className="ml-message-snippet">{message.body || 'A blank piece of paper.'}</span></button>)}</div>
        </section>
        <section className="ml-preview" aria-label={draft ? 'Write a letter' : 'Read a letter'}>
          {draft ? <form className="ml-compose-form" onSubmit={(e) => { e.preventDefault(); send() }}>
            <header className="ml-compose-header"><button type="button" className="ml-back" onClick={() => { store.closeDraft(); store.setCurrentFolder('drafts') }} disabled={busy}>← Drafts</button><span>YOUR LETTER</span><small>Saved on this device</small></header>
            <div className="ml-compose-field"><label htmlFor={`ml-to-${draft.id}`}>To</label><input id={`ml-to-${draft.id}`} value={draft.to} maxLength={128} disabled={busy} onChange={(e) => store.updateDraft(draft.id, { to: e.target.value })} placeholder="Club Mutant username" required autoComplete="off" /></div>
            <div className="ml-compose-field"><label htmlFor={`ml-subject-${draft.id}`}>Subject</label><input id={`ml-subject-${draft.id}`} value={draft.subject} maxLength={100} disabled={busy} onChange={(e) => store.updateDraft(draft.id, { subject: e.target.value })} placeholder="A little hello" required /></div>
            <div className="ml-compose-body"><label className="ml-sr-only" htmlFor={`ml-body-${draft.id}`}>Letter body</label><textarea id={`ml-body-${draft.id}`} value={draft.body} maxLength={10000} disabled={busy} onChange={(e) => store.updateDraft(draft.id, { body: e.target.value })} placeholder="Dear friend,…" required /></div>
            <footer className="ml-compose-actions"><span>{draft.body.length}/10000</span><button type="button" aria-label="Move draft to Trash" disabled={busy} onClick={() => { store.moveLocalMessage(draft.id); store.setCurrentFolder('drafts'); setStatus('Draft moved to Trash.') }}>Discard</button><button type="button" disabled={busy} onClick={() => { store.closeDraft(); store.setCurrentFolder('drafts'); setStatus('Draft saved.') }}>Save & close</button><button type="submit" className="ml-send-btn" disabled={!canDeliver || busy || !draft.to.trim() || !draft.subject.trim() || !draft.body.trim()}><PixelSymbol kind="send" />{busy ? 'Posting…' : 'Post letter'}</button></footer>
          </form> : selected ? <article className="ml-message-view">
            <header className="ml-view-header"><button className="ml-back" onClick={() => store.setSelectedMessage(null)} disabled={busy}>← {LABELS[store.currentFolder]}</button><h1>{selected.subject || 'Untitled letter'}</h1><div className="ml-view-meta"><span>From <strong>@{selected.from}</strong></span><span>To <strong>@{selected.to}</strong></span><time>{new Date(selected.createdAt).toLocaleString()}</time></div>{!selected.delivered && <small>Saved locally · this letter was not delivered</small>}</header>
            <div className="ml-view-body">{selected.body}</div>
            <footer className="ml-view-actions">{selected.folder !== 'trash' ? <><button disabled={busy} onClick={() => startDraft({ to: selected.originalFolder === 'sent' || selected.folder === 'sent' ? selected.to : selected.from, subject: /^Re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`.slice(0, 100), body: `\n\n— Original letter —\n${selected.body}`.slice(0, 10000) })}>Reply</button><button disabled={busy} onClick={() => messageAction('trash')}>Move to Trash</button></> : <><button disabled={busy} onClick={() => messageAction('restore')}>Restore</button><button disabled={busy} onClick={() => messageAction('delete')}>Delete forever</button></>}</footer>
          </article> : <div className="ml-no-selection"><div className="ml-envelope" aria-hidden="true"><img src={SOCIAL_ICONS.mutantmail} alt="" /><DoodleStar filled /></div><small>A SMALL SOMETHING, JUST FOR YOU</small><h2>Good things in the post.</h2><p>Letters for your Club Mutant friends.<br />A subject, a story, a little hello.</p><button onClick={() => startDraft()} disabled={busy}>Write your first letter</button></div>}
        </section>
      </main>
    </div>
    <footer className="ml-status" role="status"><span>{status || (draft ? 'Your draft is saved as you write.' : loading ? 'Checking for letters…' : `${folderMessages.length} ${folderMessages.length === 1 ? 'letter' : 'letters'}`)}</span><span>Club Mutant post · @{username}</span></footer>
  </div>
}
