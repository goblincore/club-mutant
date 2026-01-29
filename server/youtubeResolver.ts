import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type YoutubeResolvedUrl = {
  videoId: string
  url: string
  expiresAtMs: number | null
  resolvedAtMs: number
}

type CacheEntry = YoutubeResolvedUrl

type ResolverOptions = {
  ytDlpPath?: string
  cacheTtlMs?: number
  refreshSkewMs?: number
  execTimeoutMs?: number
}

const isValidYoutubeVideoId = (videoId: string): boolean => {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId)
}

const parseExpiresAtMsFromUrl = (url: string): number | null => {
  try {
    const parsed = new URL(url)
    const expire = parsed.searchParams.get('expire')
    if (!expire) return null

    const seconds = Number(expire)
    if (!Number.isFinite(seconds)) return null

    return seconds * 1000
  } catch {
    return null
  }
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<YoutubeResolvedUrl>>()

const getCacheTtlMs = (entry: CacheEntry, options: Required<ResolverOptions>): number => {
  if (entry.expiresAtMs === null) {
    return options.cacheTtlMs
  }

  const validUntilMs = entry.expiresAtMs - options.refreshSkewMs
  const ttl = validUntilMs - entry.resolvedAtMs

  return Math.max(0, Math.min(options.cacheTtlMs, ttl))
}

const resolveWithYtDlp = async (
  videoId: string,
  options: Required<ResolverOptions>
): Promise<YoutubeResolvedUrl> => {
  const ytDlpPath = options.ytDlpPath

  const url = `https://www.youtube.com/watch?v=${videoId}`

  const args = [
    url,
    '-f',
    'worst[ext=mp4][height<=360]/worst[ext=mp4]/worst',
    '-g',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
  ]

  const { stdout } = await execFileAsync(ytDlpPath, args, {
    timeout: options.execTimeoutMs,
    maxBuffer: 1024 * 1024,
  })

  const resolvedUrl = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0]

  if (!resolvedUrl) {
    throw new Error('yt-dlp returned empty url')
  }

  const resolvedAtMs = Date.now()

  return {
    videoId,
    url: resolvedUrl,
    expiresAtMs: parseExpiresAtMsFromUrl(resolvedUrl),
    resolvedAtMs,
  }
}

export const resolveYoutubeVideoUrl = async (
  videoId: string,
  options: ResolverOptions = {}
): Promise<YoutubeResolvedUrl> => {
  if (!isValidYoutubeVideoId(videoId)) {
    throw new Error('invalid videoId')
  }

  const resolvedOptions: Required<ResolverOptions> = {
    ytDlpPath: options.ytDlpPath ?? process.env.YT_DLP_PATH ?? 'yt-dlp',
    cacheTtlMs: options.cacheTtlMs ?? 60_000,
    refreshSkewMs: options.refreshSkewMs ?? 60_000,
    execTimeoutMs: options.execTimeoutMs ?? 20_000,
  }

  const cached = cache.get(videoId)
  if (cached) {
    const ttlMs = getCacheTtlMs(cached, resolvedOptions)
    const ageMs = Date.now() - cached.resolvedAtMs

    if (ageMs >= 0 && ageMs < ttlMs) {
      return cached
    }

    cache.delete(videoId)
  }

  const existingInflight = inflight.get(videoId)
  if (existingInflight) {
    return existingInflight
  }

  const promise = resolveWithYtDlp(videoId, resolvedOptions)
    .then((resolved) => {
      cache.set(videoId, resolved)
      return resolved
    })
    .finally(() => {
      inflight.delete(videoId)
    })

  inflight.set(videoId, promise)

  return promise
}
