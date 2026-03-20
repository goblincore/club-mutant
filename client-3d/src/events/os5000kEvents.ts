/**
 * Simple event bus for pushing notifications to the OS5000k bridge.
 * Decouples nakamaClient.ts from the bridge host so the bridge
 * doesn't need to be imported in network code.
 */

type OS5kPushHandler = (method: string, payload: unknown) => void

let handler: OS5kPushHandler | null = null

export function setOS5kPushHandler(h: OS5kPushHandler | null): void {
  handler = h
}

export function pushToOS5k(method: string, payload: unknown): void {
  handler?.(method, payload)
}
