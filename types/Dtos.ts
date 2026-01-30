export type PlaylistItemDto = {
  id: string

  djId: string

  title: string

  link: string | null

  duration: number

  visualUrl?: string | null

  trackMessage?: string | null
}
