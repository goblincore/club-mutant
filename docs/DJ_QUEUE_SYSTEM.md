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

**When It's Your Turn:**
- Your top unplayed track automatically starts playing for everyone
- You see "You're currently playing" in the UI
- Other users see your name as the current DJ

**During Your Turn:**
- Track plays to completion (or until skipped)
- After track ends, you're moved to the end of the queue (if you have more tracks)
- Next DJ's top track starts automatically

### 4. Skipping Your Turn

- Click "Skip My Turn" button (only visible when you're the current DJ)
- Current track is marked as played and moved to bottom
- Immediately advances to next DJ
- You stay in the queue for your next turn

### 5. Leaving the Queue

**Click "Leave Queue":**
- Removes you from the DJ queue
- If you were currently playing:
  - Your track stops
  - Rotation advances to next DJ
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
played: boolean  // Track history flag
```

**Commands:**

1. **DJQueueJoinCommand** (`DJ_QUEUE_JOIN`)
   - Validates user not already in queue
   - Adds to end of queue
   - If first DJ, sets as current and auto-starts if tracks available

2. **DJQueueLeaveCommand** (`DJ_QUEUE_LEAVE`)
   - Removes user from queue
   - If was current DJ, marks track as played and advances rotation

3. **DJSkipTurnCommand** (`DJ_SKIP_TURN`)
   - Only current DJ can trigger
   - Marks current track as played
   - Advances rotation immediately

4. **DJTurnCompleteCommand** (`DJ_TURN_COMPLETE`)
   - Called when track naturally ends
   - Marks track as played and moves to bottom
   - Advances to next DJ

5. **RoomQueuePlaylist Commands**
   - `ROOM_QUEUE_PLAYLIST_ADD`: Insert after current playing track
   - `ROOM_QUEUE_PLAYLIST_REMOVE`: Remove by ID (not if playing)
   - `ROOM_QUEUE_PLAYLIST_REORDER`: Reorder unplayed tracks only

**Rotation Logic:**

```typescript
function advanceRotation() {
  // 1. Mark current track as played
  // 2. Move current DJ to end if they have more tracks
  // 3. Find next DJ with unplayed tracks
  // 4. Start their top track
  // 5. Broadcast state change to all clients
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
   - Shows "Skip My Turn" button for current DJ
   - Shows "Leave Queue" button

2. **YoutubePlayer Integration** (`client/src/components/YoutubePlayer.tsx`)
   - Three view modes:
     - **In Queue**: Shows DJQueuePanel
     - **Booth Occupied**: Shows join button
     - **Minimized**: Shows current track + "Up next"
   - Hidden video player continues audio playback

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

### User Joins as First DJ
```
User → Click Booth → Join Queue (pos #1) → Auto-start if has tracks
```

### User Joins as Additional DJ
```
User → Click "Join Queue" → Join Queue (pos #N) → Wait for turn
```

### Track Ends Naturally
```
Track Ends → Mark as Played → Move DJ to end (if has tracks) → Next DJ's turn
```

### DJ Skips Turn
```
Skip Clicked → Mark as Played → Next DJ's turn → Skipped DJ goes to end
```

### DJ Leaves While Playing
```
Leave Clicked → Stop Music → Mark track played → Next DJ's turn → Remove from queue
```

## Edge Cases

1. **All DJs run out of tracks**
   - Music stops
   - Waits for someone to add tracks
   - If current DJ adds tracks, auto-resumes

2. **Only one DJ in queue**
   - After playing one track, rotates back to themselves
   - Plays their next track (if any)

3. **DJ leaves while others waiting**
   - Immediate rotation to next DJ
   - Seamless transition

4. **New user joins mid-playback**
   - Sees current track playing
   - Can join queue and wait for their turn
   - Synced to current playback position

## Styling Guidelines

The DJ Queue UI follows the existing Club Mutant dark transparent theme:

```css
/* Container */
background: transparent;  /* Inherits from parent */
border: none;
font-family: 'Courier New', Courier, monospace;

/* Items */
background: rgba(255, 255, 255, 0.1);  /* Selected/highlighted */
border: 1px solid rgba(255, 255, 255, 0.25);
opacity: 1;        /* Unplayed */
opacity: 0.7;      /* Currently playing */
opacity: 0.4;      /* Played history */

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

- [ ] Single DJ can join and play tracks
- [ ] Multiple DJs can join and rotate correctly
- [ ] Track history shows with correct opacity
- [ ] Cannot drag currently playing or played tracks
- [ ] Skip turn advances rotation
- [ ] Leaving queue while playing advances rotation
- [ ] Minimized view shows correct info
- [ ] Adding tracks inserts at correct position
- [ ] All DJs out of tracks stops music gracefully
- [ ] New tracks auto-start when added to empty queue
