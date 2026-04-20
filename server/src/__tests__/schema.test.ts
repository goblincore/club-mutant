import { describe, it, expect } from 'vitest'
import { RoomState, Player, MusicBooth, ChatMessage, MusicStream } from '@club-mutant/types/RoomState'

describe('RoomState', () => {
  it('can be instantiated', () => {
    const state = new RoomState()
    expect(state).toBeDefined()
    expect(state.players).toBeDefined()
    expect(state.chatMessages).toBeDefined()
  })

  it('can add and remove a player', () => {
    const state = new RoomState()
    const player = new Player()
    player.name = 'TestPlayer'
    player.x = 100
    player.y = 200
    state.players.set('session-1', player)

    expect(state.players.size).toBe(1)
    expect(state.players.get('session-1')?.name).toBe('TestPlayer')

    state.players.delete('session-1')
    expect(state.players.size).toBe(0)
  })

  it('Player has expected default values', () => {
    const player = new Player()
    expect(player.name).toBe('')
    expect(player.connected).toBe(true)
    expect(player.isDreaming).toBe(false)
    expect(player.isNpc).toBe(false)
    expect(typeof player.x).toBe('number')
    expect(typeof player.y).toBe('number')
  })

  it('ChatMessage can be created', () => {
    const msg = new ChatMessage()
    msg.author = 'Alice'
    msg.content = 'Hello world'
    expect(msg.author).toBe('Alice')
    expect(msg.content).toBe('Hello world')
    expect(msg.createdAt).toBeGreaterThan(0)
  })

  it('MusicStream has expected defaults', () => {
    const stream = new MusicStream()
    expect(stream.status).toBe('waiting')
    expect(stream.currentDj).toBeDefined()
  })
})
