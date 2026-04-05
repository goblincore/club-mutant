import { useState, useEffect, useCallback } from 'react'
import { useKonpyuuTA } from '../../context/KonpyuuTAContext'
import type { UserProfile, WallPost } from '../../types'

type Tab = 'wall' | 'info' | 'friends'

interface Friend {
  userId: string
  username: string
  displayName: string
  online: boolean
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)

  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  return `${Math.floor(diff / 2592000)}mo`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function MutantBook() {
  const { socialService } = useKonpyuuTA()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<UserProfile | null>(null)

  const [currentTab, setCurrentTab] = useState<Tab>('wall')
  const [wallPosts, setWallPosts] = useState<WallPost[]>([])
  const [wallCursor, setWallCursor] = useState<string | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])

  const [composeText, setComposeText] = useState('')
  const [posting, setPosting] = useState(false)
  const [lookupInput, setLookupInput] = useState('')

  const isSelf = profileUserId === currentUserId

  // Load current user on mount
  useEffect(() => {
    if (!socialService) {
      setError('Social service not available')
      setLoading(false)
      return
    }

    const userId = socialService.getCurrentUserId()
    const username = socialService.getCurrentUsername()

    if (!userId) {
      setError('Not logged in')
      setLoading(false)
      return
    }

    setCurrentUserId(userId)
    setCurrentUsername(username)
    setProfileUserId(userId)
  }, [socialService])

  // Load profile when profileUserId changes
  useEffect(() => {
    if (!socialService || !profileUserId) return

    setLoading(true)
    setError(null)

    socialService.getUserProfile(profileUserId)
      .then((profile) => {
        setProfileData(profile)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
        setLoading(false)
      })
  }, [socialService, profileUserId])

  // Load wall posts when profileUserId changes
  const loadWallPosts = useCallback(async () => {
    if (!socialService || !profileUserId) return

    try {
      const result = await socialService.getWallPosts(profileUserId)
      setWallPosts(result.posts)
      setWallCursor(result.cursor ?? null)
    } catch (err) {
      console.error('Failed to load wall posts:', err)
    }
  }, [socialService, profileUserId])

  // Load friends when tab changes to 'friends'
  const loadFriends = useCallback(async () => {
    if (!socialService) return

    try {
      const result = await socialService.listFriends()
      setFriends(result)
    } catch (err) {
      console.error('Failed to load friends:', err)
    }
  }, [socialService])

  useEffect(() => {
    if (currentTab === 'wall') {
      loadWallPosts()
    } else if (currentTab === 'friends') {
      loadFriends()
    }
  }, [currentTab, loadWallPosts, loadFriends])

  const handlePost = async () => {
    if (!socialService || !profileUserId || !composeText.trim() || posting) return

    setPosting(true)
    try {
      const post = await socialService.createWallPost(profileUserId, composeText.trim())
      setWallPosts((prev) => [post, ...prev])
      setComposeText('')
    } catch (err) {
      console.error('Failed to post:', err)
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (postId: string) => {
    if (!socialService || !profileUserId) return
    if (!confirm('Delete this post?')) return

    try {
      await socialService.deleteWallPost(postId, profileUserId)
      setWallPosts((prev) => prev.filter((p) => p.postId !== postId))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const handleLookup = () => {
    const userId = lookupInput.trim()
    if (userId) {
      setProfileUserId(userId)
      setCurrentTab('wall')
      setLookupInput('')
    }
  }

  const goToProfile = (userId: string) => {
    setProfileUserId(userId)
    setCurrentTab('wall')
  }

  const goToMyProfile = () => {
    if (currentUserId) {
      setProfileUserId(currentUserId)
      setCurrentTab('wall')
    }
  }

  if (loading) {
    return (
      <div className="mb-root">
        <div className="mb-loading">Loading profile...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-root">
        <div className="mb-error">{error}</div>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="mb-root">
        <div className="mb-error">Profile not found</div>
      </div>
    )
  }

  return (
    <div className="mb-root">
      {/* Lookup bar */}
      <div className="mb-lookup">
        {!isSelf && (
          <button className="mb-back-btn" onClick={goToMyProfile}>
            ← My Profile
          </button>
        )}
        <input
          className="mb-lookup-input"
          placeholder="Search user by ID..."
          value={lookupInput}
          onChange={(e) => setLookupInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
        />
        <button className="mb-lookup-btn" onClick={handleLookup}>
          Go
        </button>
      </div>

      {/* Profile header */}
      <div className="mb-header">
        <div className="mb-avatar">
          {profileData.avatar_url ? (
            <img src={profileData.avatar_url} alt="" onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }} />
          ) : (
            <span>{(profileData.username || '?').charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="mb-header-info">
          <div className="mb-name">
            {profileData.display_name || profileData.username || '???'}
          </div>
          <div className="mb-username">@{profileData.username || '???'}</div>
          {profileData.metadata.bio && (
            <div className="mb-bio">"{profileData.metadata.bio}"</div>
          )}
          {!isSelf && (
            <div className="mb-header-actions">
              <button className="mb-friend-btn">+ Add Friend</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-tabs">
        <button
          className={`mb-tab${currentTab === 'wall' ? ' active' : ''}`}
          onClick={() => setCurrentTab('wall')}
        >
          Wall
        </button>
        <button
          className={`mb-tab${currentTab === 'info' ? ' active' : ''}`}
          onClick={() => setCurrentTab('info')}
        >
          Info
        </button>
        <button
          className={`mb-tab${currentTab === 'friends' ? ' active' : ''}`}
          onClick={() => setCurrentTab('friends')}
        >
          Friends
        </button>
      </div>

      {/* Content */}
      <div className="mb-content">
        {currentTab === 'wall' && (
          <div className="mb-wall">
            {/* Compose */}
            {currentUserId && (
              <div className="mb-compose">
                <textarea
                  placeholder={
                    isSelf
                      ? "What's on your mind?"
                      : `Write something on ${profileData.display_name || profileData.username}'s wall...`
                  }
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                />
                <div className="mb-compose-actions">
                  <button
                    className="mb-post-btn"
                    onClick={handlePost}
                    disabled={!composeText.trim() || posting}
                  >
                    {posting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            )}

            {/* Posts */}
            {wallPosts.length === 0 ? (
              <div className="mb-empty">No wall posts yet.</div>
            ) : (
              wallPosts.map((post) => (
                <div key={post.postId} className="mb-post">
                  <div className="mb-post-avatar">
                    {post.authorUsername.charAt(0).toUpperCase()}
                  </div>
                  <div className="mb-post-body">
                    <div
                      className="mb-post-author"
                      onClick={() => goToProfile(post.authorId)}
                    >
                      {post.authorUsername}
                    </div>
                    <div className="mb-post-content">
                      {escapeHtml(post.content)}
                    </div>
                    <div className="mb-post-meta">
                      <span>{timeAgo(post.createdAt)}</span>
                      {post.authorId === currentUserId && (
                        <button
                          className="mb-delete-btn"
                          onClick={() => handleDelete(post.postId)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Load more */}
            {wallCursor && (
              <div className="mb-load-more">
                <button onClick={loadWallPosts}>Load More</button>
              </div>
            )}
          </div>
        )}

        {currentTab === 'info' && (
          <div className="mb-info">
            {profileData.metadata.bio && (
              <div className="mb-info-field">
                <div className="mb-info-label">Bio</div>
                <div className="mb-info-value">
                  {profileData.metadata.bio}
                </div>
              </div>
            )}
            {profileData.metadata.favoriteSong && (
              <div className="mb-info-field">
                <div className="mb-info-label">Favorite Song</div>
                <div className="mb-info-value">
                  {profileData.metadata.favoriteSong}
                </div>
              </div>
            )}
            {profileData.metadata.links && profileData.metadata.links.length > 0 && (
              <div className="mb-info-field">
                <div className="mb-info-label">Links</div>
                <div className="mb-info-value">
                  {profileData.metadata.links.map((link, i) => (
                    <div key={i}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!profileData.metadata.bio && !profileData.metadata.favoriteSong && !profileData.metadata.links?.length && (
              <div className="mb-empty">No info yet.</div>
            )}
          </div>
        )}

        {currentTab === 'friends' && (
          <div className="mb-friends">
            {friends.length === 0 ? (
              <div className="mb-empty">No friends yet.</div>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.userId}
                  className="mb-friend-card"
                  onClick={() => goToProfile(friend.userId)}
                >
                  <div className="mb-friend-avatar">
                    {friend.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="mb-friend-name">
                    {friend.displayName || friend.username}
                  </div>
                  <div className={`mb-friend-status ${friend.online ? 'online' : 'offline'}`}>
                    {friend.online ? 'Online' : 'Offline'}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
