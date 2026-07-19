import { useEffect, useMemo } from 'react'
import { KonpyuuTADesktop } from '@club-mutant/konpyuuta'
import { KonpyuuTAProvider } from '@club-mutant/konpyuuta/context'
import type {
  PlaylistService,
  SocialService,
  MessengerService,
  PlaylistTrack,
  UserProfile,
} from '../../../../packages/konpyuuta/src/types'
import { usePanelStore } from '../../stores/panelStore'
import { usePlaylistStore } from '../../stores/playlistStore'
import { useAuthStore } from '../../stores/authStore'
import {
  getUserProfile,
  getMyAccount,
  getWallPosts,
  createWallPost,
  deleteWallPost,
  listFriends,
} from '../../network/nakamaClient'
import { createMessengerService } from '../../services/messengerService'
import '../../../../packages/konpyuuta/src/styles/cde.css'

export function KonpyuuTAShell() {
  const osActive = usePanelStore((s) => s.osActive)

  const playlistService = useMemo<PlaylistService>(() => {
    const store = usePlaylistStore.getState
    return {
      getPlaylists: () => store().playlists,
      createPlaylist: (name: string) => store().createPlaylist(name),
      importPlaylist: (name: string, tracks: PlaylistTrack[]) =>
        store().importPlaylist(name, tracks),
      removePlaylist: (id: string) => store().removePlaylist(id),
      addTrack: (playlistId: string, track: PlaylistTrack) => store().addTrack(playlistId, track),
      removeTrack: (playlistId: string, trackId: string) =>
        store().removeTrack(playlistId, trackId),
      ensureItemsLoaded: (playlistId: string) => store().ensureItemsLoaded(playlistId),
      loadFromServer: () => store().loadFromServer(),
    }
  }, [])

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
      listFriends: async () => {
        const friends = await listFriends(0)
        return friends.map((f) => {
          const u = f.user!
          return {
            userId: u.id ?? '',
            username: u.username ?? '',
            displayName: u.display_name ?? '',
            online: u.online ?? false,
          }
        })
      },
    }
  }, [])

  const messengerService = useMemo<MessengerService>(() => createMessengerService(), [])

  // Connect/disconnect messenger service lifecycle
  useEffect(() => {
    messengerService.connect()
    return () => messengerService.disconnect()
  }, [messengerService])

  if (!osActive) return null

  return (
    <KonpyuuTAProvider
      playlistService={playlistService}
      socialService={socialService}
      messengerService={messengerService}
      env={{
        youtubeApiUrl:
          import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
          (window.location.hostname === 'localhost'
            ? 'http://localhost:8081'
            : `${window.location.origin}/youtube`),
      }}
    >
      <KonpyuuTADesktop onShutdown={() => usePanelStore.getState().setOsActive(false)} />
    </KonpyuuTAProvider>
  )
}
