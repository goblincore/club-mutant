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
  saveServerPlaylist,
  sendDirectMessage,
  listConversations,
  getDirectMessages,
  markMessagesRead,
  createWallPost,
  getWallPosts,
  deleteWallPost,
  getUserSetting,
  setUserSetting,
} from '../../network/nakamaClient'
import { getNetwork } from '../../network/NetworkManager'
import { usePresenceStore } from '../../stores/presenceStore'
import { useAuthStore } from '../../stores/authStore'
import { useOS5kStore } from '../../stores/os5000kStore'
import { setOS5kPushHandler } from '../../events/os5000kEvents'

interface OS5kRequest {
  type: 'os5k:request'
  id: string
  method: string
  payload: Record<string, unknown>
}

type Handler = (payload: Record<string, unknown>) => Promise<unknown>

export class OS5000kBridgeHost {
  private iframes = new Set<HTMLIFrameElement>()
  private requestSources = new Map<string, MessageEventSource>()
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
      ['playlists.create', this.handlePlaylistsCreate],
      ['playlists.addVideo', this.handlePlaylistsAddVideo],
      ['playlists.removeVideo', this.handlePlaylistsRemoveVideo],
      ['wall.getPosts', this.handleWallGetPosts],
      ['wall.createPost', this.handleWallCreatePost],
      ['wall.deletePost', this.handleWallDeletePost],
      ['youtube.search', this.handleYouTubeSearch],
      ['youtube.resolve', this.handleYouTubeResolve],
      ['youtube.importPlaylist', this.handleYouTubeImportPlaylist],
      ['video.play', this.handleVideoPlay],
      ['video.stop', this.handleVideoStop],
      ['settings.getWallpaper', this.handleSettingsGetWallpaper],
      ['settings.setWallpaper', this.handleSettingsSetWallpaper],
      ['settings.uploadWallpaper', this.handleSettingsUploadWallpaper],
    ])

    window.addEventListener('message', this.onMessage)
    setOS5kPushHandler(this.push)
  }

  registerIframe(iframe: HTMLIFrameElement): void {
    this.iframes.add(iframe)
  }

  unregisterIframe(iframe: HTMLIFrameElement): void {
    this.iframes.delete(iframe)
  }

  destroy(): void {
    window.removeEventListener('message', this.onMessage)
    setOS5kPushHandler(null)
    this.iframes.clear()
    this.requestSources.clear()
  }

  /** Send a push event (unsolicited) to all registered iframes */
  push = (method: string, payload: unknown): void => {
    const msg = { type: 'os5k:push', id: '', method, payload }
    for (const iframe of this.iframes) {
      iframe.contentWindow?.postMessage(msg, '*')
    }
  }

  /** Send the initial connected event with user info (broadcasts to all) */
  sendConnected(): void {
    const auth = useAuthStore.getState()
    this.push('system.connected', {
      userId: auth.userId || '',
      username: auth.username || '',
    })
  }

  /** Send connected event to a specific iframe */
  sendConnectedTo(iframe: HTMLIFrameElement): void {
    const auth = useAuthStore.getState()
    iframe.contentWindow?.postMessage(
      { type: 'os5k:push', id: '', method: 'system.connected', payload: { userId: auth.userId || '', username: auth.username || '' } },
      '*',
    )
  }

  private onMessage = async (event: MessageEvent): Promise<void> => {
    const msg = event.data as OS5kRequest
    if (!msg || msg.type !== 'os5k:request' || !msg.id || !msg.method) return

    // Track the source so respond() can route back to the correct iframe
    if (event.source) {
      this.requestSources.set(msg.id, event.source)
    }

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
      this.respond(msg.id, null, err instanceof Error ? err.message : String(err))
    }
  }

  private respond(id: string, payload: unknown, error?: string): void {
    const source = this.requestSources.get(id)
    this.requestSources.delete(id)
    const msg = { type: 'os5k:response', id, method: '', payload, error }
    if (source && 'postMessage' in source) {
      ;(source as WindowProxy).postMessage(msg, '*')
    }
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
        items: p.items || [],
      })),
    }
  }

  // ── Playlist CRUD (read-modify-write through save_playlist) ────────

  private handlePlaylistsCreate = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const name = payload.name as string
    if (!name) throw new Error('name required')
    const id = crypto.randomUUID()
    const now = Date.now()
    await saveServerPlaylist({ id, name, items: [] })
    return { id, name, items: [], createdAt: now, updatedAt: now }
  }

  private handlePlaylistsAddVideo = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const playlistId = payload.playlistId as string
    const video = payload.video as { id: string; title: string; link: string; duration: number; thumbnail?: string }
    if (!playlistId || !video) throw new Error('playlistId and video required')

    const playlists = await listServerPlaylists()
    const pl = playlists.find((p) => p.id === playlistId)
    if (!pl) throw new Error('Playlist not found')

    const items = pl.items || []
    if (items.some((item) => item.id === video.id)) {
      return { success: true } // already in playlist
    }
    items.push(video)
    await saveServerPlaylist({ id: pl.id, name: pl.name, items })
    return { success: true }
  }

  private handlePlaylistsRemoveVideo = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const playlistId = payload.playlistId as string
    const videoId = payload.videoId as string
    if (!playlistId || !videoId) throw new Error('playlistId and videoId required')

    const playlists = await listServerPlaylists()
    const pl = playlists.find((p) => p.id === playlistId)
    if (!pl) throw new Error('Playlist not found')

    const items = (pl.items || []).filter((item) => item.id !== videoId)
    await saveServerPlaylist({ id: pl.id, name: pl.name, items })
    return { success: true }
  }

  // ── Wall Posts ─────────────────────────────────────────────────────

  private handleWallGetPosts = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const userId = payload.userId as string
    if (!userId) throw new Error('userId required')
    return getWallPosts(userId, payload.cursor as string | undefined)
  }

  private handleWallCreatePost = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const targetUserId = payload.targetUserId as string
    const content = payload.content as string
    if (!targetUserId || !content) throw new Error('targetUserId and content required')
    return createWallPost(targetUserId, content)
  }

  private handleWallDeletePost = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const postId = payload.postId as string
    const targetUserId = payload.targetUserId as string
    if (!postId || !targetUserId) throw new Error('postId and targetUserId required')
    await deleteWallPost(postId, targetUserId)
    return { success: true }
  }

  // ── YouTube ────────────────────────────────────────────────────────

  private handleYouTubeSearch = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const query = payload.query as string
    if (!query) throw new Error('query required')
    return getNetwork().searchYouTube(query)
  }

  private handleYouTubeResolve = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const videoId = payload.videoId as string
    if (!videoId) throw new Error('videoId required')
    return getNetwork().resolveYouTube(videoId)
  }

  private handleYouTubeImportPlaylist = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const url = payload.url as string
    if (!url) throw new Error('url required')
    // TODO: Call Go service playlist endpoint when implemented
    throw new Error('Playlist import not yet available')
  }

  // ── Video playback ─────────────────────────────────────────────

  private handleVideoPlay = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const videoId = payload.videoId as string
    const title = (payload.title as string) || ''
    if (!videoId) throw new Error('videoId required')
    useOS5kStore.getState().setActiveVideo({ videoId, title })
    return { success: true }
  }

  private handleVideoStop = async (): Promise<unknown> => {
    useOS5kStore.getState().setActiveVideo(null)
    return { success: true }
  }

  // ── Settings ───────────────────────────────────────────────────────

  private handleSettingsGetWallpaper = async (): Promise<unknown> => {
    const wp = await getUserSetting<{ type: string; value: string }>('wallpaper')
    return wp ?? null
  }

  private handleSettingsSetWallpaper = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const type = payload.type as 'preset' | 'color' | 'image'
    const value = payload.value as string
    if (!type || !value) throw new Error('type and value required')
    await setUserSetting('wallpaper', { type, value })
    useOS5kStore.getState().setWallpaper({ type, value })
    return { success: true }
  }

  private handleSettingsUploadWallpaper = async (
    payload: Record<string, unknown>,
  ): Promise<unknown> => {
    const dataUrl = payload.dataUrl as string
    if (!dataUrl || !dataUrl.startsWith('data:image/')) throw new Error('invalid image data')
    const sizeKb = Math.round(dataUrl.length * 0.75 / 1024)
    if (sizeKb > 512) throw new Error(`Image too large (${sizeKb}KB). Max 512KB.`)
    await setUserSetting('wallpaper', { type: 'image', value: dataUrl })
    useOS5kStore.getState().setWallpaper({ type: 'image', value: dataUrl })
    return { success: true }
  }
}
