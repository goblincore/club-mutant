import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { resyncPlayerTo, seekPlayerToOffset, seekTargetSeconds } from '../playerSeek'

// react-player's real Player class: it owns the "seek requested before the player was
// ready" queue (seekOnPlay) that caused the wrong-position start after Play/Skip.
// @ts-expect-error react-player ships no types for its internal lib/Player
const playerModule: any = await import('react-player/lib/Player')
const ReactPlayerInternal = playerModule.default?.default ?? playerModule.default

const DURATION = 296 // a 4:56 track

/** A react-player Player whose YouTube player is not ready yet, wired to a fake YT player. */
function newPlayer() {
  const yt = { seekTo: vi.fn(), getDuration: () => DURATION, setPlaybackRate: vi.fn() }
  const player: any = new ReactPlayerInternal({
    onStart: vi.fn(), onPlay: vi.fn(), onDuration: vi.fn(), playbackRate: 1,
  })
  player.player = yt
  player.isReady = false
  return { player, yt }
}

/** Simulate YouTube becoming ready and starting playback, which replays any queued seek. */
function startPlayback(player: any) {
  player.isReady = true
  player.handlePlay()
}

describe('seekTargetSeconds', () => {
  it.each([
    [0, 0], [0.0063, 0], [0.02, 0], [0.5, 0], [0.999, 0],
    [1, 1], [1.15, 1.15], [33.57, 33.57],
    [-3, 0], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0],
  ])('%s -> %s', (offset, expected) => {
    expect(seekTargetSeconds(offset)).toBe(expected)
  })

  it('never returns an amount react-player would read as a fraction', () => {
    for (let offset = -2; offset < 400; offset += 0.013) {
      const target = seekTargetSeconds(offset)
      expect(target === 0 || target >= 1).toBe(true)
    }
  })
})

describe('seeking a player that is still loading', () => {
  it('documents the hazard: react-player replays a queued sub-second seek as a fraction of the track', () => {
    const { player, yt } = newPlayer()
    player.seekTo(0.02, 'seconds') // what NowPlaying did on every stream start
    startPlayback(player)
    // 0.02 "seconds" became 2% of a 4:56 track: the wrong position, a few seconds into the song.
    expect(yt.seekTo).toHaveBeenCalledWith(DURATION * 0.02, undefined)
  })

  it.each([0.0063, 0.02, 0.4, 0.99])('a %ss start offset does not seek at all', (offset) => {
    const { player, yt } = newPlayer()
    seekPlayerToOffset(player, offset)
    startPlayback(player)
    expect(yt.seekTo).not.toHaveBeenCalled()
  })

  it.each([1, 2.5, 33.57])('a %ss late-join offset seeks to exactly that many seconds', (offset) => {
    const { player, yt } = newPlayer()
    seekPlayerToOffset(player, offset)
    startPlayback(player)
    expect(yt.seekTo).toHaveBeenCalledExactlyOnceWith(offset, undefined)
  })

  it('a pending seek can never land in the fraction range', () => {
    for (const offset of [0.001, 0.05, 0.3, 0.75, 0.999, 1, 4, 120]) {
      const { player, yt } = newPlayer()
      seekPlayerToOffset(player, offset)
      startPlayback(player)
      for (const [seconds] of yt.seekTo.mock.calls) expect(seconds).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('resyncing a running player', () => {
  it('seeks to the expected position in seconds', () => {
    const player = { seekTo: vi.fn() }
    resyncPlayerTo(player, 42.5)
    expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(42.5, 'seconds')
  })

  it('restarts from exactly 0 instead of a sub-second amount', () => {
    const player = { seekTo: vi.fn() }
    resyncPlayerTo(player, 0.4)
    expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(0, 'seconds')
  })
})

describe('call sites', () => {
  // Any direct player.seekTo(expr) bypasses the fraction guard above, which is how the
  // bug shipped. Keep seeks going through playerSeek.
  it.each(['../NowPlaying.tsx', '../IframeVideoBackground.tsx'])('%s only seeks through playerSeek', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    expect(source).toContain("from './playerSeek'")
    expect(source).not.toMatch(/\.seekTo\(/)
  })
})
