import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { authenticateEmail } from '../network/nakamaClient'
import { WarpCheckBg } from './WarpCheckBg'
import { TurntableCarousel } from './components/TurntableCarousel'
import {
  getCharacters,
  getCharactersSync,
  type CharacterEntry,
} from '../character/characterRegistry'

type AuthMode = 'login' | 'register'

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Carousel state
  const [characters, setCharacters] = useState<CharacterEntry[]>(() => getCharactersSync())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [carouselVisible, setCarouselVisible] = useState(false)

  const continueAsGuest = useAuthStore((s) => s.continueAsGuest)

  useEffect(() => {
    getCharacters().then(setCharacters)
  }, [])

  const handleCarouselReady = useCallback(() => {
    setCarouselVisible(true)
  }, [])

  const handleLogoClick = useCallback(() => {
    setShowForm(true)
  }, [])

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
        isCreate ? username.trim() : undefined
      )
    } catch (err: any) {
      let msg: string
      if (err instanceof Response) {
        try {
          const text = await err.text()
          try {
            const json = JSON.parse(text)
            msg = json.message ?? text
          } catch {
            msg = text
          }
        } catch {
          msg = `Server error (${err.status})`
        }
      } else {
        msg = err?.message ?? String(err)
      }
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
    if (e.key === 'Enter') handleSubmit(e as any)
  }

  // When loading: zoom out to scale(1) — matches lobby carousel scale on transition
  // When idle: zoom in to scale(1.6) so characters fill and clip the screen edges
  const carouselScale = loading ? 1.0 : 1.6

  return (
    <div className="relative flex flex-col items-center w-full h-full overflow-hidden">
      <WarpCheckBg />

      {/* Character carousel — fills viewport absolutely, scale() from default transform-origin
          (50% 50%) = viewport center. Clean zoom in/out transition always anchored to center. */}
      <div
        style={{
          position: 'absolute',
          top: '0%',
          left: '0%',
          width: '100%',
          height: '100%',
          opacity: carouselVisible ? 1 : 0,
          transform: `scale(${carouselScale})`,
          transition: loading
            ? 'opacity 0.4s ease-out, transform 0.5s ease-out'
            : 'opacity 0.5s ease-out, transform 0.9s ease-in',
          pointerEvents: 'none',
        }}
      >
        <TurntableCarousel
          characters={characters}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReady={handleCarouselReady}
        />
      </div>

      {/* Floating logo splash — click to reveal login form */}
      {!showForm && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer"
          onClick={handleLogoClick}
        >
          <div className="logo-splash flex items-center" style={{ gap: '0px' }}>
            <img
              src="/logo/CLUB-piece.png"
              alt="CLUB"
              className="logo-piece logo-piece-1"
              style={{ height: '120px', filter: 'drop-shadow(0 0 16px rgba(0, 0, 0, 0.7))' }}
            />
            <img
              src="/logo/FLOWER-piece.png"
              alt=""
              className="logo-piece logo-piece-2"
              style={{ height: '160px', filter: 'drop-shadow(0 0 16px rgba(0, 0, 0, 0.7))' }}
            />
            <img
              src="/logo/MUTANT-piece.png"
              alt="MUTANT"
              className="logo-piece logo-piece-3"
              style={{ height: '120px', filter: 'drop-shadow(0 0 16px rgba(0, 0, 0, 0.7))' }}
            />
          </div>
          <p className="absolute bottom-[28%] text-white/50 text-sm font-mono animate-pulse">
            click to enter
          </p>
        </div>
      )}

      {/* Auth form card — absolute overlay, centered in full screen */}
      {showForm && (
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <div
          className="pointer-events-auto p-8 rounded-xl border-2 w-full max-w-sm mx-4 lobby-card-enter"
          style={{
            backgroundColor: 'rgba(57, 255, 20, 0.45)',
            backdropFilter: 'blur(12px)',
            borderColor: '#39ff14',
            boxShadow: '0 0 30px rgba(57, 255, 20, 0.3), inset 0 0 20px rgba(57, 255, 20, 0.15)',
          }}
        >
          <img
            src="/logo/cm-horizontal.png"
            alt="club mutant"
            className="mx-auto mb-6"
            style={{ height: '100px', filter: 'drop-shadow(0 0 12px rgba(0, 0, 0, 0.5))' }}
          />

          {/* Mode tabs */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => {
                setMode('login')
                setError(null)
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-mono font-bold transition-all ${
                mode === 'login'
                  ? 'bg-black/25 border-2 border-black/40 text-white'
                  : 'bg-transparent border border-black/20 text-white/60 hover:text-white/90'
              }`}
            >
              log in
            </button>
            <button
              onClick={() => {
                setMode('register')
                setError(null)
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-mono font-bold transition-all ${
                mode === 'register'
                  ? 'bg-black/25 border-2 border-black/40 text-white'
                  : 'bg-transparent border border-black/20 text-white/60 hover:text-white/90'
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
                className="w-full bg-black/30 border border-black/25 rounded-lg px-4 py-3
                         text-sm font-mono text-white placeholder-white/50
                         focus:border-black/50 focus:outline-none focus:shadow-[0_0_15px_rgba(0,0,0,0.3)]
                         transition-all duration-300"
              />
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="email"
              className="w-full bg-black/30 border border-black/25 rounded-lg px-4 py-3
                       text-sm font-mono text-white placeholder-white/50
                       focus:border-black/50 focus:outline-none focus:shadow-[0_0_15px_rgba(0,0,0,0.3)]
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
              className="w-full bg-black/30 border border-black/25 rounded-lg px-4 py-3
                       text-sm font-mono text-white placeholder-white/50
                       focus:border-black/50 focus:outline-none focus:shadow-[0_0_15px_rgba(0,0,0,0.3)]
                       transition-all duration-300"
            />

            <button
              type="submit"
              disabled={
                loading ||
                !email.trim() ||
                !password.trim() ||
                (mode === 'register' && !username.trim())
              }
              className="lobby-btn w-full relative overflow-hidden group
                       bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-3
                       text-base font-mono font-bold text-white
                       hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                       transition-all duration-300"
            >
              <span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                            translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"
              />
              <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {mode === 'login' ? 'logging in...' : 'creating account...'}
                  </span>
                ) : mode === 'login' ? (
                  'log in'
                ) : (
                  'create account'
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
            <div className="flex-1 h-px bg-black/20" />
            <span className="text-white/60 text-xs font-mono">or</span>
            <div className="flex-1 h-px bg-black/20" />
          </div>

          <button
            onClick={continueAsGuest}
            disabled={loading}
            className="w-full py-3 rounded-lg text-sm font-mono text-white/70 border border-black/25
                     hover:text-white hover:border-black/40 hover:bg-black/15
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-all duration-300"
          >
            continue as guest
          </button>
        </div>
      </div>
      )}

      <style>{`
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        .logo-splash {
          animation: logo-splash-in 0.8s ease-out both;
        }
        @keyframes logo-splash-in {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        .logo-piece {
          animation: logo-float 3s ease-in-out infinite;
        }
        .logo-piece-1 { animation-delay: 0s; }
        .logo-piece-2 { animation-delay: -1s; }
        .logo-piece-3 { animation-delay: -2s; }
        .logo-piece:hover {
          filter: drop-shadow(0 0 24px rgba(57, 255, 20, 0.6)) !important;
        }
        @keyframes lobby-card-enter {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lobby-card-enter {
          animation: lobby-card-enter 0.5s ease-out 0.2s both;
        }
        .lobby-btn:not(:disabled):hover  { transform: scale(1.03); }
        .lobby-btn:not(:disabled):active { transform: scale(0.97); }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.3) inset !important;
          -webkit-text-fill-color: white !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  )
}
