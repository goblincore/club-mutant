import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NowPlaying } from '../NowPlaying'

const fixture = vi.hoisted(() => ({
  stream: {
    currentLink: 'https://youtu.be/same-video', currentTitle: 'test', currentTrackId: 'track',
    currentDjName: 'Alice', startTime: 1000, duration: 180, isPlaying: true, streamId: 7,
  },
  callbacks: [] as Array<{ onEnded: () => void }>,
  complete: vi.fn(),
  jukeboxComplete: vi.fn(),
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

describe('NowPlaying completion ownership', () => {
  beforeEach(() => {
    fixture.stream.streamId = 7
    fixture.stream.isPlaying = true
    fixture.callbacks.length = 0
    fixture.complete.mockClear()
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
})
