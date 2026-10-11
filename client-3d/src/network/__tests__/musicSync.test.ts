import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Message } from '@club-mutant/types/Messages'
import { TimeSync } from '../TimeSync'
import { wireMusicHandlers } from '../messages/musicHandlers'
import { wireLifecycleHandlers } from '../messages/lifecycleHandlers'
import { useMusicStore } from '../../stores/musicStore'

function makeRoom() {
  const handlers = new Map<number, (payload: any) => void>()
  const lifecycle: Record<string, (...args: any[]) => void> = {}
  const room = {
    state: { musicStream: null as any },
    send: vi.fn(),
    onMessage: vi.fn((type: number, cb: (payload: any) => void) => {
      handlers.set(type, cb)
      return () => handlers.delete(type)
    }),
    onStateChange: (cb: () => void) => { lifecycle.patch = cb },
    onDrop: (cb: () => void) => { lifecycle.drop = cb },
    onReconnect: (cb: () => void) => { lifecycle.reconnect = cb },
    onLeave: (cb: () => void) => { lifecycle.leave = cb },
  }
  return { room, handlers, lifecycle }
}

const stream = (id = 7) => ({
  status: 'playing', streamId: id, currentLink: 'https://youtu.be/test',
  currentTitle: 'test', currentTrackId: 'track-test', startTime: 100_000, duration: 180,
})

describe('authoritative playback recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    useMusicStore.getState().clearStream()
  })
  afterEach(() => vi.useRealTimers())

  it('repairs a missed Stop through a schema patch', () => {
    const { room, handlers, lifecycle } = makeRoom()
    wireMusicHandlers(room as any, null)
    handlers.get(Message.START_MUSIC_STREAM)!({ musicStream: stream(), offset: 3 })
    expect(useMusicStore.getState().stream.isPlaying).toBe(true)
    room.state.musicStream = { ...stream(), status: 'waiting', currentLink: null }
    lifecycle.patch()
    expect(useMusicStore.getState().stream.isPlaying).toBe(false)
  })

  it('repairs a missed Stop through a reconnect snapshot without a patch', () => {
    const { room, handlers } = makeRoom()
    wireMusicHandlers(room as any, null)
    handlers.get(Message.START_MUSIC_STREAM)!({ musicStream: stream(), offset: 3 })
    handlers.get(Message.MUSIC_STREAM_TICK)!({
      musicStream: { ...stream(), status: 'waiting', currentLink: null },
      streamId: 7, startTime: 100_000, serverNowMs: 105_000,
    })
    expect(useMusicStore.getState().stream.isPlaying).toBe(false)
  })

  it('uses server elapsed time before clock sync and tracks the actual playlist item', () => {
    const { room, handlers } = makeRoom()
    wireMusicHandlers(room as any, null)
    handlers.get(Message.MUSIC_STREAM_TICK)!({
      musicStream: stream(), streamId: 7, startTime: 100_000, serverNowMs: 105_000,
    })
    expect(useMusicStore.getState().stream.startTime).toBe(5000)
    expect(useMusicStore.getState().stream.currentTrackId).toBe('track-test')
  })

  it('does not roll back a newer START on an unrelated lagging schema patch', () => {
    const { room, handlers, lifecycle } = makeRoom()
    wireMusicHandlers(room as any, null)
    handlers.get(Message.START_MUSIC_STREAM)!({ musicStream: stream(8), offset: 2 })
    room.state.musicStream = { ...stream(7), status: 'waiting', currentLink: null }
    lifecycle.patch()
    expect(useMusicStore.getState().stream.streamId).toBe(8)
    expect(useMusicStore.getState().stream.isPlaying).toBe(true)
  })

  it('retains the Stop transition so older START and schema patches cannot resurrect audio', () => {
    const { room, handlers, lifecycle } = makeRoom()
    wireMusicHandlers(room as any, null)
    handlers.get(Message.START_MUSIC_STREAM)!({ musicStream: stream(7), offset: 2 })
    handlers.get(Message.STOP_MUSIC_STREAM)!({ streamId: 8 })
    handlers.get(Message.START_MUSIC_STREAM)!({ musicStream: stream(7), offset: 3 })
    room.state.musicStream = stream(7)
    lifecycle.patch()
    expect(useMusicStore.getState().stream.isPlaying).toBe(false)
    expect(useMusicStore.getState().stream.streamId).toBe(8)
    handlers.get(Message.START_MUSIC_STREAM)!({ musicStream: stream(9), offset: 0 })
    handlers.get(Message.STOP_MUSIC_STREAM)!({ streamId: 8 })
    expect(useMusicStore.getState().stream.isPlaying).toBe(true)
    expect(useMusicStore.getState().stream.streamId).toBe(9)
  })

  it('ignores a delayed tick for an earlier playback', () => {
    const { room, handlers } = makeRoom()
    wireMusicHandlers(room as any, null)
    handlers.get(Message.START_MUSIC_STREAM)!({ musicStream: stream(8), offset: 0 })
    handlers.get(Message.MUSIC_STREAM_TICK)!({
      musicStream: stream(7), streamId: 7, startTime: 100_000, serverNowMs: 105_000,
    })
    expect(useMusicStore.getState().stream.streamId).toBe(8)
  })
})

describe('TimeSync lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(10_000)
  })
  afterEach(() => vi.useRealTimers())

  it('starts once and cancels all probes, intervals and listeners on stop', () => {
    const { room, handlers } = makeRoom()
    const sync = new TimeSync(room as any)
    sync.start()
    sync.start()
    vi.advanceTimersByTime(800)
    expect(room.send).toHaveBeenCalledTimes(5)
    expect(room.onMessage).toHaveBeenCalledTimes(1)
    sync.stop()
    sync.stop()
    vi.advanceTimersByTime(60_000)
    expect(room.send).toHaveBeenCalledTimes(5)
    expect(handlers.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('discards previous clock samples on reconnect, even if new RTT is slower', () => {
    const { room, handlers } = makeRoom()
    const sync = new TimeSync(room as any)
    const answer = (rtt: number, offset: number) => {
      const sent = room.send.mock.lastCall![1].clientSentAtMs
      vi.advanceTimersByTime(rtt)
      handlers.get(Message.TIME_SYNC_RESPONSE)!({ clientSentAtMs: sent, serverNowMs: sent + rtt / 2 + offset })
    }
    sync.start()
    vi.advanceTimersByTime(0)
    answer(10, 100)
    expect(sync.offset).toBe(100)
    sync.stop()
    sync.start()
    expect(sync.ready).toBe(false)
    vi.advanceTimersByTime(0)
    answer(100, 3000)
    expect(sync.offset).toBeGreaterThan(2900)
    expect(sync.offset).toBeLessThan(3100)
    sync.stop()
  })

  it('ages out fast historical samples instead of pinning an old offset forever', () => {
    const { room, handlers } = makeRoom()
    const sync = new TimeSync(room as any)
    sync.start()
    vi.advanceTimersByTime(0)
    const first = room.send.mock.lastCall![1].clientSentAtMs
    vi.advanceTimersByTime(10)
    handlers.get(Message.TIME_SYNC_RESPONSE)!({ clientSentAtMs: first, serverNowMs: first + 5 + 100 })
    vi.advanceTimersByTime(60_000)
    const latest = room.send.mock.lastCall![1].clientSentAtMs
    vi.advanceTimersByTime(100)
    handlers.get(Message.TIME_SYNC_RESPONSE)!({ clientSentAtMs: latest, serverNowMs: latest + 50 + 3000 })
    expect(sync.offset).toBeGreaterThan(2900)
    expect(sync.offset).toBeLessThan(3100)
    sync.stop()
  })

  it('ages samples using monotonic time after a backward wall-clock change', () => {
    const { room, handlers } = makeRoom()
    const sync = new TimeSync(room as any)
    sync.start()
    vi.advanceTimersByTime(0)
    const first = room.send.mock.lastCall![1].clientSentAtMs
    vi.advanceTimersByTime(10)
    handlers.get(Message.TIME_SYNC_RESPONSE)!({ clientSentAtMs: first, serverNowMs: first + 5 + 100 })
    vi.setSystemTime(-100_000)
    vi.advanceTimersByTime(60_800)
    const latest = room.send.mock.lastCall![1].clientSentAtMs
    vi.advanceTimersByTime(100)
    const rtt = Date.now() - latest
    handlers.get(Message.TIME_SYNC_RESPONSE)!({ clientSentAtMs: latest, serverNowMs: latest + rtt / 2 + 3000 })
    expect(sync.offset).toBeGreaterThan(2900)
    sync.stop()
  })

  it('stops on drop and permanent leave, restarting once on reconnect', () => {
    const { room, lifecycle } = makeRoom()
    const sync = new TimeSync(room as any)
    const leave = vi.fn()
    wireLifecycleHandlers(room as any, sync, leave)
    sync.start()
    lifecycle.drop()
    expect(vi.getTimerCount()).toBe(0)
    lifecycle.reconnect()
    lifecycle.reconnect()
    vi.advanceTimersByTime(800)
    expect(room.send).toHaveBeenCalledTimes(5)
    lifecycle.leave()
    expect(leave).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
