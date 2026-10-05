/** Nakama's JS SDK throws an HTTP Response for RPC errors, not an Error. */
export async function postboxErrorText(error: unknown): Promise<string> {
  if (typeof Response !== 'undefined' && error instanceof Response) {
    if (error.status === 404) return 'Letter delivery is unavailable right now. Your draft is saved.'
    try {
      const body = await error.json()
      const message = typeof body.message === 'string' ? body.message : body.error
      if (typeof message === 'string') return message.replace(/^Error:\s*/, '').split(/\s+at\s+\S+\s+\(/)[0]!.slice(0, 200)
    } catch { /* Keep the draft and show the connection fallback below. */ }
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message.slice(0, 200)
  return 'Postbox couldn’t reach the server. Try again.'
}
