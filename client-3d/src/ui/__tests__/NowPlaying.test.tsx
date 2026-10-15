import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NowPlaying } from '../NowPlaying'

const fixture = vi.hoisted(() => ({
  stream: {
    currentLink: 'https://youtu.be/same-video', currentTitle: 'test', currentTrackId: 'track',
    currentDjName: 'Alice', startTime: 1000, duration: 180, isPlaying: true, streamId: 7,
  },
  callbacks: [] as Array<{ onEnded: () => void; volume: number }>,
  complete: vi.fn(),
  jukeboxComplete: vi.fn(),
  settings: { muted: false, musicVolume: 0.5, setMusicVolume: vi.fn() },
}))

vi.mock('react-player/youtube', async () => {
  const { forwardRef } = await import('react')
  return { default: forwardRef((props: any, _ref) => {
    fixture.callbacks.push(props)
    return null
  }) }
})
vi.mock('../../network/NetworkManager', () => ({
  getNetwork: () => ({ djTurnComplete: fixture.complete, jukeboxTrackComplete: fixture.jukeboxComplete }),
}))
vi.mock('../../stores/musicStore', () => ({
  useMusicStore: Object.assign((selector: any) => selector({ stream: fixture.stream }), {
    getState: () => ({ stream: fixture.stream }),
  }),
}))
vi.mock('../../stores/boothStore', () => ({
  useBoothStore: (selector: any) => selector({
    videoBackgroundEnabled: false, toggleVideoBackground: vi.fn(),
    currentDjSessionId: 'A', djQueue: [], isInQueue: true,
  }),
}))
vi.mock('../../stores/gameStore', () => ({
  useGameStore: (selector: any) => selector({ mySessionId: 'A', musicMode: 'djqueue' }),
}))
vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: any) => selector(fixture.settings),
}))

describe('NowPlaying completion ownership', () => {
  beforeEach(() => {
    fixture.stream.streamId = 7
    fixture.stream.isPlaying = true
    fixture.callbacks.length = 0
    fixture.complete.mockClear()
    Object.assign(fixture.settings, { muted: false, musicVolume: 0.5 })
  })

  it('a delayed callback from an old same-URL playback cannot complete its successor', () => {
    renderToStaticMarkup(<NowPlaying />)
    const oldEnded = fixture.callbacks[0].onEnded
    fixture.stream = { ...fixture.stream, streamId: 8 }
    renderToStaticMarkup(<NowPlaying />)
    oldEnded()
    expect(fixture.complete).not.toHaveBeenCalled()
    fixture.callbacks[1].onEnded()
    fixture.callbacks[1].onEnded()
    expect(fixture.complete).toHaveBeenCalledExactlyOnceWith(8)
  })

  it('does not report the ended callback after playback has stopped', () => {
    renderToStaticMarkup(<NowPlaying />)
    fixture.stream = { ...fixture.stream, isPlaying: false }
    fixture.callbacks[0].onEnded()
    expect(fixture.complete).not.toHaveBeenCalled()
  })

  it('applies the local volume setting while keeping mute authoritative', () => {
    fixture.settings.musicVolume = 0.8
    renderToStaticMarkup(<NowPlaying />)
    expect(fixture.callbacks[fixture.callbacks.length - 1]?.volume).toBe(0.8)

    fixture.settings.muted = true
    fixture.settings.musicVolume = 0.3
    renderToStaticMarkup(<NowPlaying />)
    expect(fixture.callbacks[fixture.callbacks.length - 1]?.volume).toBe(0)

    fixture.settings.muted = false
    renderToStaticMarkup(<NowPlaying />)
    expect(fixture.callbacks[fixture.callbacks.length - 1]?.volume).toBe(0.3)
  })
})
