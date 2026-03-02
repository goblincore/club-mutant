import { useState, useCallback, useEffect } from 'react'
import { listFriends, sendFriendRequest, removeFriend, followFriends } from '../network/nakamaClient'
import { usePresenceStore } from '../stores/presenceStore'
import type { Friend } from '@heroiclabs/nakama-js'

const POLL_INTERVAL = 60_000

export function FriendsSidebar() {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [pending, setPending] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [addUsername, setAddUsername] = useState('')
  const [addStatus, setAddStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [addError, setAddError] = useState('')

  const onlineUserIds = usePresenceStore((s) => s.onlineUserIds)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const all = await listFriends()
      const mutual = all.filter((f) => f.state === 0)
      setFriends(mutual)
      setPending(all.filter((f) => f.state === 2))

      // Follow mutual friends for real-time presence updates
      const ids = mutual.map((f) => f.user?.id).filter(Boolean) as string[]
      if (ids.length) await followFriends(ids)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  // Poll to keep pending count badge fresh
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [refresh])

  // Refresh on open
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const handleAdd = async () => {
    const u = addUsername.trim()
    if (!u) return
    setAddStatus('sending')
    setAddError('')
    try {
      await sendFriendRequest([], [u])
      setAddStatus('sent')
      setAddUsername('')
      setTimeout(() => setAddStatus('idle'), 2000)
    } catch (err: any) {
      setAddStatus('error')
      setAddError(err?.message?.includes('not found') ? 'user not found' : 'failed to send')
    }
  }

  const handleAccept = async (f: Friend) => {
    try {
      await sendFriendRequest([f.user!.id!], [])
      await refresh()
    } catch { /* silent */ }
  }

  const handleRemove = async (f: Friend) => {
    try {
      await removeFriend(f.user!.id!)
      await refresh()
    } catch { /* silent */ }
  }

  const pendingCount = pending.length

  return (
    <>
      {/* Friends button */}
      <button
        onClick={() => setOpen(true)}
        title="friends"
        className="relative w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-200"
        style={{
          backgroundColor: 'rgba(0,0,0,0.7)',
          borderColor: 'rgba(57,255,20,0.6)',
          boxShadow: '0 0 12px rgba(57,255,20,0.3)',
          color: '#39ff14',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 20px rgba(57,255,20,0.6)'
          e.currentTarget.style.borderColor = '#39ff14'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 0 12px rgba(57,255,20,0.3)'
          e.currentTarget.style.borderColor = 'rgba(57,255,20,0.6)'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        {pendingCount > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: '#ef4444', color: 'white' }}
          >
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {/* Friends panel */}
      {open && (
        <div
          className="fixed inset-0 flex items-start justify-end pt-14 pr-3"
          style={{ zIndex: 200 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="w-72 rounded-xl border-2 p-4 font-mono flex flex-col gap-3"
            style={{
              backgroundColor: 'rgba(0,0,0,0.92)',
              backdropFilter: 'blur(16px)',
              borderColor: 'rgba(57,255,20,0.4)',
              boxShadow: '0 0 40px rgba(57,255,20,0.15)',
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-white/70 text-xs font-bold uppercase tracking-wider">friends</span>
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white text-base transition-colors"
              >×</button>
            </div>

            {/* Add friend */}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={addUsername}
                onChange={(e) => { setAddUsername(e.target.value); setAddStatus('idle') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                placeholder="add by username…"
                maxLength={32}
                className="flex-1 min-w-0 bg-transparent text-xs font-mono py-1 px-2 rounded border placeholder-white/25 focus:outline-none transition-colors"
                style={{ borderColor: 'rgba(57,255,20,0.3)', color: '#39ff14' }}
              />
              <button
                onClick={handleAdd}
                disabled={addStatus === 'sending' || !addUsername.trim()}
                className="text-xs font-mono px-2 py-1 rounded transition-colors"
                style={{ color: '#39ff14', border: '1px solid rgba(57,255,20,0.4)', backgroundColor: 'rgba(57,255,20,0.08)' }}
              >
                {addStatus === 'sending' ? '…' : addStatus === 'sent' ? '✓' : '+'}
              </button>
            </div>
            {addStatus === 'error' && (
              <p className="text-red-400/70 text-[10px] -mt-2">{addError}</p>
            )}

            {loading ? (
              <p className="text-white/25 text-xs text-center py-2">loading…</p>
            ) : (
              <>
                {/* Incoming requests */}
                {pending.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider">requests</p>
                    {pending.map((f) => (
                      <div key={f.user?.id} className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ backgroundColor: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.4)', color: '#39ff14' }}
                        >
                          {f.user?.username?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span className="flex-1 text-xs font-mono text-white/70 truncate">{f.user?.username}</span>
                        <button
                          onClick={() => handleAccept(f)}
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                          style={{ color: '#39ff14', border: '1px solid rgba(57,255,20,0.4)', backgroundColor: 'rgba(57,255,20,0.1)' }}
                        >accept</button>
                        <button
                          onClick={() => handleRemove(f)}
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono text-red-400/60 hover:text-red-400 transition-colors"
                          style={{ border: '1px solid rgba(239,68,68,0.2)' }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Friends list with online status */}
                {friends.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {pending.length > 0 && (
                      <p className="text-white/30 text-[10px] uppercase tracking-wider">friends</p>
                    )}
                    {[...friends]
                      .sort((a, b) => {
                        const aOn = a.user?.id ? onlineUserIds.has(a.user.id) : false
                        const bOn = b.user?.id ? onlineUserIds.has(b.user.id) : false
                        if (aOn !== bOn) return aOn ? -1 : 1
                        return (a.user?.username ?? '').localeCompare(b.user?.username ?? '')
                      })
                      .map((f) => {
                        const isOnline = f.user?.id ? onlineUserIds.has(f.user.id) : false
                        return (
                          <div key={f.user?.id} className="flex items-center gap-2">
                            <div className="relative shrink-0">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ backgroundColor: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.4)', color: '#39ff14' }}
                              >
                                {f.user?.username?.[0]?.toUpperCase() ?? '?'}
                              </div>
                              <span
                                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-black"
                                style={{ backgroundColor: isOnline ? '#39ff14' : '#4b5563' }}
                              />
                            </div>
                            <span
                              className="flex-1 text-xs font-mono truncate"
                              style={{ color: isOnline ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}
                            >
                              {f.user?.username}
                            </span>
                            <button
                              onClick={() => handleRemove(f)}
                              className="text-[10px] text-white/20 hover:text-red-400/60 transition-colors font-mono"
                              title="remove friend"
                            >✕</button>
                          </div>
                        )
                      })}
                  </div>
                ) : pending.length === 0 ? (
                  <p className="text-white/25 text-xs text-center py-1">no friends yet</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
