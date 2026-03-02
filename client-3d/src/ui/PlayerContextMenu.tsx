import { create } from 'zustand'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendFriendRequest } from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'

// ── Shared state — set from PlayerEntity (inside Canvas), read here (outside Canvas) ──

interface ClickedPlayer {
  name: string
  nakamaId: string // empty string = guest (no Nakama account)
}

interface PlayerContextState {
  clickedPlayer: ClickedPlayer | null
  setClickedPlayer: (p: ClickedPlayer | null) => void
}

export const usePlayerContextStore = create<PlayerContextState>((set) => ({
  clickedPlayer: null,
  setClickedPlayer: (p) => set({ clickedPlayer: p }),
}))

// ── UI overlay ──

export function PlayerContextMenu() {
  const clickedPlayer = usePlayerContextStore((s) => s.clickedPlayer)
  const setClickedPlayer = usePlayerContextStore((s) => s.setClickedPlayer)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const myUserId = useAuthStore((s) => s.userId)
  const navigate = useNavigate()

  const [addStatus, setAddStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  if (!clickedPlayer) return null

  const isGuest = !clickedPlayer.nakamaId
  const isMe = clickedPlayer.nakamaId && clickedPlayer.nakamaId === myUserId
  const canAddFriend = isAuthenticated && !isGuest && !isMe

  const handleClose = () => {
    setClickedPlayer(null)
    setAddStatus('idle')
  }

  const handleAddFriend = async () => {
    if (!canAddFriend) return
    setAddStatus('sending')
    try {
      await sendFriendRequest([clickedPlayer.nakamaId], [])
      setAddStatus('sent')
    } catch {
      setAddStatus('error')
    }
  }

  const handleViewProfile = () => {
    navigate(`/user/${clickedPlayer.name}`)
    handleClose()
  }

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 150, pointerEvents: 'none' }}
    >
      {/* Click-outside capture */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: 'auto' }}
        onClick={handleClose}
      />

      {/* Card — bottom-left */}
      <div
        className="absolute bottom-20 left-4 w-52 rounded-xl p-4 font-mono flex flex-col gap-3"
        style={{
          pointerEvents: 'auto',
          backgroundColor: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(57,255,20,0.4)',
          boxShadow: '0 0 30px rgba(57,255,20,0.15)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: '#39ff14' }}>
            @{clickedPlayer.name}
          </span>
          <button
            onClick={handleClose}
            className="text-white/40 hover:text-white transition-colors text-sm leading-none"
            style={{ fontFamily: 'monospace' }}
          >×</button>
        </div>

        {/* View profile — always shown if not guest */}
        {!isGuest && (
          <button
            onClick={handleViewProfile}
            className="w-full py-1.5 rounded-lg text-xs font-mono border transition-colors"
            style={{ borderColor: 'rgba(57,255,20,0.3)', color: 'rgba(57,255,20,0.7)', backgroundColor: 'rgba(57,255,20,0.05)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.12)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.05)' }}
          >
            view profile
          </button>
        )}

        {/* Add friend */}
        {canAddFriend && (
          <button
            onClick={handleAddFriend}
            disabled={addStatus === 'sending' || addStatus === 'sent'}
            className="w-full py-1.5 rounded-lg text-xs font-bold transition-all duration-200"
            style={
              addStatus === 'sent'
                ? { backgroundColor: 'rgba(57,255,20,0.1)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)', cursor: 'default' }
                : addStatus === 'error'
                ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }
                : { backgroundColor: 'rgba(57,255,20,0.15)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.4)', cursor: 'pointer' }
            }
          >
            {addStatus === 'sending' ? 'sending…' : addStatus === 'sent' ? '✓ request sent' : addStatus === 'error' ? 'try again' : 'add friend'}
          </button>
        )}

        {isGuest && (
          <p className="text-white/25 text-[10px] text-center">guest player</p>
        )}
      </div>
    </div>
  )
}
