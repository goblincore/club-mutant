# Booth-Queue Decoupling Fix

## Problem Statement

The DJ booth and DJ queue were tightly coupled, causing critical bugs:

### Bug 1: Player Stuck at Booth
- **Symptom**: Clicking "Leave Queue" button left player stuck with DJ animation, unable to move
- **Cause**: `handleLeaveQueue()` called `disconnectFromMusicBooth()` but didn't trigger the reverse transform animation
- **Result**: Player had `body.setImmovable(true)` and `playerBehavior = SITTING` with no way to restore movement

### Bug 2: Queue Breaks When First DJ Leaves
- **Symptom**: When booth occupant left (via pressing R), other players in queue lost controls
- **Cause**: `MusicBooth.closeDialog()` automatically called `network.leaveDJQueue()`, destroying the entire queue
- **Result**: Music stopped, other DJs couldn't play, UI became inconsistent

### Bug 3: Architectural Confusion
- **Issue**: System conflated "sitting at booth" (visual/animation) with "being in rotation" (queue membership)
- **Problem**: First person to enter booth was "special", breaking when they left
- **Confusion**: What happens when someone else wants to sit at booth while queue is active?

## Solution: Decouple Booth from Queue

### New Architecture

**Booth occupancy** and **queue membership** are now independent:

```
┌──────────────────┬────────────────┬──────────────────────────┐
│ Booth State      │ Queue State    │ What This Means          │
├──────────────────┼────────────────┼──────────────────────────┤
│ Not at booth     │ Not in queue   │ Regular player           │
│ At booth         │ Not in queue   │ Sitting for visuals only │
│ Not at booth     │ In queue       │ DJ from afar (remote DJ) │
│ At booth         │ In queue       │ DJ sitting at booth      │
└──────────────────┴────────────────┴──────────────────────────┘
```

### Key Changes

#### 1. Added `MyPlayer.exitBoothIfConnected()` Method

**File**: `client/src/characters/MyPlayer.ts`

New public method that properly exits the booth with full animation sequence:
- Plays `mutant_transform_reverse` animation
- Restores `body.setImmovable(false)` on completion
- Resets depth and player behavior to `IDLE`
- Clears `musicBoothOnSit` reference

**Usage**: Called from DJQueuePanel "Leave Queue" button

#### 2. Updated DJQueuePanel Leave Handler

**File**: `client/src/components/DJQueuePanel.tsx`

```typescript
const handleLeaveQueue = () => {
  game.network.leaveDJQueue()           // 1. Leave queue on server
  dispatch(leaveDJQueue())              // 2. Update Redux state
  dispatch(setRoomQueuePlaylistVisible(false))

  if (connectedBoothIndex !== null) {
    const exitedBooth = game.myPlayer.exitBoothIfConnected(game.network)
    // ✅ Properly exits booth with animation + restores movement
  }
}
```

#### 3. Removed Auto-Leave from Booth Close

**File**: `client/src/items/MusicBooth.ts`

**Before**:
```typescript
closeDialog(network: Network) {
  // ... disconnect from booth

  // ❌ BAD: Auto-leave queue when exiting booth
  if (state.djQueue.isInQueue) {
    network.leaveDJQueue()
    store.dispatch(setIsInQueue(false))
  }
}
```

**After**:
```typescript
closeDialog(network: Network) {
  // ... disconnect from booth only

  // ✅ Queue persists independently
  // Users must explicitly click "Leave Queue" to exit rotation
}
```

### New Interaction Flows

#### Flow 1: Enter Booth → Join Queue
1. Walk to booth, press `R`
2. Play `mutant_transform` animation
3. `MusicBooth.openDialog()` auto-joins queue ✅
4. DJ Queue panel appears
5. Add tracks and play

#### Flow 2: Exit Booth (Stay in Queue)
1. At booth, press `R` again
2. Play `mutant_transform_reverse` animation
3. Restore movement, exit booth visuals
4. **Still in queue** ✅ (can play from afar)
5. DJ Queue panel stays open

#### Flow 3: Leave Queue (Exit Booth Too)
1. Click "Leave Queue" button
2. Call `leaveDJQueue()` on server
3. Play `mutant_transform_reverse` if at booth
4. Restore movement, close all panels
5. **No longer in queue or at booth** ✅

#### Flow 4: Multiple DJs, First One Leaves
1. DJ A at booth, DJs B & C in queue (remote)
2. DJ A presses `R` → exits booth visual
3. **Queue persists** ✅, DJ A still in rotation
4. Music continues, DJs B & C still have controls ✅
5. Anyone can now press `R` at booth for visuals

### Benefits

✅ **Fixed stuck player bug** - Proper animation + movement restore
✅ **Queue persists** - First DJ leaving doesn't break system
✅ **Flexible DJ positions** - Can DJ from anywhere in the room
✅ **Booth is cosmetic** - Visual indicator, not queue controller
✅ **Clear separation** - Booth = visuals, Queue = rotation logic

### Testing Scenarios

- [ ] Solo DJ: Enter booth → add track → plays ✓
- [ ] Solo DJ: Leave queue button → exits booth, restores movement ✓
- [ ] Solo DJ: Press R at booth → exits booth but stays in queue ✓
- [ ] 2 DJs: First DJ leaves booth (press R) → second DJ keeps playing ✓
- [ ] 2 DJs: First DJ leaves queue (button) → second DJ takes over ✓
- [ ] 3+ DJs: First DJ gone → rotation continues normally ✓
- [ ] Edge case: Non-DJ sits at booth → just gets animation, no queue join ✓

### Migration Notes

**For existing sessions**:
- Users already in booth when this deploys will need to press R twice:
  1. First R: exits booth (old behavior still works)
  2. Second R: enters booth with new decoupled behavior

**For new sessions**:
- Everything works correctly from the start
- Booth and queue are cleanly separated

### Future Enhancements

Now that booth and queue are decoupled, we can:

1. **Multiple booth locations** - Place booths in different rooms, all control same queue
2. **Remote DJ mode** - Join queue without ever going to booth
3. **Booth animations** - Add different booth styles (turntables, laptop, etc.) without touching queue logic
4. **Guest DJ invites** - Let room owner promote anyone to DJ, regardless of booth location

### Code Locations

| File | What Changed |
|------|-------------|
| `client/src/characters/MyPlayer.ts` | Added `exitBoothIfConnected()` method |
| `client/src/components/DJQueuePanel.tsx` | Updated `handleLeaveQueue()` to call new method |
| `client/src/items/MusicBooth.ts` | Removed auto-leave-queue from `closeDialog()` |

### Related Docs

- [dj-queue-optimization-plan.md](./dj-queue-optimization-plan.md) - Performance improvements
- [bg-video-toggle-placement.md](./bg-video-toggle-placement.md) - UI enhancements
- [playlist-queue-suggestions.md](./playlist-queue-suggestions.md) - Feature roadmap
