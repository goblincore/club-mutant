import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { authenticateEmail } from '../network/nakamaClient'
import { WarpCheckBg } from './WarpCheckBg'

type AuthMode = 'login' | 'register'

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const continueAsGuest = useAuthStore((s) => s.continueAsGuest)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (mode === 'register' && !username.trim()) return

    setLoading(true)
    setError(null)

    try {
      const isCreate = mode === 'register'
      await authenticateEmail(
        email.trim(),
        password.trim(),
        isCreate,
        isCreate ? username.trim() : undefined,
      )
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      if (msg.includes('Invalid credentials') || msg.includes('401')) {
        setError('Invalid email or password')
      } else if (msg.includes('already exists') || msg.includes('409')) {
        setError('Account already exists — try logging in')
      } else if (msg.includes('username')) {
        setError('Username is already taken')
      } else {
        setError(msg.length > 80 ? 'Connection failed — is Nakama running?' : msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit(e)
  }

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full">
      <WarpCheckBg />

      <div
        className="relative z-10 p-8 rounded-xl border-2 w-full max-w-sm lobby-card-enter"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(12px)',
          borderColor: 'rgba(57, 255, 20, 0.5)',
          boxShadow: '0 0 40px rgba(57, 255, 20, 0.2)',
        }}
      >
        <h1
          className="text-2xl font-mono font-bold text-center mb-6"
          style={{ color: '#39ff14', textShadow: '0 0 20px rgba(57, 255, 20, 0.5)' }}
        >
          club mutant
        </h1>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => { setMode('login'); setError(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-mono font-bold transition-all ${
              mode === 'login'
                ? 'bg-green-700/50 border border-toxic-green text-white'
                : 'bg-transparent border border-white/20 text-white/50 hover:text-white/80'
            }`}
          >
            log in
          </button>
          <button
            onClick={() => { setMode('register'); setError(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-mono font-bold transition-all ${
              mode === 'register'
                ? 'bg-green-700/50 border border-toxic-green text-white'
                : 'bg-transparent border border-white/20 text-white/50 hover:text-white/80'
            }`}
          >
            register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="username"
              maxLength={20}
              className="w-full bg-green-800/30 border border-white/20 rounded-lg px-4 py-3
                         text-sm font-mono text-white placeholder-white/40
                         focus:border-toxic-green focus:outline-none focus:shadow-[0_0_15px_rgba(57,255,20,0.3)]
                         transition-all duration-300"
            />
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="email"
            className="w-full bg-green-800/30 border border-white/20 rounded-lg px-4 py-3
                       text-sm font-mono text-white placeholder-white/40
                       focus:border-toxic-green focus:outline-none focus:shadow-[0_0_15px_rgba(57,255,20,0.3)]
                       transition-all duration-300"
            autoFocus
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="password"
            minLength={8}
            className="w-full bg-green-800/30 border border-white/20 rounded-lg px-4 py-3
                       text-sm font-mono text-white placeholder-white/40
                       focus:border-toxic-green focus:outline-none focus:shadow-[0_0_15px_rgba(57,255,20,0.3)]
                       transition-all duration-300"
          />

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim() || (mode === 'register' && !username.trim())}
            className="lobby-btn w-full relative overflow-hidden group
                       bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-3
                       text-base font-mono font-bold text-white
                       hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                       transition-all duration-300"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                            translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
            <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'login' ? 'logging in...' : 'creating account...'}
                </span>
              ) : (
                mode === 'login' ? 'log in' : 'create account'
              )}
            </span>
          </button>

          {error && (
            <p className="text-sm font-mono font-bold text-center" style={{ color: '#ff0080' }}>
              {error}
            </p>
          )}
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-white/30 text-xs font-mono">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <button
          onClick={continueAsGuest}
          disabled={loading}
          className="w-full py-3 rounded-lg text-sm font-mono text-white/60 border border-white/15
                     hover:text-white hover:border-white/30 hover:bg-white/5
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-all duration-300"
        >
          continue as guest
        </button>
      </div>

      <style>{`
        @keyframes lobby-card-enter {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lobby-card-enter {
          animation: lobby-card-enter 0.5s ease-out 0.2s both;
        }
        .lobby-btn:not(:disabled):hover  { transform: scale(1.03); }
        .lobby-btn:not(:disabled):active { transform: scale(0.97); }
      `}</style>
    </div>
  )
}
