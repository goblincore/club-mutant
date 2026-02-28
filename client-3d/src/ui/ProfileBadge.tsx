import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearNakamaSession, listFriends, sendFriendRequest, removeFriend } from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'
import type { Friend } from '@heroiclabs/nakama-js'

function FriendsPanel() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [pending, setPending] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [addUsername, setAddUsername] = useState('')
  const [addStatus, setAddStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [addError, setAddError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const all = await listFriends()
      setFriends(all.filter((f) => f.state === 0))
      setPending(all.filter((f) => f.state === 2))
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

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

  return (
    <div className="flex flex-col gap-3">
      {/* Add friend input */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={addUsername}
          onChange={(e) => { setAddUsername(e.target.value); setAddStatus('idle') }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="add by username…"
          maxLength={32}
          className="flex-1 min-w-0 bg-transparent text-xs font-mono py-1 px-2 rounded border
                     placeholder-white/25 focus:outline-none transition-colors"
          style={{ borderColor: 'rgba(57,255,20,0.3)', color: '#39ff14' }}
        />
        <button
          onClick={handleAdd}
          disabled={addStatus === 'sending' || !addUsername.trim()}
          className="text-xs font-mono px-2 py-1 rounded transition-colors"
          style={{ color: '#39ff14', borderColor: 'rgba(57,255,20,0.4)', backgroundColor: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.4)' }}
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

          {/* Mutual friends */}
          {friends.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {pending.length > 0 && (
                <p className="text-white/30 text-[10px] uppercase tracking-wider">friends</p>
              )}
              {friends.slice(0, 10).map((f) => (
                <div key={f.user?.id} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.4)', color: '#39ff14' }}
                  >
                    {f.user?.username?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="flex-1 text-xs font-mono text-white/70 truncate">{f.user?.username}</span>
                  <button
                    onClick={() => handleRemove(f)}
                    className="text-[10px] text-white/20 hover:text-red-400/60 transition-colors font-mono"
                    title="remove friend"
                  >✕</button>
                </div>
              ))}
            </div>
          ) : pending.length === 0 ? (
            <p className="text-white/25 text-xs text-center py-1">no friends yet</p>
          ) : null}
        </>
      )}
    </div>
  )
}

export function ProfileBadge() {
  const [open, setOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const initial = username ? username[0].toUpperCase() : '?'

  const handleLogout = () => {
    clearNakamaSession()
    logout()
    setOpen(false)
  }

  const handleViewProfile = () => {
    if (username) navigate(`/user/${username}`)
    setOpen(false)
  }

  return (
    <>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(true)}
        title={username ?? 'profile'}
        className="w-9 h-9 rounded-full flex items-center justify-center
                   font-mono font-bold text-sm text-white
                   border-2 transition-all duration-200"
        style={{
          backgroundColor: 'rgba(0,0,0,0.7)',
          borderColor: 'rgba(57,255,20,0.6)',
          boxShadow: '0 0 12px rgba(57,255,20,0.3)',
          color: '#39ff14',
          textShadow: '0 0 8px rgba(57,255,20,0.6)',
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
        {initial}
      </button>

      {/* Profile overlay */}
      {open && (
        <div
          className="fixed inset-0 flex items-start justify-end pt-14 pr-3"
          style={{ zIndex: 200 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="w-64 rounded-xl border-2 p-5 font-mono flex flex-col gap-4"
            style={{
              backgroundColor: 'rgba(0,0,0,0.92)',
              backdropFilter: 'blur(16px)',
              borderColor: 'rgba(57,255,20,0.4)',
              boxShadow: '0 0 40px rgba(57,255,20,0.15)',
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
            }}
          >
            {/* Avatar + name */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
                style={{
                  backgroundColor: 'rgba(57,255,20,0.12)',
                  border: '2px solid rgba(57,255,20,0.5)',
                  color: '#39ff14',
                  textShadow: '0 0 10px rgba(57,255,20,0.6)',
                }}
              >
                {initial}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-white font-bold text-sm truncate">{username}</span>
              </div>
            </div>

            {/* Placeholder stats row */}
            <div
              className="grid grid-cols-3 gap-2 rounded-lg p-3"
              style={{ backgroundColor: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.15)' }}
            >
              {[['visits', '—'], ['friends', '—'], ['rooms', '—']].map(([label, val]) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-white/30 text-[10px]">{label}</span>
                  <span className="text-white/50 text-sm font-bold">{val}</span>
                </div>
              ))}
            </div>

            {/* View profile */}
            <button
              onClick={handleViewProfile}
              className="w-full py-2 rounded-lg text-xs font-mono border transition-colors"
              style={{ borderColor: 'rgba(57,255,20,0.3)', color: 'rgba(57,255,20,0.7)', backgroundColor: 'rgba(57,255,20,0.05)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.12)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.05)' }}
            >
              view profile
            </button>

            {/* Friends section */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setFriendsOpen((o) => !o)}
                className="w-full py-2 rounded-lg text-xs font-mono border flex items-center justify-between px-3 transition-colors"
                style={{ borderColor: 'rgba(57,255,20,0.3)', color: 'rgba(57,255,20,0.7)', backgroundColor: 'rgba(57,255,20,0.05)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.12)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.05)' }}
              >
                <span>friends</span>
                <span className="text-white/30">{friendsOpen ? '▲' : '▼'}</span>
              </button>

              {friendsOpen && (
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: 'rgba(57,255,20,0.03)', border: '1px solid rgba(57,255,20,0.1)' }}
                >
                  <FriendsPanel />
                </div>
              )}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full py-2 rounded-lg text-xs font-mono font-bold
                         border border-red-500/30 text-red-400/70
                         hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50
                         transition-all duration-200"
            >
              log out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
