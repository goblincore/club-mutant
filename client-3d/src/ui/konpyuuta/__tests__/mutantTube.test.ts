import { describe, expect, it, vi, afterEach } from 'vitest'
import { extractPlaylistId, videoFromTrack, normalizeVideos, durationSeconds, tubeRequest, selectTinyVideos, normalizeDailyFeature } from '../../../../../packages/konpyuuta/src/lib/mutantTube'

afterEach(() => vi.unstubAllGlobals())

describe('MutantTube video and playlist data', () => {
  it('accepts public YouTube playlist links and IDs, rejecting mixes and unrelated URLs', () => {
    const id = 'PL1234567890abcdefgh'
    for (const input of [id, `youtube.com/playlist?list=${id}`, `https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=${id}`]) {
      expect(extractPlaylistId(input)).toBe(id)
    }
    for (const input of ['RD1234567890abc', 'WL', 'LL', 'dQw4w9WgXcQ', 'https://evil.example/playlist?list=' + id, '']) {
      expect(extractPlaylistId(input)).toBeNull()
    }
  })

  it('resolves saved tracks whose local ID differs from their YouTube ID', () => {
    for (const link of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ']) {
      expect(videoFromTrack({ id: 'local-track-uuid', title: 'VHS', duration: 0, link })?.id).toBe('dQw4w9WgXcQ')
    }
    expect(videoFromTrack({ id: 'local-track-uuid', title: 'Bad link', duration: 0, link: 'broken' })).toBeNull()
  })

  it('deduplicates API results and preserves duration/channel metadata', () => {
    expect(normalizeVideos([null, { id: 'invalid-id' }, { id: 'dQw4w9WgXcQ', title: 'VHS', channelTitle: 'Tiny channel', duration: '3:10', viewCount: 0 }, { videoId: 'dQw4w9WgXcQ', title: 'Duplicate' }])).toEqual([
      { id: 'dQw4w9WgXcQ', title: 'VHS', channel: 'Tiny channel', duration: '3:10', viewCount: 0, thumbnail: undefined },
    ])
    expect(normalizeVideos({ items: 'bad' })).toEqual([])
    expect(durationSeconds('1:02:03')).toBe(3723)
    expect(durationSeconds('LIVE')).toBe(0)
  })

  it('passes cancellation to fetch and reports HTTP errors', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async (_url, options) => {
      expect(options.signal).toBeInstanceOf(AbortSignal)
      return { ok: false, status: 404 }
    })
    vi.stubGlobal('fetch', fetch)
    await expect(tubeRequest('https://tube.example/', '/playlist/abc', controller.signal)).rejects.toThrow('Playlist not found')
    expect(fetch.mock.calls[0][0]).toBe('https://tube.example/playlist/abc')
  })
})


describe('TinyTubes low-view discovery', () => {
  it('excludes 100+, unknown and non-finite counts while keeping true zero-view videos', () => {
    const videos = normalizeVideos([
      { id: 'AAAAAAAAAAA', viewCount: 1000000 },
      { id: 'BBBBBBBBBBB', viewCount: 99 },
      { id: 'CCCCCCCCCCC', viewCount: 100 },
      { id: 'DDDDDDDDDDD' },
      { id: 'EEEEEEEEEEE', viewCount: 0 },
      { id: 'FFFFFFFFFFF', viewCount: Infinity },
    ])
    expect(selectTinyVideos(videos, true).map((v) => v.id)).toEqual(['EEEEEEEEEEE', 'BBBBBBBBBBB'])
    expect(selectTinyVideos(videos, false)).toEqual(videos)
  })
})


describe('daily featured video eligibility', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  const data = { date: '2026-10-05', checkedAt: '2026-10-05T12:00:00Z', video: { id: 'AAAAAAAAAAA', title: 'A little tape', viewCount: 99 } }
  it('accepts today’s freshly checked 0–99 view pick', () => {
    expect(normalizeDailyFeature(data, now)?.video.viewCount).toBe(99)
    expect(normalizeDailyFeature({ ...data, video: { ...data.video, viewCount: 0 } }, now)?.video.viewCount).toBe(0)
  })
  it('rejects popular, unknown, yesterday’s, and stale unverified picks', () => {
    for (const video of [{ ...data.video, viewCount: 100 }, { id: 'AAAAAAAAAAA' }, { ...data.video, viewCount: Infinity }]) {
      expect(normalizeDailyFeature({ ...data, video }, now)).toBeNull()
    }
    expect(normalizeDailyFeature({ ...data, date: '2026-10-04' }, now)).toBeNull()
    expect(normalizeDailyFeature({ ...data, checkedAt: '2026-10-05T11:55:00Z' }, now)).toBeNull()
    expect(normalizeDailyFeature({ ...data, checkedAt: 'bad date' }, now)).toBeNull()
  })
})
