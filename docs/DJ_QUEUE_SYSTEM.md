# DJ Queue Rotation System

## Overview

The DJ Queue Rotation System is a social music-sharing feature that allows multiple users to queue up and take turns playing tracks for the room. It's designed to facilitate collaborative listening sessions where everyone gets a turn to share their music.

## User Flow

### 1. Becoming a DJ

**First DJ:**

1. Walk up to the DJ booth (music booth 0)
2. Press `R` or click the booth
3. Automatically joins the queue as position #1
4. Becomes the current DJ immediately
5. Can add tracks from their personal playlist to the Room Queue

**Additional DJs:**

1. While someone is DJing, approach the booth
2. Click the "Join DJ Queue" button
3. Get added to the end of the queue
4. Wait for their turn while watching the current DJ play

### 2. Managing Your Queue

**Adding Tracks:**

- Open your personal playlist panel (right side)
- Find a track you want to play
- Click the `+` button next to it
- Track is inserted right after the currently playing track (if any)

**Track Order:**

```
[Currently Playing] ← Locked, can't move
[Unplayed Track 1]  ← Will play next
[Unplayed Track 2]
[Unplayed Track 3]
[Played Track 1]    ← Greyed out, history
[Played Track 2]    ← Greyed out, history
```

**Reordering:**

- Drag and drop tracks to reorder (only unplayed tracks)
- Currently playing track is locked in place
- Played tracks are locked at the bottom

**Removing Tracks:**

- Click the trash icon on any track
- Cannot remove the currently playing track

### 3. Playing Music

**First DJ (empty room):**

- Must explicitly press the play button to start playback
- This is the ONLY case where manual play is required

**When It's Your Turn (autoplay):**

- Your top unplayed track automatically starts playing for everyone
- You see playback controls (play/pause, prev, next) and a background video toggle
- Other users see your name as the current DJ but NO playback controls

**During Your Turn:**

- Track plays to completion (or until skipped)
- After track ends, you're moved to the end of the queue (if you have more tracks)
- Next DJ's top track starts automatically (no manual play needed)

**Track Status Text:**

- "Now playing" — track is actively streaming
- "Paused" — track is the current track but playback is paused
- "Played" — track has been played and is in history
- "Up next" — next unplayed track in your queue

### 4. Skipping Your Turn

- Click "Skip My Turn" button (only visible when you're the current DJ)
- Current track is marked as played and moved to bottom
- Client receives updated playlist (`ROOM_QUEUE_PLAYLIST_UPDATED`)
- Immediately advances to next DJ (autoplay)
- You stay in the queue for your next turn

### 5. Leaving the Queue

**Click "Leave Queue":**

- Removes you from the DJ queue
- If you were currently playing:
  - Rotation advances to next DJ (autoplay — their track starts immediately)
- If you were NOT the current DJ:
  - Playback for the current DJ is unaffected
- Disconnects you from the booth
- Closes the DJ UI

## Technical Implementation

### Server-Side

**Schema Extensions:**

```typescript
// OfficeState
djQueue: ArraySchema<DJQueueEntry>
currentDjSessionId: string | null

// Player
roomQueuePlaylist: ArraySchema<RoomQueuePlaylistItem>

// RoomQueuePlaylistItem
id: string
title: string
link: string
duration: number
addedAtMs: number
played: boolean // Track history flag
```

**Commands:**

1. **DJQueueJoinCommand** (`DJ_QUEUE_JOIN`)
   - Validates user not already in queue
   - Adds to end of queue
   - If first DJ, sets as current (but does NOT auto-start — requires explicit `DJ_PLAY`)

2. **DJQueueLeaveCommand** (`DJ_QUEUE_LEAVE`)
   - Calls `removeDJFromQueue()` which handles all cleanup
   - If was current DJ: promotes next DJ and autoplays their track

3. **DJSkipTurnCommand** (`DJ_SKIP_TURN`)
   - Only current DJ can trigger
   - Marks current track as played
   - Sends `ROOM_QUEUE_PLAYLIST_UPDATED` to the client so UI updates
   - Advances rotation immediately (autoplay)

4. **DJTurnCompleteCommand** (`DJ_TURN_COMPLETE`)
   - Called when track naturally ends
   - Marks track as played and moves to bottom
   - Sends `ROOM_QUEUE_PLAYLIST_UPDATED` to the client
   - Advances to next DJ (autoplay)

5. **DJPlayCommand** (`DJ_PLAY`)
   - Explicit play — only needed for first play in an empty/silent room
   - All other transitions use autoplay via `playTrackForCurrentDJ()`

6. **RoomQueuePlaylist Commands**
   - `ROOM_QUEUE_PLAYLIST_ADD`: Insert after current playing track. Does NOT auto-start playback.
   - `ROOM_QUEUE_PLAYLIST_REMOVE`: Remove by ID (not if playing)
   - `ROOM_QUEUE_PLAYLIST_REORDER`: Reorder unplayed tracks only

**Rotation Logic:**

```typescript
function advanceRotation() {
  // 1. Move current DJ to end of queue (if they have more tracks) or remove
  // 2. Update queue positions
  // 3. Find next DJ with unplayed tracks (findNextDJWithTracks)
  // 4. Move them to front, set as currentDjSessionId
  // 5. Call playTrackForCurrentDJ() to autoplay
  // 6. Broadcast DJ_QUEUE_UPDATED to all clients
}

function removeDJFromQueue() {
  // 1. Stop current track if leaving DJ was playing
  // 2. Remove from queue, reassign positions
  // 3. If was current DJ: promote next in queue
  // 4. Autoplay next DJ's track if they have one (regardless of whether previous DJ was playing)
  // 5. Broadcast DJ_QUEUE_UPDATED
}
```

### Client-Side

**Redux Stores:**

1. **DJQueueStore** (`client/src/stores/DJQueueStore.ts`)
   - `entries`: Array of DJQueueEntryDto
   - `currentDjSessionId`: Who's currently playing
   - `isInQueue`: Whether current user is in queue
   - `myQueuePosition`: User's position in queue

2. **RoomQueuePlaylistStore** (`client/src/stores/RoomQueuePlaylistStore.ts`)
   - `items`: Array of RoomQueuePlaylistItemDto
   - `isVisible`: Show/hide panel

**Components:**

1. **DJQueuePanel** (`client/src/components/DJQueuePanel.tsx`)
   - Shows queue list with current DJ highlighted
   - Displays user's playlist with drag-drop reorder
   - Track status text reflects actual play/pause state ("Now playing" / "Paused" / "Played")
   - Shows "Skip My Turn" button for current DJ
   - Shows "Leave Queue" button

2. **PlayerControls** (`client/src/components/PlayerControls.tsx`)
   - Play/pause, previous, and next track buttons
   - Only rendered when `isCurrentDJ` is true (hidden for non-current DJs)
   - `canControl` prop gates interactivity (disabled when no tracks)

3. **YoutubePlayer Integration** (`client/src/components/YoutubePlayer.tsx`)
   - View modes:
     - **In Queue (expanded)**: Shows playback controls (current DJ only), BG video toggle, DJQueuePanel
     - **In Queue (minimized, current DJ)**: Shows playback controls + track title + elapsed time + "Up next"
     - **In Queue (minimized, waiting)**: Shows queue position text only, no controls
     - **Booth Occupied (not in queue)**: Shows join button
   - Hidden video player continues audio playback
   - Background video toggle (camera icon) next to playback controls

4. **usePlayerSync** (`client/src/components/usePlayerSync.ts`)
   - Custom hook managing player synchronization, drift correction, and resync
   - **Auto-play effect**: Sets `isPlaying = true` when `link` or `streamId` changes (ensures playback starts on DJ switch)
   - **Reset effect**: Sets `isPlaying = false` when `link` becomes null (shows play button when stopped)

**Network Methods:**

```typescript
// DJ Queue
joinDJQueue()
leaveDJQueue()
skipDJTurn()
djTurnComplete()

// Room Queue Playlist
addToRoomQueuePlaylist(item: { title, link, duration })
removeFromRoomQueuePlaylist(itemId: string)
reorderRoomQueuePlaylist(fromIndex: number, toIndex: number)
```

## State Transitions

### User Joins as First DJ (empty room)

```
User → Click Booth → Join Queue (pos #1) → Set as current DJ → Must press Play to start
```

### User Joins as Additional DJ

```
User → Click "Join Queue" → Join Queue (pos #N) → Wait for turn
```

### Track Ends Naturally

```
Track Ends → Client sends DJ_TURN_COMPLETE → Mark as Played → Send playlist update → advanceRotation → Autoplay next DJ
```

### DJ Skips Turn

```
Skip Clicked → Mark as Played → Send playlist update → advanceRotation → Autoplay next DJ → Skipped DJ goes to end
```

### DJ Leaves While Playing

```
Leave Clicked → Client sends DJ_QUEUE_LEAVE + DISCONNECT_FROM_MUSIC_BOOTH
  → removeDJFromQueue: Stop track → Remove from queue → Promote next DJ → Autoplay their track
  → DISCONNECT_FROM_MUSIC_BOOTH: Skip legacy handling (DJ queue is active)
```

### Non-Current DJ Leaves

```
Leave Clicked → Client sends DJ_QUEUE_LEAVE + DISCONNECT_FROM_MUSIC_BOOTH
  → removeDJFromQueue: Remove from queue → No music state change
  → DISCONNECT_FROM_MUSIC_BOOTH: Skip legacy handling (DJ queue is active)
```

## Edge Cases

1. **All DJs run out of tracks**
   - Music stops, stream set to 'waiting'
   - Waits for someone to add tracks and press play

2. **Only one DJ in queue**
   - After playing one track, rotates back to themselves
   - Plays their next track (if any)

3. **DJ leaves while others waiting**
   - Immediate rotation to next DJ with autoplay
   - Seamless transition — current DJ's playback for other users is unaffected during non-current-DJ leave

4. **New user joins mid-playback**
   - Sees current track playing
   - Can join queue and wait for their turn
   - Synced to current playback position via TimeSync

5. **Message ordering race condition (DJ_QUEUE_LEAVE vs DISCONNECT_FROM_MUSIC_BOOTH)**
   - Client sends `DJ_QUEUE_LEAVE` first, then `DISCONNECT_FROM_MUSIC_BOOTH`
   - By the time booth disconnect runs, player is already removed from DJ queue
   - Guard: check `djQueue.length > 0 || currentDjSessionId !== null` (not the specific player)
   - Without this guard, legacy booth music handling (`clearRoomPlaylistAfterDjLeft`) disrupts the newly started stream

## Styling Guidelines

The DJ Queue UI follows the existing Club Mutant dark transparent theme:

```css
/* Container */
background: transparent; /* Inherits from parent */
border: none;
font-family: 'Courier New', Courier, monospace;

/* Items */
background: rgba(255, 255, 255, 0.1); /* Selected/highlighted */
border: 1px solid rgba(255, 255, 255, 0.25);
opacity: 1; /* Unplayed */
opacity: 0.7; /* Currently playing */
opacity: 0.4; /* Played history */

/* Buttons */
background: rgba(0, 0, 0, 0.35);
border: 1px solid rgba(255, 255, 255, 0.25);
color: rgba(255, 255, 255, 0.9);
text-transform: lowercase;
```

## Future Enhancements

Potential improvements to consider:

1. **Track Preview**: Allow DJs to preview tracks before adding to queue
2. **Queue Voting**: Let non-DJs vote on upcoming tracks
3. **DJ Stats**: Track total play time, favorite genres, etc.
4. **Cross-fade**: Smooth transitions between DJs
5. **Chat Integration**: Special chat badges for current DJ
6. **Track Recommendations**: Suggest tracks based on room's music taste

## Migration from Legacy System

The DJ Queue system replaces the previous shared room playlist:

- **Old**: Single shared playlist, one DJ controls everything
- **New**: Per-user playlists, round-robin rotation
- **Migration**: Legacy room playlist data preserved but UI removed
- **Compatibility**: Old `roomPlaylist` endpoints still exist for backward compatibility

## Testing Checklist

### Playback

- [ ] First DJ in empty room must press play explicitly
- [ ] Adding a track does NOT auto-start playback
- [ ] Track finishes → next DJ's track autoplays
- [ ] Skip turn → next DJ's track autoplays
- [ ] Current DJ leaves → next DJ's track autoplays
- [ ] Non-current DJ leaves → current DJ's playback is unaffected
- [ ] All DJs out of tracks stops music gracefully

### UI

- [ ] Current DJ sees playback controls (play/pause, prev, next) in both minimized and expanded views
- [ ] Non-current DJs see NO playback controls
- [ ] Current DJ sees background video toggle (camera icon)
- [ ] Track status shows "Now playing" when streaming, "Paused" when paused, "Played" for history
- [ ] Minimized view: current DJ shows track title + time + controls; waiting DJ shows queue position
- [ ] Track history shows with correct opacity (0.4)
- [ ] Cannot drag currently playing or played tracks
- [ ] Adding tracks inserts at correct position

### Rotation

- [ ] Single DJ can join and play tracks
- [ ] Multiple DJs can join and rotate correctly
- [ ] Skip turn marks track as played and client playlist updates
- [ ] Leaving queue while playing advances rotation seamlessly

### Booth Disconnect Isolation

- [ ] Non-current DJ leaving does not trigger legacy music stop
- [ ] Current DJ leaving does not trigger legacy music stop (DJ queue handles it)
- [ ] Last DJ leaving allows ambient music to resume (legacy handling runs when queue is empty)

### Background Video + TV Static

- [ ] TV static fades out when background video starts (WebGL)
- [ ] TV static fades out when background video starts (iframe fallback)
- [ ] TV static fades back in when background video is disabled/stopped
- [ ] Background video toggle works for current DJ
