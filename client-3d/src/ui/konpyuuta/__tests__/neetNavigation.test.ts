import { describe, expect, it } from 'vitest'
import { resolveNeetAddress } from '../../../../../packages/konpyuuta/src/lib/neetNavigation'

describe('NEETscape addresses', () => {
  it('resolves local destinations without treating prototype properties as pages', () => {
    expect(resolveNeetAddress(' NEET://Directory/ ')).toEqual({ kind: 'directory', url: 'neet://directory', title: 'Directory' })
    expect(resolveNeetAddress('home')?.url).toBe('neet://home')
    expect(resolveNeetAddress('neet://constructor')).toBeNull()
    expect(resolveNeetAddress('neet://missing')).toBeNull()
  })
  it('normalizes ordinary web addresses into an explicit external destination', () => {
    expect(resolveNeetAddress('example.org/path?q=hello')?.url).toBe('https://example.org/path?q=hello')
    expect(resolveNeetAddress('http://example.org')).toEqual({ kind: 'external', url: 'http://example.org/', title: 'example.org' })
  })
  it('rejects executable URLs, credentials, malformed addresses, and empty input', () => {
    for (const input of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', '//example.org', 'https://', 'https://user:secret@example.org', 'hello world', '', '   ']) expect(resolveNeetAddress(input)).toBeNull()
  })
})
