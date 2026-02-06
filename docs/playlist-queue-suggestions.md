# DJ Queue & Playlist System - General Suggestions

## High-Impact Improvements

### 1. **Add "Queue from Playlist" Bulk Action**

**Problem**: Users add tracks one-by-one from their playlist to room queue (slow)

**Solution**: Multi-select + "Add X tracks to queue" button

```typescript
// MyPlaylistPanel.tsx
const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set())

<Button onClick={() => {
  selectedTracks.forEach(trackId => {
    const track = playlist.items.find(t => t.id === trackId)
    if (track) game.network.addToRoomQueuePlaylist(track)
  })
  setSelectedTracks(new Set())
}}>
  Add {selectedTracks.size} to Queue
</Button>
```

**UX**: Select 5 tracks → click "Add 5 to Queue" → they insert in order after current track

---

### 2. **Show Track Previews / Album Art**

**Current**: Text-only track titles (hard to scan)

**Solution**: Fetch YouTube thumbnail on add

```typescript
// When adding track, fetch thumbnail:
const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`

// Add to schema:
export class RoomQueuePlaylistItem extends Schema {
  // ... existing fields
  @type('string') thumbnailUrl: string | null = null
}

// UI: Show 40×40px thumbnail next to title
<img src={thumbnailUrl} alt="" width={40} height={40} style={{ borderRadius: 4 }} />
```

**Benefits**:
- 3× faster visual scanning (vs reading text)
- Looks more polished
- Matches Spotify/Apple Music UX

---

### 3. **Add "Play Next" vs "Add to End" Options**

**Current**: All tracks insert at position 1 (after current)

**Solution**: Two buttons: "Play Next" (position 1) vs "Add to End" (back of queue)

```typescript
// MyPlaylistPanel: Each track has two action buttons
<IconButton onClick={() => addTrack(track, 'next')} title="Play next">
  <PlayArrowIcon />
</IconButton>
<IconButton onClick={() => addTrack(track, 'end')} title="Add to end">
  <AddIcon />
</IconButton>

// Server: RoomQueuePlaylistAddCommand accepts position
type AddPayload = {
  client: Client
  item: { title, link, duration }
  position: 'next' | 'end' // ✅ New field
}
```

**Use cases**:
- "Play Next": Urgent track request, jump the queue
- "Add to End": Build up a long setlist

---

### 4. **Add "Recently Played" Section in My Playlist**

**Current**: No history of what you've played

**Solution**: Auto-save played tracks to localStorage

```typescript
// MyPlaylistStore.ts
interface MyPlaylistState {
  playlists: Playlist[]
  activePlaylistId: string | null
  recentlyPlayed: RecentTrack[] // ✅ New field
}

type RecentTrack = {
  id: string
  title: string
  link: string
  playedAt: number
  playedInRoom: string
}

// Update on track finish (in Game.ts or Network.ts)
dispatch(addToRecentlyPlayed({
  ...track,
  playedAt: Date.now(),
  playedInRoom: roomId,
}))

// UI: New tab in MyPlaylistPanel
<Tabs>
  <Tab label="Tracks" />
  <Tab label="Search" />
  <Tab label="Link" />
  <Tab label="History" /> {/* ✅ New tab */}
</Tabs>
```

**Benefits**:
- Discover what you played 2 hours ago
- Re-queue favorite tracks easily
- Show stats: "You've played 127 tracks this session"

---

### 5. **Add Track Duration Filter**

**Problem**: Some users want only short tracks (<3min), others want long mixes (>10min)

**Solution**: Filter search results by duration

```typescript
// MyPlaylistPanel Search tab
<Select value={durationFilter} onChange={...}>
  <MenuItem value="any">Any duration</MenuItem>
  <MenuItem value="short">Under 3 minutes</MenuItem>
  <MenuItem value="medium">3-10 minutes</MenuItem>
  <MenuItem value="long">Over 10 minutes</MenuItem>
</Select>

// Apply filter to search results
const filtered = searchResults.filter(track => {
  const mins = track.duration / 60
  if (durationFilter === 'short') return mins < 3
  if (durationFilter === 'medium') return mins >= 3 && mins <= 10
  if (durationFilter === 'long') return mins > 10
  return true
})
```

---

### 6. **Add "Import Playlist from YouTube"**

**Current**: Manual search + add (tedious for 20+ tracks)

**Solution**: Paste YouTube playlist URL → auto-import all videos

```typescript
// New command: Message.IMPORT_YOUTUBE_PLAYLIST
// Server calls youtube-api service:
const playlistId = extractPlaylistId(url) // "PLxxx..."
const videos = await fetchPlaylistVideos(playlistId) // YouTube Data API v3

videos.forEach(video => {
  // Auto-add to my playlist (client-side localStorage)
  dispatch(addToMyPlaylist({
    id: uuidv4(),
    title: video.title,
    link: video.videoId,
    duration: video.duration,
  }))
})
```

**UX**:
1. Click "Import Playlist"
2. Paste: `https://youtube.com/playlist?list=PLxxx`
3. Shows: "Found 47 videos. Import all?"
4. Confirm → all tracks added to active playlist

---

### 7. **Add "Shuffle Queue" Button**

**Current**: Tracks play in added order (predictable, can get boring)

**Solution**: Randomize unplayed tracks in your queue

```typescript
// DJQueuePanel: Add button near "Skip My Turn"
<StyledButton
  onClick={() => {
    game.network.shuffleMyRoomQueue()
    dispatch(shuffleRoomQueue())
  }}
>
  Shuffle My Queue
</StyledButton>

// Server: RoomQueuePlaylistShuffleCommand
execute(data: { client: Client }) {
  const player = this.state.players.get(data.client.sessionId)
  if (!player) return

  // Fisher-Yates shuffle (skip currently playing track)
  const unplayed = player.roomQueuePlaylist.filter(t => !t.played)
  for (let i = unplayed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[unplayed[i], unplayed[j]] = [unplayed[j], unplayed[i]]
  }

  // Rebuild: [currently playing] + [shuffled unplayed] + [played history]
  const current = player.roomQueuePlaylist.filter((_, i) => i === 0)
  const played = player.roomQueuePlaylist.filter(t => t.played)

  player.roomQueuePlaylist.splice(0, player.roomQueuePlaylist.length)
  current.forEach(t => player.roomQueuePlaylist.push(t))
  unplayed.forEach(t => player.roomQueuePlaylist.push(t))
  played.forEach(t => player.roomQueuePlaylist.push(t))
}
```

---

### 8. **Add Collaborative Playlist (Optional)**

**Current**: Each DJ has separate queue

**Future idea**: Shared "Party Playlist" where anyone can add, DJs draw from it

```typescript
// Schema: Add collaborative playlist
export class OfficeState extends Schema {
  // ... existing fields
  @type([RoomPlaylistItem]) collaborativePlaylist = new ArraySchema()
}

// Mode toggle in booth:
enum PlaybackMode {
  SOLO = 'solo',           // Current: Each DJ plays their own queue
  COLLABORATIVE = 'collab' // New: All DJs draw from shared pool
}

// When it's your turn in COLLABORATIVE mode:
// - Play top track from collaborativePlaylist (not your personal queue)
// - Anyone can add/reorder tracks
// - More like turntable.fm's "room queue"
```

**Use case**: Open mic night / communal listening party

---

## Quality of Life Improvements

### 9. **Keyboard Shortcuts**

Add global shortcuts (when not typing in input):

| Key | Action |
|-----|--------|
| `Space` | Play/Pause (DJ only) |
| `→` | Skip track (DJ only) |
| `M` | Toggle mute |
| `Shift+B` | Toggle video background |
| `Q` | Open DJ queue panel |
| `P` | Open my playlist panel |
| `Esc` | Close all panels |

---

### 10. **Track Search History**

Remember last 20 searches in localStorage:

```typescript
// Auto-complete dropdown shows:
// - "techno 2024" (searched 2 hours ago)
// - "ambient music" (searched yesterday)
```

---

### 11. **DJ Transition Announcement**

When rotation advances, broadcast to chat:

```typescript
// Server: After playTrackForCurrentDJ()
const chatMsg = new ChatMessage()
chatMsg.author = 'System'
chatMsg.content = `🎧 ${player.name} is now playing: ${track.title}`
chatMsg.createdAt = Date.now()
room.state.chatMessages.push(chatMsg)
```

Shows: `🎧 mutant-abc123 is now playing: Aphex Twin - Windowlicker`

---

### 12. **Add Volume Slider**

**Current**: Global mute only (on/off)

**Better**: Per-stream volume control (0-100%)

```typescript
// MusicStreamStore
interface MusicStreamState {
  // ... existing
  volume: number // 0-100, default 100
}

// Minimized player: Add volume slider
<Slider
  value={volume}
  onChange={(_, val) => dispatch(setVolume(val))}
  min={0}
  max={100}
  style={{ width: 60 }}
/>

// Apply to ReactPlayer
<ReactPlayer
  volume={volume / 100}
  muted={globallyMuted}
  // ...
/>
```

---

## Advanced Features (Future)

### 13. **DJ Reputation System**

Track stats per DJ:
- Total tracks played
- Average track rating (thumbs up/down from listeners)
- "Heat" score (how many people join when you DJ)

### 14. **Track Voting**

Listeners can upvote/downvote tracks in the queue:
- High votes = move up in queue
- Low votes = skip warning

### 15. **Scheduled DJ Sets**

Reserve booth time slots:
- "Every Friday 8-10pm: DJ Mutant's Techno Hour"
- Auto-start when scheduled DJ joins

### 16. **Playlist Sharing**

Export/import playlists as JSON:
- "Copy link to share my playlist"
- Others can import with one click

---

## Testing Recommendations

### Unit Tests (Server)

```typescript
describe('DJQueueCommand', () => {
  it('should advance to next DJ with tracks', () => {
    // Given: 3 DJs in queue, DJ 1 playing, DJ 2 has 3 tracks, DJ 3 has 0 tracks
    // When: DJ 1 finishes track
    // Then: Current DJ should be DJ 2 (skip DJ 3)
  })

  it('should not re-queue DJ with no unplayed tracks', () => {
    // Given: DJ with last track playing
    // When: Track finishes
    // Then: DJ removed from queue (not moved to back)
  })

  it('should handle DJ leaving mid-track', () => {
    // Given: DJ playing track, 2 other DJs waiting
    // When: Current DJ disconnects
    // Then: Advance to next DJ, mark track as played
  })
})
```

### Integration Tests (E2E with Playwright)

```typescript
test('DJ rotation: 3 DJs take turns', async ({ page }) => {
  // 1. Join as DJ A, add 2 tracks → starts playing
  // 2. Join as DJ B, add 3 tracks → queued
  // 3. Join as DJ C, add 1 track → queued
  // 4. Wait for DJ A's track to finish → DJ B starts
  // 5. Wait for DJ B's track to finish → DJ C starts
  // 6. Wait for DJ C's track to finish → DJ A starts again
})

test('Solo DJ can leave queue and disconnect from booth', async ({ page }) => {
  // 1. Join booth, add track, playing
  // 2. Click "Leave Queue"
  // 3. Assert: No longer in booth, music stopped, panel closed
})
```

---

## Performance Monitoring

Add server-side metrics:

```typescript
// Track average time between track changes
let lastTrackChange = Date.now()

function onTrackChange() {
  const elapsed = Date.now() - lastTrackChange
  console.log('[Metrics] Time between tracks:', elapsed, 'ms')
  lastTrackChange = Date.now()
}

// Track queue size distribution
function logQueueStats() {
  const queueSize = room.state.djQueue.length
  const avgTracksPerDJ = room.state.djQueue
    .map(e => room.state.players.get(e.sessionId)?.roomQueuePlaylist.length || 0)
    .reduce((a, b) => a + b, 0) / queueSize

  console.log('[Metrics] Queue size:', queueSize, 'Avg tracks/DJ:', avgTracksPerDJ)
}
```

Send to analytics (e.g., Plausible, PostHog):
- DJ session duration
- Tracks played per session
- Peak concurrent DJs
- Average queue wait time

---

## Summary: Top 3 Priorities

If you only implement 3 things, do these:

1. **Add background video toggle to minimized player** (usability)
2. **Fix "Your turn in X tracks" calculation** (correctness)
3. **Add track thumbnails** (visual polish)

These give the biggest UX improvement for least effort.
