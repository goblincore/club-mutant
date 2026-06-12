// Audio track loading via the YouTube proxy service.
// Exposed as a pure async function so DreamAudioPlayer doesn't have to
// carry the fetch/lifecycle boilerplate.

const YOUTUBE_API_BASE =
  import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8081'
    : `${window.location.origin}/youtube`)

/** Load a YouTube track as an HTMLAudioElement streamed through the proxy. */
export function loadAudioTrack(videoId: string, signal: AbortSignal): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'))
      return
    }

    const audio = document.createElement('audio')
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.src = `${YOUTUBE_API_BASE}/proxy/${videoId}?audioOnly=true`

    const cleanup = () => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
    }

    const onCanPlay = () => {
      cleanup()
      clearTimeout(timeout)
      resolve(audio)
    }

    const onError = () => {
      cleanup()
      clearTimeout(timeout)
      reject(new Error(`Audio load failed: ${audio.error?.message ?? 'unknown'}`))
    }

    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('error', onError)

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Audio load timeout'))
    }, 15_000)

    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      cleanup()
      audio.pause()
      audio.src = ''
      reject(new Error('Aborted'))
    })

    audio.load()
  })
}

/** Seek the audio element to a random position in the middle 65% of the track. */
export function seekToRandomPosition(audio: HTMLAudioElement): void {
  const trySeek = () => {
    if (audio.duration && isFinite(audio.duration) && audio.duration > 20) {
      // Seek to 5%-70% of the track (avoid intros and outros)
      const minPos = audio.duration * 0.05
      const maxPos = audio.duration * 0.7
      audio.currentTime = minPos + Math.random() * (maxPos - minPos)
      console.log(`[DreamAudio] Seeked to ${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(1)}s`)
      return true
    }
    return false
  }

  // Try immediately
  if (trySeek()) return

  // If duration not available, wait for metadata or durationchange
  const onDuration = () => {
    audio.removeEventListener('durationchange', onDuration)
    audio.removeEventListener('loadedmetadata', onDuration)
    // Small delay to ensure the seek is accepted
    setTimeout(() => trySeek(), 100)
  }
  audio.addEventListener('durationchange', onDuration)
  audio.addEventListener('loadedmetadata', onDuration)

  // Fallback: try again after 2 seconds
  setTimeout(() => {
    audio.removeEventListener('durationchange', onDuration)
    audio.removeEventListener('loadedmetadata', onDuration)
    trySeek()
  }, 2000)
}
