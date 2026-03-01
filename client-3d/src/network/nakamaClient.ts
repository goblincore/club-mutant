import { Client, Session } from '@heroiclabs/nakama-js'
import type { Socket, Presence } from '@heroiclabs/nakama-js'
import { useAuthStore } from '../stores/authStore'
import { usePresenceStore } from '../stores/presenceStore'

const NAKAMA_SERVER_KEY = import.meta.env.VITE_NAKAMA_SERVER_KEY || 'clubmutant_dev'
const NAKAMA_HOST = import.meta.env.VITE_NAKAMA_HOST || 'localhost'
const NAKAMA_PORT = import.meta.env.VITE_NAKAMA_PORT || '7350'
const NAKAMA_USE_SSL = import.meta.env.VITE_NAKAMA_USE_SSL === 'true'

let _client: Client | null = null
let _session: Session | null = null
let _socket: Socket | null = null
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
let _reconnectAttempts = 0
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

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

  if (_session) {
    connectSocket().catch((err) =>
      console.warn('[nakama] Socket connect failed on restore:', err),
    )
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

  connectSocket().catch((err) =>
    console.warn('[nakama] Socket connect failed after auth:', err),
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
  disconnectSocket()
  _session = null
}

// ── Socket / Presence ───────────────────────────────────────────────────────

function scheduleReconnect(): void {
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn('[nakama] Max reconnect attempts reached, giving up')
    return
  }
  const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, _reconnectAttempts), 30_000)
  _reconnectTimer = setTimeout(async () => {
    _reconnectAttempts++
    _socket = null
    try {
      await connectSocket()
    } catch {
      scheduleReconnect()
    }
  }, delay)
}

/**
 * Open a Nakama WebSocket for presence tracking.
 * createStatus=true makes this user appear online to friends.
 */
export async function connectSocket(): Promise<void> {
  if (_socket) return
  const session = await ensureSession()
  const socket = getClient().createSocket(NAKAMA_USE_SSL)

  socket.ondisconnect = () => {
    console.warn('[nakama] Socket disconnected')
    _socket = null
    usePresenceStore.getState().clear()
    scheduleReconnect()
  }

  socket.onstatuspresence = (event) => {
    const store = usePresenceStore.getState()
    if (event.joins?.length) {
      store.addOnline(event.joins.map((p: Presence) => p.user_id))
    }
    if (event.leaves?.length) {
      store.removeOnline(event.leaves.map((p: Presence) => p.user_id))
    }
  }

  await socket.connect(session, true)
  _socket = socket
  _reconnectAttempts = 0
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  console.log('[nakama] Socket connected, presence active')
}

export function disconnectSocket(): void {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  if (_socket) {
    _socket.ondisconnect = () => {} // prevent reconnect on intentional disconnect
    _socket.disconnect(false)
    _socket = null
  }
  usePresenceStore.getState().clear()
}

/**
 * Follow friends for real-time status updates.
 * Returns their current online presences to seed initial state.
 */
export async function followFriends(userIds: string[]): Promise<void> {
  if (!_socket || !userIds.length) return
  try {
    const status = await _socket.followUsers(userIds)
    if (status.presences?.length) {
      usePresenceStore.getState().addOnline(
        status.presences.map((p: Presence) => p.user_id),
      )
    }
  } catch (err) {
    console.warn('[nakama] followFriends failed:', err)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a valid session, restoring from stored tokens if needed.
 * Unlike requireSession() (sync, throws if null), this lazily restores the session
 * so social API calls work in the lobby before any room join has occurred.
 */
async function ensureSession(): Promise<Session> {
  if (!_session) {
    await restoreNakamaSession()
  }
  if (!_session) throw new Error('Not authenticated')
  return _session
}

// ── Friends API ──────────────────────────────────────────────────────────────

/**
 * Send a friend request by Nakama user ID and/or username.
 * Also used to accept an incoming request (mutual confirmation).
 */
export async function sendFriendRequest(userIds: string[], usernames: string[]): Promise<void> {
  await getClient().addFriends(await ensureSession(), userIds, usernames)
}

export async function removeFriend(userId: string): Promise<void> {
  await getClient().deleteFriends(await ensureSession(), [userId])
}

/**
 * List friends by state:
 *   0 = mutual friends, 1 = sent invites (awaiting), 2 = received invites, 3 = blocked
 * Omit state to get all.
 */
export async function listFriends(state?: number): Promise<import('@heroiclabs/nakama-js').Friend[]> {
  const result = await getClient().listFriends(await ensureSession(), state, 100)
  return result.friends ?? []
}

// ── Users API ────────────────────────────────────────────────────────────────

export async function getNakamaUsers(
  usernames: string[],
): Promise<import('@heroiclabs/nakama-js').User[]> {
  const result = await getClient().getUsers(await ensureSession(), undefined, usernames)
  return result.users ?? []
}

// ── Notifications API ────────────────────────────────────────────────────────

export async function listNotifications(
  limit = 20,
): Promise<import('@heroiclabs/nakama-js').Notification[]> {
  const result = await getClient().listNotifications(await ensureSession(), limit)
  return result.notifications ?? []
}

export async function deleteNotifications(ids: string[]): Promise<void> {
  await getClient().deleteNotifications(await ensureSession(), ids)
}

// ── Profile / Account API ───────────────────────────────────────────────────

export interface ProfileMetadata {
  bio?: string
  favorite_song?: string
  links?: Array<{ label: string; url: string }>
  background_url?: string
}

/**
 * Update profile metadata via server-side RPC. Merges with existing metadata.
 */
export async function updateProfileMetadata(metadata: ProfileMetadata): Promise<ProfileMetadata> {
  const session = await ensureSession()
  const result = await getClient().rpc(session, 'update_profile', metadata)
  return (result.payload as { success: boolean; metadata: ProfileMetadata }).metadata
}

/**
 * Update client-writable account fields (avatar_url, display_name).
 */
export async function updateAccountFields(fields: {
  avatar_url?: string
  display_name?: string
}): Promise<void> {
  const session = await ensureSession()
  await getClient().updateAccount(session, fields)
}

/**
 * Get full account info for the current user.
 */
export async function getMyAccount() {
  const session = await ensureSession()
  return getClient().getAccount(session)
}
