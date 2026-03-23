import type {
  OS5kMessage,
  UserProfile,
  FriendEntry,
  MailMessage,
  ConversationSummary,
  PlaylistEntry,
  WallPost,
  Video,
  Playlist,
  PlaylistItem,
} from './types'

type PushHandler = (payload: unknown) => void

class OS5000kBridge {
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  private listeners = new Map<string, Set<PushHandler>>()
  private _connected = false
  private _user: { userId: string; username: string } | null = null

  constructor() {
    window.addEventListener('message', this.handleMessage)
  }

  private handleMessage = (event: MessageEvent) => {
    const msg = event.data as OS5kMessage
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('os5k:'))
      return

    if (msg.type === 'os5k:response') {
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      if (msg.error) {
        entry.reject(new Error(msg.error))
      } else {
        entry.resolve(msg.payload)
      }
    } else if (msg.type === 'os5k:push') {
      if (msg.method === 'system.connected') {
        this._connected = true
        this._user = msg.payload as { userId: string; username: string }
      }
      const handlers = this.listeners.get(msg.method)
      if (handlers) {
        handlers.forEach((h) => h(msg.payload))
      }
    }
  }

  /** Send a request to the host and await the response */
  request<T = unknown>(method: string, payload: unknown = {}): Promise<T> {
    const id = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      })
      parent.postMessage(
        { type: 'os5k:request', id, method, payload } satisfies OS5kMessage,
        '*',
      )
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Bridge request timed out: ${method}`))
        }
      }, 10_000)
    })
  }

  /** Subscribe to push events from the host */
  on(method: string, callback: PushHandler): void {
    let set = this.listeners.get(method)
    if (!set) {
      set = new Set()
      this.listeners.set(method, set)
    }
    set.add(callback)
  }

  /** Unsubscribe from push events */
  off(method: string, callback: PushHandler): void {
    this.listeners.get(method)?.delete(callback)
  }

  /** Whether the bridge has received the system.connected push */
  get connected(): boolean {
    return this._connected
  }

  /** Current user info (set after system.connected) */
  get user(): { userId: string; username: string } | null {
    return this._user
  }

  // ── Convenience methods ──────────────────────────────────────────────

  getProfile(): Promise<UserProfile> {
    return this.request('profile.getSelf')
  }

  getUserProfile(userId: string): Promise<UserProfile> {
    return this.request('profile.getUser', { userId })
  }

  getFriends(state?: number): Promise<{ friends: FriendEntry[] }> {
    return this.request('friends.list', { state })
  }

  addFriend(opts: {
    userId?: string
    username?: string
  }): Promise<{ success: boolean }> {
    return this.request('friends.add', opts)
  }

  removeFriend(userId: string): Promise<{ success: boolean }> {
    return this.request('friends.remove', { userId })
  }

  sendMail(
    recipientId: string,
    subject: string,
    body: string,
  ): Promise<{ messageId: string }> {
    return this.request('mail.send', { recipientId, subject, body })
  }

  listConversations(
    cursor?: string,
  ): Promise<{ conversations: ConversationSummary[]; cursor?: string }> {
    return this.request('mail.listConversations', { cursor })
  }

  getMessages(
    otherUserId: string,
    cursor?: string,
  ): Promise<{ messages: MailMessage[]; cursor?: string }> {
    return this.request('mail.getMessages', { otherUserId, cursor })
  }

  markRead(otherUserId: string): Promise<{ success: boolean }> {
    return this.request('mail.markRead', { otherUserId })
  }

  getPlaylists(): Promise<{ playlists: PlaylistEntry[] }> {
    return this.request('playlists.list')
  }

  // ── Wall posts ────────────────────────────────────────────────────

  getWallPosts(
    userId: string,
    cursor?: string,
  ): Promise<{ posts: WallPost[]; cursor?: string }> {
    return this.request('wall.getPosts', { userId, cursor })
  }

  createWallPost(
    targetUserId: string,
    content: string,
  ): Promise<WallPost> {
    return this.request('wall.createPost', { targetUserId, content })
  }

  deleteWallPost(postId: string, targetUserId: string): Promise<{ success: boolean }> {
    return this.request('wall.deletePost', { postId, targetUserId })
  }

  // ── YouTube ───────────────────────────────────────────────────────

  searchYouTube(query: string): Promise<Video[]> {
    return this.request('youtube.search', { query })
  }

  resolveYouTube(videoId: string): Promise<{ url: string; expiresAt: number }> {
    return this.request('youtube.resolve', { videoId })
  }

  importPlaylist(playlistUrl: string): Promise<Playlist> {
    return this.request('youtube.importPlaylist', { url: playlistUrl })
  }

  // ── Playlist CRUD ─────────────────────────────────────────────────

  createPlaylist(name: string): Promise<Playlist> {
    return this.request('playlists.create', { name })
  }

  addVideoToPlaylist(playlistId: string, video: PlaylistItem): Promise<{ success: boolean }> {
    return this.request('playlists.addVideo', { playlistId, video })
  }

  removeVideoFromPlaylist(playlistId: string, videoId: string): Promise<{ success: boolean }> {
    return this.request('playlists.removeVideo', { playlistId, videoId })
  }

  // ── Video playback ───────────────────────────────────────────

  playVideo(videoId: string, title?: string): Promise<{ success: boolean }> {
    return this.request('video.play', { videoId, title })
  }

  stopVideo(): Promise<{ success: boolean }> {
    return this.request('video.stop', {})
  }
}

// Expose globally for OS5000k programs
;(window as any).OS5000k = new OS5000kBridge()
