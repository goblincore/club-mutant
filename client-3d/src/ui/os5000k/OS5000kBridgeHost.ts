/**
 * Host-side bridge that handles postMessage requests from the OS5000k iframe.
 * Routes requests to Nakama client functions and sends responses back.
 */

import {
  getMyAccount,
  getUserProfile,
  listFriends,
  sendFriendRequest,
  removeFriend,
  listServerPlaylists,
  sendDirectMessage,
  listConversations,
  getDirectMessages,
  markMessagesRead,
} from '../../network/nakamaClient'
import { usePresenceStore } from '../../stores/presenceStore'
import { useAuthStore } from '../../stores/authStore'
import { setOS5kPushHandler } from '../../events/os5000kEvents'

interface OS5kRequest {
  type: 'os5k:request'
  id: string
  method: string
  payload: Record<string, unknown>
}

type Handler = (payload: Record<string, unknown>) => Promise<unknown>

export class OS5000kBridgeHost {
  private iframe: HTMLIFrameElement | null = null
  private handlers: Map<string, Handler>
  private rateCounts = new Map<string, { count: number; resetAt: number }>()
  private readonly RATE_LIMIT = 10 // requests per second per method

  constructor() {
    this.handlers = new Map<string, Handler>([
      ['profile.getSelf', this.handleGetSelf],
      ['profile.getUser', this.handleGetUser],
      ['friends.list', this.handleFriendsList],
      ['friends.add', this.handleFriendsAdd],
      ['friends.remove', this.handleFriendsRemove],
      ['mail.send', this.handleMailSend],
      ['mail.listConversations', this.handleMailListConversations],
      ['mail.getMessages', this.handleMailGetMessages],
      ['mail.markRead', this.handleMailMarkRead],
      ['playlists.list', this.handlePlaylistsList],
    ])

    window.addEventListener('message', this.onMessage)
    setOS5kPushHandler(this.push)
  }

  setIframe(iframe: HTMLIFrameElement): void {
    this.iframe = iframe
  }

  destroy(): void {
    window.removeEventListener('message', this.onMessage)
    setOS5kPushHandler(null)
    this.iframe = null
  }

  /** Send a push event (unsolicited) to the OS5000k iframe */
  push = (method: string, payload: unknown): void => {
    this.iframe?.contentWindow?.postMessage(
      { type: 'os5k:push', id: '', method, payload },
      '*',
    )
  }

  /** Send the initial connected event with user info */
  sendConnected(): void {
    const auth = useAuthStore.getState()
    this.push('system.connected', {
      userId: auth.userId || '',
      username: auth.username || '',
    })
  }

  private onMessage = async (event: MessageEvent): Promise<void> => {
    const msg = event.data as OS5kRequest
    if (!msg || msg.type !== 'os5k:request' || !msg.id || !msg.method) return

    // Rate limit
    if (!this.checkRate(msg.method)) {
      this.respond(msg.id, null, 'Rate limit exceeded')
      return
    }

    const handler = this.handlers.get(msg.method)
    if (!handler) {
      this.respond(msg.id, null, `Unknown method: ${msg.method}`)
      return
    }

    try {
      const result = await handler(msg.payload || {})
      this.respond(msg.id, result)
    } catch (err) {
      this.respond(
        msg.id,
        null,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  private respond(id: string, payload: unknown, error?: string): void {
    this.iframe?.contentWindow?.postMessage(
      { type: 'os5k:response', id, method: '', payload, error },
      '*',
    )
  }

  private checkRate(method: string): boolean {
    const now = Date.now()
    let entry = this.rateCounts.get(method)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + 1000 }
      this.rateCounts.set(method, entry)
    }
    entry.count++
    return entry.count <= this.RATE_LIMIT
  }

  // ── Request handlers ───────────────────────────────────────────────

  private handleGetSelf = async (): Promise<unknown> => {
    const account = await getMyAccount()
    const meta = (account.user?.metadata as unknown as Record<string, unknown>) || {}
    return {
      userId: account.user?.id || '',
      username: account.user?.username || '',
      displayName: account.user?.display_name || '',
      avatarUrl: account.user?.avatar_url || '',
      bio: (meta.bio as string) || '',
      favoriteSong: (meta.favorite_song as string) || '',
      links: (meta.links as unknown[]) || [],
      backgroundUrl: (meta.background_url as string) || '',
    }
  }

  private handleGetUser = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const userId = payload.userId as string
    if (!userId) throw new Error('userId required')

    const data = await getUserProfile(userId)
    const meta = data.metadata || {}
    return {
      userId: data.user_id || '',
      username: data.username || '',
      displayName: data.display_name || '',
      avatarUrl: data.avatar_url || '',
      bio: (meta.bio as string) || '',
      favoriteSong: (meta.favorite_song as string) || '',
      links: (meta.links as unknown[]) || [],
      backgroundUrl: (meta.background_url as string) || '',
    }
  }

  private handleFriendsList = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const state = payload.state as number | undefined
    const friends = await listFriends(state)
    const onlineIds = usePresenceStore.getState().onlineUserIds

    return {
      friends: friends.map((f) => ({
        userId: f.user?.id || '',
        username: f.user?.username || '',
        displayName: f.user?.display_name || '',
        avatarUrl: f.user?.avatar_url || '',
        online: onlineIds.has(f.user?.id || ''),
        state: f.state,
      })),
    }
  }

  private handleFriendsAdd = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const userIds = payload.userId ? [payload.userId as string] : []
    const usernames = payload.username ? [payload.username as string] : []
    await sendFriendRequest(userIds, usernames)
    return { success: true }
  }

  private handleFriendsRemove = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const userId = payload.userId as string
    if (!userId) throw new Error('userId required')
    await removeFriend(userId)
    return { success: true }
  }

  private handleMailSend = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const recipientId = payload.recipientId as string
    const subject = payload.subject as string
    const body = payload.body as string
    if (!recipientId || !subject || !body) {
      throw new Error('recipientId, subject, and body are required')
    }
    return sendDirectMessage(recipientId, subject, body)
  }

  private handleMailListConversations = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    return listConversations(payload.cursor as string | undefined)
  }

  private handleMailGetMessages = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const otherUserId = payload.otherUserId as string
    if (!otherUserId) throw new Error('otherUserId required')
    return getDirectMessages(otherUserId, payload.cursor as string | undefined)
  }

  private handleMailMarkRead = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const otherUserId = payload.otherUserId as string
    if (!otherUserId) throw new Error('otherUserId required')
    return markMessagesRead(otherUserId)
  }

  private handlePlaylistsList = async (): Promise<unknown> => {
    const playlists = await listServerPlaylists()
    return {
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        trackCount: p.items?.length || 0,
      })),
    }
  }
}
