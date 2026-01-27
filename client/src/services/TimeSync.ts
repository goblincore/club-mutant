type TimeSyncRequestPayload = {
  clientSentAtMs: number
}

type TimeSyncResponsePayload = {
  clientSentAtMs: number
  serverNowMs: number
}

class TimeSync {
  private bestRttMs: number | null = null
  private serverOffsetMs: number | null = null

  reset() {
    this.bestRttMs = null
    this.serverOffsetMs = null
  }

  hasSync(): boolean {
    return this.serverOffsetMs !== null
  }

  getServerNowMs(): number {
    const nowMs = Date.now()

    if (this.serverOffsetMs === null) {
      return nowMs
    }

    return nowMs - this.serverOffsetMs
  }

  createRequestPayload(): TimeSyncRequestPayload {
    return { clientSentAtMs: Date.now() }
  }

  handleResponse(payload: TimeSyncResponsePayload) {
    const clientReceivedAtMs = Date.now()

    if (
      !payload ||
      !Number.isFinite(payload.clientSentAtMs) ||
      !Number.isFinite(payload.serverNowMs)
    ) {
      return
    }

    const rttMs = clientReceivedAtMs - payload.clientSentAtMs

    if (!Number.isFinite(rttMs) || rttMs < 0) {
      return
    }

    const oneWayMs = rttMs / 2

    const estimatedClientAtServerSendMs = payload.clientSentAtMs + oneWayMs

    const serverOffsetMs = estimatedClientAtServerSendMs - payload.serverNowMs

    if (!Number.isFinite(serverOffsetMs)) {
      return
    }

    if (this.bestRttMs === null || rttMs < this.bestRttMs) {
      this.bestRttMs = rttMs
      this.serverOffsetMs = serverOffsetMs
    }
  }
}

export type { TimeSyncRequestPayload, TimeSyncResponsePayload }

export const timeSync = new TimeSync()
