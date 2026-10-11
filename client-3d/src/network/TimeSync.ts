import { Message } from '@club-mutant/types/Messages'
import type { Room } from '@colyseus/sdk'

/**
 * Estimates the clock offset between client and server using
 * TIME_SYNC_REQUEST / TIME_SYNC_RESPONSE round-trips.
 *
 * offset = serverNow - clientNow  (positive means server is ahead)
 *
 * Usage:
 *   const sync = new TimeSync(room)
 *   sync.start()           // kicks off periodic sync probes
 *   sync.serverNow()       // returns estimated server time
 *   sync.toServerTime(t)   // converts client timestamp to server time
 *   sync.toClientTime(t)   // converts server timestamp to client time
 *   sync.stop()
 */

const PROBE_COUNT = 5
const PROBE_INTERVAL_MS = 200
const PERIODIC_INTERVAL_MS = 30_000

interface SyncSample {
  offset: number
  rtt: number
  receivedAtMonotonic: number
}

export class TimeSync {
  private room: Room
  private samples: SyncSample[] = []
  private _offset = 0
  private _rtt = 0
  private _ready = false
  private periodicTimer: ReturnType<typeof setInterval> | null = null
  private disposeListener: (() => void) | null = null
  private burstTimers = new Set<ReturnType<typeof setTimeout>>()
  private pendingProbes = new Map<number, number>()
  private handleResume = () => {
    if (document.visibilityState === 'visible') {
      this.samples = []
      this._ready = false
      this.pendingProbes.clear()
      this.runBurst()
    }
  }
  private _onReadyCallbacks: (() => void)[] = []

  constructor(room: Room) {
    this.room = room
  }

  get offset(): number {
    return this._offset
  }

  get rtt(): number {
    return this._rtt
  }

  get ready(): boolean {
    return this._ready
  }

  /** Estimated current server time in ms. */
  serverNow(): number {
    return Date.now() + this._offset
  }

  /** Convert a server timestamp to client time. */
  toClientTime(serverMs: number): number {
    return serverMs - this._offset
  }

  /** Convert a client timestamp to server time. */
  toServerTime(clientMs: number): number {
    return clientMs + this._offset
  }

  /**
   * Start clock synchronization. Runs an initial burst of probes,
   * then periodic re-syncs.
   */
  start() {
    if (this.periodicTimer !== null) return
    this.samples = []
    this._ready = false
    this.wireListener()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleResume)
    this.runBurst()

    this.periodicTimer = setInterval(() => {
      this.runBurst()
    }, PERIODIC_INTERVAL_MS)
  }

  stop() {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer)
      this.periodicTimer = null
    }
    for (const timer of this.burstTimers) clearTimeout(timer)
    this.burstTimers.clear()
    this.pendingProbes.clear()
    this.disposeListener?.()
    this.disposeListener = null
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleResume)
  }

  private wireListener() {
    this.disposeListener = this.room.onMessage(
      Message.TIME_SYNC_RESPONSE,
      (data: { clientSentAtMs: number; serverNowMs: number }) => {
        const sentAt = this.pendingProbes.get(data.clientSentAtMs)
        if (sentAt === undefined || !Number.isFinite(data.serverNowMs)) return
        this.pendingProbes.delete(data.clientSentAtMs)
        const clientReceivedAt = Date.now()
        const rtt = performance.now() - sentAt
        // A changed wall clock invalidates the midpoint calculation for this probe.
        if (Math.abs(clientReceivedAt - data.clientSentAtMs - rtt) > 1000) {
          this.samples = []
          this._ready = false
          return
        }
        const oneWay = rtt / 2
        const offset = data.serverNowMs + oneWay - clientReceivedAt

        this.samples = this.samples.filter((sample) => performance.now() - sample.receivedAtMonotonic < 60_000)
        this.samples.push({ offset, rtt, receivedAtMonotonic: performance.now() })

        // Keep only the best (lowest RTT) samples
        this.samples.sort((a, b) => a.rtt - b.rtt)

        if (this.samples.length > 10) {
          this.samples.length = 10
        }

        this.recalculate()
      }
    )
  }

  /** Register a callback that fires once TimeSync has at least one sample. */
  onReady(cb: () => void) {
    if (this._ready) {
      cb()
    } else {
      this._onReadyCallbacks.push(cb)
    }
  }

  private recalculate() {
    if (this.samples.length === 0) return

    // Use median of the best samples for stability
    const mid = Math.floor(this.samples.length / 2)
    this._offset = this.samples[mid].offset
    this._rtt = this.samples[mid].rtt

    const wasReady = this._ready
    this._ready = true

    // Fire onReady callbacks exactly once
    if (!wasReady && this._onReadyCallbacks.length > 0) {
      for (const cb of this._onReadyCallbacks) cb()
      this._onReadyCallbacks.length = 0
    }
  }

  private runBurst() {
    for (let i = 0; i < PROBE_COUNT; i++) {
      const timer = setTimeout(() => {
        this.burstTimers.delete(timer)
        this.sendProbe()
      }, i * PROBE_INTERVAL_MS)
      this.burstTimers.add(timer)
    }
  }

  private sendProbe() {
    const now = Date.now()
    // Expire unanswered probes so a disconnected server cannot grow this map.
    for (const [sentAt, sentAtMonotonic] of this.pendingProbes) {
      if (performance.now() - sentAtMonotonic > PERIODIC_INTERVAL_MS) this.pendingProbes.delete(sentAt)
    }
    this.pendingProbes.set(now, performance.now())

    this.room.send(Message.TIME_SYNC_REQUEST, { clientSentAtMs: now })
  }
}
