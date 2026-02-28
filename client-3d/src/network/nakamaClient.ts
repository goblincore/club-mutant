import { Client, Session } from '@heroiclabs/nakama-js'
import { useAuthStore } from '../stores/authStore'

const NAKAMA_SERVER_KEY = import.meta.env.VITE_NAKAMA_SERVER_KEY || 'clubmutant_dev'
const NAKAMA_HOST = import.meta.env.VITE_NAKAMA_HOST || 'localhost'
const NAKAMA_PORT = import.meta.env.VITE_NAKAMA_PORT || '7350'
const NAKAMA_USE_SSL = import.meta.env.VITE_NAKAMA_USE_SSL === 'true'

let _client: Client | null = null
let _session: Session | null = null

function getClient(): Client {
  if (!_client) {
    _client = new Client(NAKAMA_SERVER_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_USE_SSL)
  }
  return _client
}

/**
 * Restore a Nakama session from stored tokens.
 * Automatically refreshes if the access token is expired but refresh token is valid.
 * Does NOT call logout() on network failure — the user stays authenticated and the
 * token will be retried on the next API call.
 */
export async function restoreNakamaSession(): Promise<Session | null> {
  const store = useAuthStore.getState()
  if (!store.token || !store.refreshToken) return null

  try {
    _session = Session.restore(store.token, store.refreshToken)
  } catch (err) {
    console.warn('[nakama] Failed to parse stored session tokens:', err)
    _session = null
    return null
  }

  const now = Date.now() / 1000
  const expired = _session.isexpired(now)
  const refreshExpired = _session.isrefreshexpired(now)
  console.log('[nakama] restoreNakamaSession: isexpired=%s isrefreshexpired=%s', expired, refreshExpired)

  if (expired) {
    if (refreshExpired) {
      console.warn('[nakama] Both tokens expired — logging out')
      store.logout()
      return null
    }

    try {
      const client = getClient()
      _session = await client.sessionRefresh(_session)

      store.setAuth(
        _session.token,
        _session.refresh_token,
        _session.username ?? store.username ?? '',
        _session.user_id ?? store.userId ?? '',
      )
    } catch (err) {
      // Network failure or server rejection — clear SDK session but keep store auth.
      // The user remains authenticated; getValidToken() will retry on next room join.
      console.warn('[nakama] Session refresh failed (keeping auth state):', err)
      _session = null
      return null
    }
  }

  return _session
}

/**
 * Authenticate with email + password. Creates account if `create` is true.
 */
export async function authenticateEmail(
  email: string,
  password: string,
  create: boolean,
  username?: string,
): Promise<Session> {
  const client = getClient()
  _session = await client.authenticateEmail(email, password, create, username)

  useAuthStore.getState().setAuth(
    _session.token,
    _session.refresh_token,
    _session.username ?? username ?? '',
    _session.user_id ?? '',
  )

  return _session
}

/**
 * Get current valid token string for passing to Colyseus.
 * Returns null if not authenticated. Auto-refreshes expired tokens.
 */
export async function getValidToken(): Promise<string | null> {
  if (!_session) {
    const restored = await restoreNakamaSession()
    if (!restored) return null
    _session = restored
  }

  const now = Date.now() / 1000
  if (_session.isexpired(now)) {
    if (_session.isrefreshexpired(now)) {
      console.warn('[nakama] getValidToken: both tokens expired — logging out')
      useAuthStore.getState().logout()
      return null
    }

    try {
      const client = getClient()
      _session = await client.sessionRefresh(_session)
      useAuthStore.getState().setAuth(
        _session.token,
        _session.refresh_token,
        _session.username ?? '',
        _session.user_id ?? '',
      )
    } catch {
      // Network failure or transient server error — don't logout.
      // Return null so the caller joins as guest; they remain authenticated
      // in the store and the token will be retried on the next room join.
      _session = null
      return null
    }
  }

  return _session.token
}

export function getCurrentSession(): Session | null {
  return _session
}

export function clearNakamaSession(): void {
  _session = null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function requireSession() {
  if (!_session) throw new Error('Not authenticated')
  return _session
}

// ── Friends API ──────────────────────────────────────────────────────────────

/**
 * Send a friend request by Nakama user ID and/or username.
 * Also used to accept an incoming request (mutual confirmation).
 */
export async function sendFriendRequest(userIds: string[], usernames: string[]): Promise<void> {
  await getClient().addFriends(requireSession(), userIds, usernames)
}

export async function removeFriend(userId: string): Promise<void> {
  await getClient().deleteFriends(requireSession(), [userId])
}

/**
 * List friends by state:
 *   0 = mutual friends, 1 = sent invites (awaiting), 2 = received invites, 3 = blocked
 * Omit state to get all.
 */
export async function listFriends(state?: number): Promise<import('@heroiclabs/nakama-js').Friend[]> {
  const result = await getClient().listFriends(requireSession(), state, 100)
  return result.friends ?? []
}

// ── Users API ────────────────────────────────────────────────────────────────

export async function getNakamaUsers(
  usernames: string[],
): Promise<import('@heroiclabs/nakama-js').User[]> {
  const result = await getClient().getUsers(requireSession(), undefined, usernames)
  return result.users ?? []
}

// ── Notifications API ────────────────────────────────────────────────────────

export async function listNotifications(
  limit = 20,
): Promise<import('@heroiclabs/nakama-js').Notification[]> {
  const result = await getClient().listNotifications(requireSession(), limit)
  return result.notifications ?? []
}

export async function deleteNotifications(ids: string[]): Promise<void> {
  await getClient().deleteNotifications(requireSession(), ids)
}
