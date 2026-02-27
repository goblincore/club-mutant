import { create } from 'zustand'

const AUTH_TOKEN_KEY = 'club-mutant:nakama-token'
const AUTH_REFRESH_KEY = 'club-mutant:nakama-refresh'
const AUTH_USERNAME_KEY = 'club-mutant:nakama-username'
const AUTH_USER_ID_KEY = 'club-mutant:nakama-user-id'

function parseJwtExp(token: string): number | null {
  try {
    return (JSON.parse(atob(token.split('.')[1]!)) as { exp: number }).exp
  } catch {
    return null
  }
}

/**
 * Read stored tokens and validate them locally (no network).
 * Returns the stored credentials if still usable, null otherwise.
 * Called once at module load time so authReady is correct before React renders.
 */
function loadStoredSession() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const refreshToken = localStorage.getItem(AUTH_REFRESH_KEY)
  const username = localStorage.getItem(AUTH_USERNAME_KEY)
  const userId = localStorage.getItem(AUTH_USER_ID_KEY)

  if (!token || !refreshToken || !username || !userId) return null

  const now = Date.now() / 1000

  // Access token still valid?
  const exp = parseJwtExp(token)
  if (exp && now < exp) {
    return { token, refreshToken, username, userId }
  }

  // Access token expired — check refresh token
  const refreshExp = parseJwtExp(refreshToken)
  if (refreshExp && now < refreshExp) {
    return { token, refreshToken, username, userId }
  }

  // Both expired — clear storage
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_REFRESH_KEY)
  localStorage.removeItem(AUTH_USERNAME_KEY)
  localStorage.removeItem(AUTH_USER_ID_KEY)
  return null
}

// Synchronous init — runs before any React component renders
const _stored = loadStoredSession()

export interface AuthState {
  /** Whether the user has completed the auth screen (guest or logged in) */
  authReady: boolean
  /** Whether the user is authenticated with Nakama (not a guest) */
  isAuthenticated: boolean
  /** Nakama JWT token (null for guests) */
  token: string | null
  /** Nakama refresh token */
  refreshToken: string | null
  /** Nakama username */
  username: string | null
  /** Nakama user ID */
  userId: string | null

  setAuth: (token: string, refreshToken: string, username: string, userId: string) => void
  continueAsGuest: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  // authReady is true immediately if valid tokens are in localStorage —
  // this prevents the AuthScreen flash on every page reload.
  authReady: _stored !== null,
  isAuthenticated: _stored !== null,
  token: _stored?.token ?? null,
  refreshToken: _stored?.refreshToken ?? null,
  username: _stored?.username ?? null,
  userId: _stored?.userId ?? null,

  setAuth: (token, refreshToken, username, userId) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    localStorage.setItem(AUTH_REFRESH_KEY, refreshToken)
    localStorage.setItem(AUTH_USERNAME_KEY, username)
    localStorage.setItem(AUTH_USER_ID_KEY, userId)

    set({
      authReady: true,
      isAuthenticated: true,
      token,
      refreshToken,
      username,
      userId,
    })
  },

  continueAsGuest: () => {
    set({
      authReady: true,
      isAuthenticated: false,
      token: null,
      refreshToken: null,
      username: null,
      userId: null,
    })
  },

  logout: () => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_REFRESH_KEY)
    localStorage.removeItem(AUTH_USERNAME_KEY)
    localStorage.removeItem(AUTH_USER_ID_KEY)

    set({
      authReady: false,
      isAuthenticated: false,
      token: null,
      refreshToken: null,
      username: null,
      userId: null,
    })
  },
}))
