import { useState } from 'react'

import { getNetwork } from '../network/NetworkManager'

interface Props {
  playerName: string
  textureId: number
  onBack: () => void
  onCreated: () => void
}

export function CreateRoomForm({ playerName, textureId, onBack, onCreated }: Props) {
  const [roomName, setRoomName] = useState('')
  const [description, setDescription] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreate = roomName.trim().length > 0 && description.trim().length > 0

  const handleCreate = async () => {
    if (!canCreate) return

    setCreating(true)
    setError(null)

    try {
      await getNetwork().createCustomRoom(
        {
          name: roomName.trim(),
          description: description.trim(),
          password: password.trim() || null,
        },
        playerName,
        textureId
      )

      getNetwork().sendReady()
      getNetwork().sendPlayerName(playerName)
      onCreated()
    } catch (err: any) {
      setError('Failed to create room. Is the server running?')
      console.error('[CreateRoomForm] Create failed:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canCreate && !creating) {
      handleCreate()
    }
  }

  return (
    <div
      className="relative z-20 w-full max-w-md mx-auto p-5 rounded-xl font-mono custom-room-enter"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(57, 255, 20, 0.4)',
        boxShadow: '0 0 30px rgba(57, 255, 20, 0.15)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-white/60 hover:text-white text-sm transition-colors"
        >
          ← back
        </button>
        <h2
          className="text-lg font-bold"
          style={{ color: '#39ff14', textShadow: '0 0 10px rgba(57, 255, 20, 0.5)' }}
        >
          create room
        </h2>
        <div className="w-12" /> {/* spacer */}
      </div>

      <div className="space-y-3">
        {/* Room name */}
        <div>
          <label className="block text-white/50 text-xs mb-1">room name *</label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="my cool room"
            maxLength={30}
            disabled={creating}
            className="w-full bg-black/50 border border-white/20 rounded-lg px-3 py-2.5
                       text-sm font-mono text-white placeholder-white/30
                       focus:border-toxic-green focus:outline-none focus:shadow-[0_0_15px_rgba(57,255,20,0.3)]
                       transition-all"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-white/50 text-xs mb-1">description *</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="what's this room about?"
            maxLength={60}
            disabled={creating}
            className="w-full bg-black/50 border border-white/20 rounded-lg px-3 py-2.5
                       text-sm font-mono text-white placeholder-white/30
                       focus:border-toxic-green focus:outline-none focus:shadow-[0_0_15px_rgba(57,255,20,0.3)]
                       transition-all"
          />
        </div>

        {/* Password (optional) */}
        <div>
          <label className="block text-white/50 text-xs mb-1">password (optional)</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="leave empty for public"
              maxLength={30}
              disabled={creating}
              className="w-full bg-black/50 border border-white/20 rounded-lg px-3 py-2.5 pr-16
                         text-sm font-mono text-white placeholder-white/30
                         focus:border-toxic-green focus:outline-none focus:shadow-[0_0_15px_rgba(57,255,20,0.3)]
                         transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white/70 transition-colors px-1"
            >
              {showPassword ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm font-bold" style={{ color: '#ff0080' }}>
            ⚠ {error}
          </p>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={creating || !canCreate}
          className="w-full py-2.5 rounded-lg text-sm font-bold transition-all
                     hover:shadow-[0_0_25px_rgba(57,255,20,0.4)]
                     disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'rgba(57, 255, 20, 0.2)',
            border: '2px solid #39ff14',
            color: '#39ff14',
            textShadow: '0 0 8px rgba(57, 255, 20, 0.5)',
          }}
        >
          {creating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              creating...
            </span>
          ) : (
            'create room'
          )}
        </button>
      </div>

      <style>{`
        @keyframes custom-room-enter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .custom-room-enter {
          animation: custom-room-enter 0.3s ease-out both;
        }
      `}</style>
    </div>
  )
}
