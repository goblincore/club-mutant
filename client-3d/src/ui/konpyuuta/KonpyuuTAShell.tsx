import { useEffect, useMemo } from 'react'
import { KonpyuuTADesktop } from '@club-mutant/konpyuuta'
import { KonpyuuTAProvider } from '@club-mutant/konpyuuta/context'
import type {
  SocialService,
  MessengerService,
  UserProfile,
} from '../../../../packages/konpyuuta/src/types'
import { usePanelStore } from '../../stores/panelStore'
import { createPlaylistService } from './playlistService'
import { usePresenceStore } from '../../stores/presenceStore'
import { useMessengerStore } from '../../../../packages/konpyuuta/src/stores/messengerStore'
import { useAuthStore } from '../../stores/authStore'
import {
  getUserProfile,
  getMyAccount,
  getWallPosts,
  createWallPost,
  deleteWallPost,
  listFriends,
  followFriends,
  onSocketChange,
} from '../../network/nakamaClient'
import { createMailService } from '../../services/mailService'
import { createMessengerService } from '../../services/messengerService'
import '../../../../packages/konpyuuta/src/styles/cde.css'

export function KonpyuuTAShell() {
  const userId = useAuthStore((s) => s.userId)
  const username = useAuthStore((s) => s.username)
  const osActive = usePanelStore((s) => s.osActive)

  const playlistService = useMemo(createPlaylistService, [])

  const socialService = useMemo<SocialService>(() => {
    const authStore = useAuthStore.getState
    return {
      getCurrentUserId: () => authStore().userId,
      getCurrentUsername: () => authStore().username,
      getUserProfile: async (userId: string): Promise<UserProfile> => {
        const profile = await getUserProfile(userId)
        return profile
      },
      getMyAccount: async (): Promise<UserProfile> => {
        const account = await getMyAccount()
        const user = account.user!
        return {
          user_id: user.id ?? '',
          username: user.username ?? '',
          display_name: user.display_name ?? '',
          avatar_url: user.avatar_url ?? '',
          metadata: (user.metadata ?? {}) as Record<string, unknown>,
        }
      },
      getWallPosts: (targetUserId: string, cursor?: string) => getWallPosts(targetUserId, cursor),
      createWallPost: (targetUserId: string, content: string) =>
        createWallPost(targetUserId, content),
      deleteWallPost: (postId: string, targetUserId: string) =>
        deleteWallPost(postId, targetUserId),
      onPresenceChanged: (callback) => usePresenceStore.subscribe((state) => callback([...state.onlineUserIds])),
      listFriends: async () => {
        const friends = await listFriends(0)
        await followFriends(friends.flatMap((f) => f.user?.id ? [f.user.id] : []))
        return friends.map((f) => {
          const u = f.user!
          return {
            userId: u.id ?? '',
            username: u.username ?? '',
            displayName: u.display_name ?? '',
            online: usePresenceStore.getState().onlineUserIds.has(u.id ?? '') || (u.online ?? false),
          }
        })
      },
    }
  }, [])

  const mailService = useMemo(createMailService, [])
  const messengerService = useMemo<MessengerService>(() => createMessengerService(), [])

  // Connect/disconnect messenger service lifecycle
  useEffect(() => {
    useMessengerStore.getState().resetForUser(userId)
    if (!userId) return
    messengerService.connect()
    const unsubscribe = onSocketChange((socket) => {
      if (socket) listFriends(0).then((friends) => followFriends(friends.flatMap((f) => f.user?.id ? [f.user.id] : []))).catch(() => {})
    })
    return () => { unsubscribe(); messengerService.disconnect() }
  }, [messengerService, userId])

  if (!osActive) return null

  return (
    <KonpyuuTAProvider
      username={username}
      userId={userId}
      playlistService={playlistService}
      socialService={socialService}
      messengerService={messengerService}
      mailService={mailService}
      env={{
        youtubeApiUrl:
          import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
          (['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname)
            ? 'http://localhost:8081'
            : 'https://yt.mutante.club'),
      }}
    >
      <KonpyuuTADesktop onShutdown={() => usePanelStore.getState().setOsActive(false)} />
    </KonpyuuTAProvider>
  )
}
