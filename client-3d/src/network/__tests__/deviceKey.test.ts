import { beforeEach, describe, expect, it, vi } from 'vitest'

// The server only trusts a device key matching this (ClubMutant.identityFor); anything else is
// ignored and the player simply loses the "replace my dropped session" nicety.
const SERVER_ACCEPTS = /^[A-Za-z0-9_-]{16,64}$/

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
vi.stubGlobal('window', { location: { hostname: 'localhost', protocol: 'http:', port: '5173' }, addEventListener: vi.fn(), removeEventListener: vi.fn() })
const { getOrCreateDeviceKey } = await import('../NetworkManager')

describe('device key', () => {
  beforeEach(() => store.clear())

  it('is created once and then stays the same for this browser', () => {
    const first = getOrCreateDeviceKey()
    expect(getOrCreateDeviceKey()).toBe(first)
    expect(store.get('cm_device_key')).toBe(first)
  })

  it('is in the format the server accepts', () => {
    expect(getOrCreateDeviceKey()).toMatch(SERVER_ACCEPTS)
  })

  it('differs between browsers', () => {
    const a = getOrCreateDeviceKey()
    store.clear()
    expect(getOrCreateDeviceKey()).not.toBe(a)
  })

  it('still returns a valid one-off key when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(getOrCreateDeviceKey()).toMatch(SERVER_ACCEPTS)
  })
})
