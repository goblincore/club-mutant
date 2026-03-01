import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearNakamaSession, getMyAccount } from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'

export function ProfileBadge() {
  const [open, setOpen] = useState(false)
  const [bio, setBio] = useState<string | null>(null)
  const username = useAuthStore((s) => s.username)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const initial = username ? username[0].toUpperCase() : '?'

  useEffect(() => {
    if (!isAuthenticated) return
    getMyAccount()
      .then((account) => {
        const meta = account.user?.metadata
          ? typeof account.user.metadata === 'string'
            ? JSON.parse(account.user.metadata)
            : account.user.metadata
          : {}
        setBio(meta.bio || null)
      })
      .catch(() => {})
  }, [isAuthenticated])

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
        className="w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-sm border-2 transition-all duration-200"
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
            className="w-52 rounded-xl border-2 p-5 font-mono flex flex-col gap-4"
            style={{
              backgroundColor: 'rgba(0,0,0,0.92)',
              backdropFilter: 'blur(16px)',
              borderColor: 'rgba(57,255,20,0.4)',
              boxShadow: '0 0 40px rgba(57,255,20,0.15)',
            }}
          >
            {/* Avatar + username */}
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
              <span className="text-white font-bold text-sm truncate">{username}</span>
            </div>

            {/* Bio */}
            <div
              className={`rounded-lg px-3 py-2 text-xs font-mono ${bio ? 'text-white/60' : 'text-white/25 italic'}`}
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {bio || 'no bio yet'}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleViewProfile}
                className="w-full py-2 rounded-lg text-xs font-mono border transition-colors"
                style={{ borderColor: 'rgba(57,255,20,0.3)', color: 'rgba(57,255,20,0.7)', backgroundColor: 'rgba(57,255,20,0.05)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.12)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.05)' }}
              >
                view profile
              </button>

              <button
                onClick={() => { if (username) navigate(`/user/${username}?edit`); setOpen(false) }}
                className="w-full py-2 rounded-lg text-xs font-mono border transition-colors"
                style={{ borderColor: 'rgba(57,255,20,0.3)', color: 'rgba(57,255,20,0.7)', backgroundColor: 'rgba(57,255,20,0.05)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.12)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.05)' }}
              >
                edit profile
              </button>

              <button
                onClick={handleLogout}
                className="w-full py-2 rounded-lg text-xs font-mono font-bold border border-red-500/30 text-red-400/70 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 transition-all duration-200"
              >
                log out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
