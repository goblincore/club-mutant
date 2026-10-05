import type { PlaylistTrack } from '../types'

export interface TubeVideo {
  id: string
  title: string
  thumbnail?: string
  channel?: string
  duration?: string
  viewCount?: number
}

export const TUBE_CATEGORIES = [
  { id: 'music', label: 'Music', icon: '♫', terms: ['music video 1994', 'live performance 1996', 'indie music video'] },
  { id: 'home-videos', label: 'Home videos', icon: '⌂', terms: ['home video 1990', 'family VHS 1995', 'amateur recording 1998'] },
  { id: 'animation', label: 'Animation', icon: '☆', terms: ['rare 90s cartoon pilot', 'student animation short', 'stop motion animation'] },
  { id: 'comedy', label: 'Comedy', icon: '☺', terms: ['comedy sketch 1990s', 'funny home video', 'stand up 1995'] },
  { id: 'tv', label: 'TV & public access', icon: '▣', terms: ['obscure public access show 1998', '90s TV show', 'community TV'] },
  { id: 'vintage', label: 'Vintage finds', icon: '◷', terms: ['1996 local TV commercial', 'vintage footage', 'old computer demo'] },
  { id: 'oddities', label: 'Little oddities', icon: '✿', terms: ['weird internet video 2002', 'unusual hobby', 'strange music video 1994'] },
]
export const DISCOVERY_TERMS = TUBE_CATEGORIES.flatMap((category) => category.terms)
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/

export function pickRandom<T>(items: readonly T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!)
  }
  return picked
}

export function normalizeVideos(items: unknown): TubeVideo[] {
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const id = item.id ?? item.videoId
    if (typeof id !== 'string' || !VIDEO_ID.test(id) || seen.has(id)) return []
    seen.add(id)
    return [{
      id,
      title: typeof item.title === 'string' ? item.title : 'Untitled video',
      thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : undefined,
      channel: typeof item.channelTitle === 'string' ? item.channelTitle : undefined,
      duration: typeof item.duration === 'string' ? item.duration : undefined,
      viewCount: typeof item.viewCount === 'number' && Number.isFinite(item.viewCount) && item.viewCount >= 0 ? item.viewCount : undefined,
    }]
  })
}

/** Unknown counts cannot qualify as undiscovered, and 100 is excluded. */
export function selectTinyVideos(videos: TubeVideo[], under100: boolean): TubeVideo[] {
  if (!under100) return videos
  return videos.filter((video) => video.viewCount !== undefined && video.viewCount < 100)
    .sort((a, b) => a.viewCount! - b.viewCount!)
}

export interface DailyFeature { date: string; checkedAt: string; video: TubeVideo }

export function normalizeDailyFeature(value: unknown, now = Date.now()): DailyFeature | null {
  if (!value || typeof value !== 'object') return null
  const data = value as { date?: unknown; checkedAt?: unknown; video?: unknown }
  if (data.date !== new Date(now).toISOString().slice(0, 10) || typeof data.checkedAt !== 'string') return null
  const checked = Date.parse(data.checkedAt)
  if (!Number.isFinite(checked) || checked > now + 30_000 || now - checked > 120_000) return null
  const video = selectTinyVideos(normalizeVideos([data.video]), true)[0]
  return video ? { date: data.date as string, checkedAt: data.checkedAt, video } : null
}

export function extractPlaylistId(input: string): string | null {
  const value = input.trim()
  const valid = (id: string) => /^[A-Za-z0-9_-]{10,64}$/.test(id) && id.length !== 11 && !id.startsWith('RD')
  if (valid(value)) return value
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname)) return null
    const id = url.searchParams.get('list')
    return id && valid(id) ? id : null
  } catch {
    return null
  }
}

export function videoFromTrack(track: PlaylistTrack): TubeVideo | null {
  let id = track.id
  try {
    const url = new URL(track.link)
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
      id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ?? id
    } else if (url.hostname === 'youtu.be') {
      id = url.pathname.slice(1)
    }
  } catch { /* Older tracks sometimes store the video ID directly. */ }
  if (!VIDEO_ID.test(id)) return null
  return { id, title: track.title, thumbnail: track.thumbnail }
}

export function durationSeconds(value?: string): number {
  if (!value || !/^\d+(?::\d+){1,2}$/.test(value)) return 0
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

export async function tubeRequest(baseUrl: string | undefined, path: string, signal?: AbortSignal): Promise<unknown> {
  if (!baseUrl) throw new Error('Video browsing is unavailable. The YouTube service is not configured.')
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 30_000)
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { signal: controller.signal })
    if (response.status === 404) throw new Error('Playlist not found. Check that it is public.')
    if (response.status === 400) throw new Error('This playlist cannot be imported. Try a public YouTube playlist.')
    if (!response.ok) throw new Error('The video service is having trouble. Please try again in a moment.')
    return await response.json()
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The video service took too long to respond. Please try again.')
    if (error instanceof TypeError) throw new Error('Could not reach the video service. Check your connection and try again.')
    if (error instanceof SyntaxError) throw new Error('The video service returned an unexpected response. Please try again.')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
