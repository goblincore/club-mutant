import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { clearNakamaSession } from '../network/nakamaClient'

export function ProfileBadge() {
  const [open, setOpen] = useState(false)
  const username = useAuthStore((s) => s.username)
  const userId = useAuthStore((s) => s.userId)
  const logout = useAuthStore((s) => s.logout)

  const initial = username ? username[0].toUpperCase() : '?'

  const handleLogout = () => {
    clearNakamaSession()
    logout()
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
                <span className="text-white/40 text-xs truncate">
                  {userId ? `id: ${userId.slice(0, 12)}…` : ''}
                </span>
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

            {/* Placeholder actions */}
            <div className="flex flex-col gap-2">
              <button
                disabled
                className="w-full py-2 rounded-lg text-xs font-mono text-white/30 border border-white/10
                           cursor-not-allowed"
              >
                edit profile (coming soon)
              </button>
              <button
                disabled
                className="w-full py-2 rounded-lg text-xs font-mono text-white/30 border border-white/10
                           cursor-not-allowed"
              >
                friends (coming soon)
              </button>
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
