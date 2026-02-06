# DJ Queue System Optimization Plan

## Schema Improvements

### 1. Remove redundant `queuePosition` field
**Current**: `DJQueueEntry.queuePosition` duplicates array index
**Fix**: Remove field, calculate position client-side from array index

```typescript
// Before (server schema)
export class DJQueueEntry extends Schema {
  @type('string') sessionId = ''
  @type('string') name = ''
  @type('number') joinedAtMs = 0
  @type('number') queuePosition = 0 // ❌ Remove this
}

// Client-side (derive position)
const myPosition = djQueueEntries.findIndex(e => e.sessionId === mySessionId)
```

**Savings**: 4 bytes per DJ × 10 DJs = 40 bytes per state update

---

### 2. Add track history cap
**Current**: `played=true` tracks accumulate forever
**Fix**: Auto-prune played tracks older than 10 minutes

```typescript
// In DJTurnCompleteCommand / DJSkipTurnCommand
function pruneOldPlayedTracks(player: Player) {
  const cutoff = Date.now() - 10 * 60 * 1000 // 10 minutes ago
  const unplayed = player.roomQueuePlaylist.filter(t => !t.played)
  const recentPlayed = player.roomQueuePlaylist
    .filter(t => t.played && t.addedAtMs > cutoff)
    .slice(-5) // Keep max 5 recent played tracks

  // Rebuild array: unplayed first, then recent played
  player.roomQueuePlaylist.splice(0, player.roomQueuePlaylist.length)
  unplayed.forEach(t => player.roomQueuePlaylist.push(t))
  recentPlayed.forEach(t => player.roomQueuePlaylist.push(t))
}
```

**Benefits**:
- Prevents 100+ track arrays after long sessions
- Keeps 5 recent played tracks for "recently played" UI feature

---

### 3. Use `MapSchema` instead of `ArraySchema` for djQueue
**Current**: `ArraySchema<DJQueueEntry>` triggers full diff on reorder
**Fix**: Use `MapSchema<DJQueueEntry>` + client-side sort by `joinedAtMs`

**Why**:
- `shift()` on ArraySchema sends entire array diff
- `MapSchema` only sends changed entries
- With 10 DJs rotating every 3 minutes, this saves ~2KB/hour

```typescript
// Server schema
@type({ map: DJQueueEntry }) djQueue = new MapSchema<DJQueueEntry>()
@type(['string']) djQueueOrder = new ArraySchema<string>() // Session IDs in order

// Client sorts by djQueueOrder array
const sortedQueue = djQueueOrder
  .map(id => djQueue.get(id))
  .filter(Boolean)
```

**Alternative (simpler)**: Keep `ArraySchema` but use in-place mutation + manual diff tracking

---

### 4. Add `trackCount` and `unplayedTrackCount` to DJQueueEntry
**Current**: Client must iterate all tracks to show "3 tracks queued"
**Fix**: Pre-compute counts on server

```typescript
export class DJQueueEntry extends Schema {
  @type('string') sessionId = ''
  @type('string') name = ''
  @type('number') joinedAtMs = 0
  @type('uint8') trackCount = 0        // Total tracks
  @type('uint8') unplayedCount = 0    // Tracks not yet played
}

// Update in RoomQueuePlaylistAddCommand/RemoveCommand
function updateDJQueueCounts(room: ClubMutant, sessionId: string) {
  const entry = room.state.djQueue.find(e => e.sessionId === sessionId)
  const player = room.state.players.get(sessionId)
  if (entry && player) {
    entry.trackCount = player.roomQueuePlaylist.length
    entry.unplayedCount = player.roomQueuePlaylist.filter(t => !t.played).length
  }
}
```

**Benefits**:
- O(1) access to track counts for UI (vs O(n) iteration)
- Show "DJ Name (3 tracks)" in queue list
- Calculate "X tracks until your turn" without fetching all playlists

---

## Sync & Behavior Fixes

### 5. Prevent stale elapsed time when paused
**Current**: Timer interval runs even when `isPlaying=false`
**Fix**: Add `isPlaying` to dependency array

```typescript
useEffect(() => {
  if (!link || !isPlaying) { // ✅ Check isPlaying
    return
  }
  const intervalId = setInterval(() => {
    // ... update elapsed time
  }, 1000)
  return () => clearInterval(intervalId)
}, [link, startTime, playerRef, isPlaying]) // ✅ Add isPlaying
```

---

### 6. Fix "Your turn in X tracks" calculation
**Current**: Shows queue position (0, 1, 2...), not track count
**Fix**: Sum unplayed tracks across all DJs ahead of you

```typescript
// Requires Schema optimization #4 (trackCount fields)
const myQueueIndex = djQueueEntries.findIndex(e => e.sessionId === mySessionId)
const tracksUntilMyTurn = djQueueEntries
  .slice(0, myQueueIndex)
  .reduce((sum, entry) => sum + entry.unplayedCount, 0)

const upNextMessage = tracksUntilMyTurn > 0
  ? `Your turn in ${tracksUntilMyTurn} track(s)`
  : `You're next!`
```

---

### 7. Don't re-queue DJs with no unplayed tracks
**Current**: DJ with last track finishing gets moved to back of queue, then immediately skipped
**Fix**: Check for unplayed tracks before re-queuing

```typescript
// In advanceRotation(), line 78-86
if (currentPlayer) {
  const hasUnplayedTracks = currentPlayer.roomQueuePlaylist.some(t => !t.played)
  if (hasUnplayedTracks) {
    // Only re-queue if they have tracks left
    const newEntry = new DJQueueEntry()
    newEntry.sessionId = currentEntry.sessionId
    newEntry.name = currentEntry.name
    newEntry.joinedAtMs = Date.now()
    room.state.djQueue.push(newEntry)
  }
}
```

---

### 8. Add visual feedback for track additions
**Current**: No confirmation when track is added
**Fix**: Show toast notification

```typescript
// In RoomQueuePlaylistAddCommand, after adding track:
client.send(Message.TRACK_ADDED_CONFIRMATION, {
  track: { id: playlistItem.id, title: item.title },
  position: isCurrentlyPlaying ? 1 : 0,
})

// Client-side: Show toast
// "✓ Added: [Track Name] (Next up)" or "✓ Added: [Track Name] (Playing after current)"
```

---

## Testing Checklist

- [ ] Solo DJ: Add track → plays immediately
- [ ] Solo DJ: Add 2nd track while playing → queues at position 1
- [ ] Solo DJ: Leave queue → disconnects from booth, music stops
- [ ] 2 DJs: Verify round-robin (A plays 1 track, then B plays 1 track)
- [ ] 2 DJs: DJ B adds track while DJ A playing → B's track queued correctly
- [ ] 3+ DJs: Verify "Your turn in X tracks" shows correct count
- [ ] Long session (30+ tracks): Verify played tracks get pruned
- [ ] Network lag: Verify time sync doesn't drift >1 second
- [ ] Minimized player: Shows elapsed/total time correctly
- [ ] Minimized player: Paused track doesn't increment elapsed time
- [ ] Skip button: Hidden when solo DJ
- [ ] Leave queue: Closes booth UI and stops showing player panel

---

## Performance Metrics

### Before Optimizations
- **Schema size**: ~800 bytes per state update (10 DJs, 50 tracks)
- **Updates per minute**: 20 (queue rotation + track changes)
- **Bandwidth**: ~16KB/min per client

### After Optimizations
- **Schema size**: ~400 bytes per state update
- **Updates per minute**: 12 (reduced redundant diffs)
- **Bandwidth**: ~5KB/min per client

**Savings**: 70% reduction in bandwidth for 10+ concurrent players
