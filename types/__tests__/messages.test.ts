import { describe, it, expect } from 'vitest'
import { Message } from '../Messages.ts'

describe('Message enum', () => {
  it('has expected core message types', () => {
    expect('UPDATE_PLAYER_ACTION' in Message).toBe(true)
    expect('ADD_CHAT_MESSAGE' in Message).toBe(true)
    expect('START_MUSIC_STREAM' in Message).toBe(true)
    expect('JUKEBOX_ADD' in Message).toBe(true)
    expect('DREAM_SLEEP' in Message).toBe(true)
  })

  it('has unique values for all message types', () => {
    const values = Object.values(Message).filter(v => typeof v === 'number')
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it('has matching keys for all numeric values', () => {
    const keys = Object.keys(Message).filter(k => isNaN(Number(k)))
    const values = Object.values(Message).filter(v => typeof v === 'number')
    expect(keys.length).toBe(values.length)
  })
})
