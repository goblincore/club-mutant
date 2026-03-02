import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getNakamaUsers, listFriends, sendFriendRequest, type ProfileMetadata } from '../network/nakamaClient'
import { useAuthStore } from '../stores/authStore'
import { ProfileEditPanel } from './ProfileEditPanel'
import type { User } from '@heroiclabs/nakama-js'

type FriendStatus = 'none' | 'friends' | 'sent' | 'received'

const cardStyle = {
  backgroundColor: 'rgba(0,0,0,0.85)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(57,255,20,0.3)',
  boxShadow: '0 0 60px rgba(57,255,20,0.1)',
}

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated, userId: myUserId } = useAuthStore()

  const editOpen = searchParams.has('edit')

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [addingFriend, setAddingFriend] = useState(false)
  const [metadata, setMetadata] = useState<ProfileMetadata>({})
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!username) return
      setLoading(true)
      setNotFound(false)

      try {
        const users = await getNakamaUsers([username])
        if (cancelled) return

        if (!users.length) {
          setNotFound(true)
          return
        }

        const found = users[0]!
        setUser(found)

        // Parse profile metadata
        try {
          const meta = found.metadata
            ? typeof found.metadata === 'string'
              ? JSON.parse(found.metadata)
              : found.metadata
            : {}
          if (!cancelled) setMetadata(meta)
        } catch { /* ignore bad metadata */ }

        // Check friendship status for authenticated users viewing others' profiles
        if (isAuthenticated && found.id !== myUserId) {
          try {
            const friends = await listFriends()
            if (cancelled) return
            const rel = friends.find((f) => f.user?.id === found.id)
            if (rel) {
              if (rel.state === 0) setFriendStatus('friends')
              else if (rel.state === 1) setFriendStatus('sent')
              else if (rel.state === 2) setFriendStatus('received')
            }
          } catch { /* ignore */ }
        }
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [username, isAuthenticated, myUserId, reloadKey])

  const handleAddFriend = async () => {
    if (!user?.id) return
    setAddingFriend(true)
    try {
      await sendFriendRequest([user.id], [])
      setFriendStatus('sent')
    } catch { /* silent */ } finally {
      setAddingFriend(false)
    }
  }

  const handleAcceptFriend = async () => {
    if (!user?.id) return
    setAddingFriend(true)
    try {
      await sendFriendRequest([user.id], [])
      setFriendStatus('friends')
    } catch { /* silent */ } finally {
      setAddingFriend(false)
    }
  }

  const initial = (user?.username ?? username ?? '?')[0]!.toUpperCase()
  const isOwnProfile = isAuthenticated && user?.id === myUserId

  const openEdit = () => setSearchParams({ edit: '' })
  const closeEdit = () => {
    setSearchParams({})
    setReloadKey((k) => k + 1)
  }

  return (
    <div
      className="h-screen w-full flex font-mono overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #0a1a0a 0%, #050505 70%)' }}
    >
      <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto">
        <div className="w-full max-w-sm mx-auto px-4">
        <button
          onClick={() => navigate('/')}
          className="mb-6 text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1"
        >
          ← back to club
        </button>

        {loading ? (
          <p className="text-center text-white/30 text-sm py-8">loading…</p>
        ) : notFound ? (
          <div className="rounded-xl p-8 text-center" style={cardStyle}>
            <p className="text-white/50 text-sm mb-1">user not found</p>
            <p className="text-white/25 text-xs">@{username} doesn't exist</p>
          </div>
        ) : (
          <div className="rounded-xl p-6 flex flex-col gap-5" style={cardStyle}>
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.username ?? ''}
                  className="w-20 h-20 rounded-full object-cover"
                  style={{ border: '2px solid rgba(57,255,20,0.5)' }}
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
                  style={{
                    backgroundColor: 'rgba(57,255,20,0.1)',
                    border: '2px solid rgba(57,255,20,0.5)',
                    color: '#39ff14',
                    textShadow: '0 0 20px rgba(57,255,20,0.7)',
                  }}
                >
                  {initial}
                </div>
              )}
              <p className="text-white font-bold text-lg">{user?.username}</p>

              {/* Bio */}
              {metadata.bio && (
                <p className="text-white/60 text-xs text-center px-2 leading-relaxed">
                  {metadata.bio}
                </p>
              )}
            </div>

            {/* Favorite song */}
            {metadata.favorite_song && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ backgroundColor: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.12)' }}
              >
                <span className="text-white/30 text-[10px] shrink-0">fav song</span>
                <span className="text-white/60 text-xs font-mono truncate">{metadata.favorite_song}</span>
              </div>
            )}

            {/* Links */}
            {metadata.links && metadata.links.length > 0 && (
              <div className="flex flex-col gap-1">
                {metadata.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono truncate transition-colors"
                    style={{ color: 'rgba(57,255,20,0.7)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#39ff14' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(57,255,20,0.7)' }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}

            {/* Placeholder stats */}
            <div
              className="grid grid-cols-3 gap-2 rounded-lg p-3"
              style={{ backgroundColor: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.12)' }}
            >
              {[['visits', '—'], ['friends', '—'], ['rooms', '—']].map(([label, val]) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-white/30 text-[10px]">{label}</span>
                  <span className="text-white/50 text-sm font-bold">{val}</span>
                </div>
              ))}
            </div>

            {/* Action button */}
            {isOwnProfile ? (
              <button
                onClick={openEdit}
                className="w-full py-2.5 rounded-lg text-sm font-bold transition-all duration-200"
                style={{ backgroundColor: 'rgba(57,255,20,0.1)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.1)' }}
              >
                edit profile
              </button>
            ) : isAuthenticated ? (
              <button
                onClick={friendStatus === 'received' ? handleAcceptFriend : handleAddFriend}
                disabled={addingFriend || friendStatus === 'friends' || friendStatus === 'sent'}
                className="w-full py-2.5 rounded-lg text-sm font-bold transition-all duration-200"
                style={
                  friendStatus === 'friends'
                    ? { backgroundColor: 'rgba(57,255,20,0.1)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)', cursor: 'default' }
                    : friendStatus === 'sent'
                    ? { backgroundColor: 'rgba(57,255,20,0.05)', color: 'rgba(57,255,20,0.4)', border: '1px solid rgba(57,255,20,0.15)', cursor: 'default' }
                    : { backgroundColor: 'rgba(57,255,20,0.15)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.4)', cursor: 'pointer' }
                }
              >
                {addingFriend
                  ? 'sending…'
                  : friendStatus === 'friends'
                  ? '✓ friends'
                  : friendStatus === 'sent'
                  ? 'request sent'
                  : friendStatus === 'received'
                  ? 'accept request'
                  : 'add friend'}
              </button>
            ) : (
              <p className="text-center text-white/30 text-xs">log in to add friends</p>
            )}
          </div>
        )}

        </div>
      </div>

      {editOpen && <ProfileEditPanel onClose={closeEdit} />}
    </div>
  )
}
