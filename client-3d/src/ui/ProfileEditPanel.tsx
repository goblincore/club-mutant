import { useState, useEffect } from 'react'
import {
  getMyAccount,
  updateAccountFields,
  updateProfileMetadata,
  type ProfileMetadata,
} from '../network/nakamaClient'
import { WearableEditor } from './WearableEditor'

interface ProfileEditPanelProps {
  onClose: () => void
}

const inputClass =
  'w-full bg-transparent text-xs font-mono py-2 px-3 rounded-lg border placeholder-white/25 focus:outline-none transition-colors'
const inputStyle = {
  borderColor: 'rgba(57,255,20,0.3)',
  color: 'white',
}
const inputFocusStyle = { borderColor: 'rgba(57,255,20,0.6)' }
const labelClass = 'text-white/30 text-[10px] uppercase tracking-wider'

export function ProfileEditPanel({ onClose }: ProfileEditPanelProps) {
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bio, setBio] = useState('')
  const [favoriteSong, setFavoriteSong] = useState('')
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([])
  const [backgroundUrl, setBackgroundUrl] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showWearables, setShowWearables] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSuccess(false)

    async function load() {
      try {
        const account = await getMyAccount()
        if (cancelled) return

        setAvatarUrl(account.user?.avatar_url ?? '')

        let metadata: ProfileMetadata = {}
        if (account.user?.metadata) {
          metadata =
            typeof account.user.metadata === 'string'
              ? JSON.parse(account.user.metadata)
              : (account.user.metadata as ProfileMetadata)
        }

        setBio(metadata.bio ?? '')
        setFavoriteSong(metadata.favorite_song ?? '')
        setLinks(metadata.links ?? [])
        setBackgroundUrl(metadata.background_url ?? '')
      } catch {
        if (!cancelled) setError('Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const trimmedAvatar = avatarUrl.trim()
      if (trimmedAvatar) {
        await updateAccountFields({ avatar_url: trimmedAvatar })
      }
      await updateProfileMetadata({
        bio: bio.trim(),
        favorite_song: favoriteSong.trim(),
        links: links.filter((l) => l.label.trim() && l.url.trim()),
        background_url: backgroundUrl.trim(),
      })
      setSuccess(true)
      setTimeout(onClose, 600)
    } catch (err: any) {
      let msg = 'Failed to save profile'
      if (err instanceof Response) {
        try {
          const text = await err.text()
          try {
            const json = JSON.parse(text)
            msg = json.message ?? text
          } catch { msg = text }
        } catch { msg = `Server error (${err.status})` }
      } else if (err?.message) {
        msg = err.message
      }
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const addLink = () => {
    if (links.length < 3) setLinks([...links, { label: '', url: '' }])
  }
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i))
  const updateLink = (i: number, field: 'label' | 'url', value: string) => {
    setLinks(links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }

  if (showWearables) {
    return <WearableEditor onClose={() => setShowWearables(false)} />
  }

  return (
    <div
      className="w-80 h-full shrink-0 overflow-y-auto border-l font-mono flex flex-col gap-4 p-5"
      style={{
        backgroundColor: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(16px)',
        borderColor: 'rgba(57,255,20,0.3)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-white/70 text-xs font-bold uppercase tracking-wider">
          edit profile
        </span>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white text-base transition-colors"
        >
          x
        </button>
      </div>

      {loading ? (
        <p className="text-white/25 text-xs text-center py-4">loading...</p>
      ) : (
        <>
          {/* Avatar URL */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>avatar url</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
              style={inputStyle}
              onFocus={(e) =>
                Object.assign(e.currentTarget.style, inputFocusStyle)
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: inputStyle.borderColor,
                })
              }
            />
            {avatarUrl.trim() && (
              <img
                src={avatarUrl.trim()}
                alt="preview"
                className="w-12 h-12 rounded-full object-cover mt-1 self-center"
                style={{ border: '1px solid rgba(57,255,20,0.3)' }}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
          </div>

          {/* Bio */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <label className={labelClass}>bio</label>
              <span className="text-white/20 text-[10px]">
                {bio.length}/200
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 200))}
              placeholder="tell us about yourself..."
              rows={3}
              className={inputClass + ' resize-none'}
              style={inputStyle}
              onFocus={(e) =>
                Object.assign(e.currentTarget.style, inputFocusStyle)
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: inputStyle.borderColor,
                })
              }
            />
          </div>

          {/* Favorite Song */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>favorite song</label>
            <input
              type="text"
              value={favoriteSong}
              onChange={(e) => setFavoriteSong(e.target.value.slice(0, 100))}
              placeholder="artist - track name"
              maxLength={100}
              className={inputClass}
              style={inputStyle}
              onFocus={(e) =>
                Object.assign(e.currentTarget.style, inputFocusStyle)
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: inputStyle.borderColor,
                })
              }
            />
          </div>

          {/* Links */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className={labelClass}>links</label>
              {links.length < 3 && (
                <button
                  onClick={addLink}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    color: '#39ff14',
                    border: '1px solid rgba(57,255,20,0.3)',
                    backgroundColor: 'rgba(57,255,20,0.06)',
                  }}
                >
                  + add
                </button>
              )}
            </div>
            {links.map((link, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  placeholder="label"
                  maxLength={30}
                  className={inputClass + ' flex-[1]'}
                  style={inputStyle}
                  onFocus={(e) =>
                    Object.assign(e.currentTarget.style, inputFocusStyle)
                  }
                  onBlur={(e) =>
                    Object.assign(e.currentTarget.style, {
                      borderColor: inputStyle.borderColor,
                    })
                  }
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder="https://..."
                  className={inputClass + ' flex-[2]'}
                  style={inputStyle}
                  onFocus={(e) =>
                    Object.assign(e.currentTarget.style, inputFocusStyle)
                  }
                  onBlur={(e) =>
                    Object.assign(e.currentTarget.style, {
                      borderColor: inputStyle.borderColor,
                    })
                  }
                />
                <button
                  onClick={() => removeLink(i)}
                  className="text-[10px] text-white/20 hover:text-red-400/60 transition-colors shrink-0"
                >
                  x
                </button>
              </div>
            ))}
            {links.length === 0 && (
              <p className="text-white/15 text-[10px] italic">
                no links added
              </p>
            )}
          </div>

          {/* Background URL */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>profile background url</label>
            <input
              type="url"
              value={backgroundUrl}
              onChange={(e) => setBackgroundUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
              style={inputStyle}
              onFocus={(e) =>
                Object.assign(e.currentTarget.style, inputFocusStyle)
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: inputStyle.borderColor,
                })
              }
            />
          </div>

          {/* Wearables */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>character</label>
            <button
              onClick={() => setShowWearables(true)}
              className="w-full py-2 rounded-lg text-xs font-mono border transition-all duration-200"
              style={{
                borderColor: 'rgba(57,255,20,0.3)',
                color: 'rgba(57,255,20,0.8)',
                backgroundColor: 'rgba(57,255,20,0.06)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.06)'
              }}
            >
              customize wearables
            </button>
          </div>

          {/* Error / Success */}
          {error && (
            <p
              className="text-xs font-mono text-center"
              style={{ color: '#ff0080' }}
            >
              {error}
            </p>
          )}
          {success && (
            <p
              className="text-xs font-mono text-center"
              style={{ color: '#39ff14' }}
            >
              saved!
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-mono border transition-colors"
              style={{
                borderColor: 'rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-xs font-mono font-bold border transition-all duration-200"
              style={{
                borderColor: 'rgba(57,255,20,0.4)',
                color: '#39ff14',
                backgroundColor: 'rgba(57,255,20,0.12)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  'rgba(57,255,20,0.25)'
                e.currentTarget.style.boxShadow =
                  '0 0 15px rgba(57,255,20,0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  'rgba(57,255,20,0.12)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {saving ? 'saving...' : 'save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
