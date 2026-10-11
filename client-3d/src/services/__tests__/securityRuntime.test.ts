import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
const runtime = runInNewContext(readFileSync(new URL('../../../../nakama/modules/index.js', import.meta.url), 'utf8') + '\n({ InitModule, protectedStorage, validateProfileInput });')
const logger = { info: vi.fn() }
describe('Nakama security boundaries', () => {
  it('every registered RPC requires a session even with the runtime HTTP key', () => {
    const handlers: Array<Function> = []
    const initializer = new Proxy({}, { get: (_target, name) => name === 'registerRpc' ? (_id: string, fn: Function) => handlers.push(fn) : () => {} })
    runtime.InitModule({}, logger, {}, initializer)
    expect(handlers).toHaveLength(16)
    for (const handler of handlers) {
      try { handler({}, logger, {}, '{}'); throw new Error('accepted unauthenticated RPC') }
      catch (error: any) { expect(error.code).toBe(16) }
    }
  })
  it('blocks native write/delete bypasses while preserving private user settings', () => {
    for (const field of ['objects', 'objectIds']) {
      for (const collection of ['playlists', 'dm_messages', 'dm_conversations', 'wall_posts', 'postbox_letters', 'postbox_receipts', 'rate_limits']) {
        try { runtime.protectedStorage({}, logger, {}, { [field]: [{ collection }] }); throw new Error('accepted protected mutation') }
        catch (error: any) { expect(error.code).toBe(7) }
      }
    }
    const request = { objects: [{ collection: 'user_settings', value: '{}', permissionRead: 2, permissionWrite: 1 }] }
    expect(runtime.protectedStorage({}, logger, {}, request).objects[0].permissionRead).toBe(1)
  })
  it('rejects executable profile URLs', () => {
    expect(() => runtime.validateProfileInput({ links: [{ label: 'x', url: 'javascript:alert(1)' }] })).toThrow()
    expect(() => runtime.validateProfileInput({ background_url: 'data:text/html,hi' })).toThrow()
  })
})
