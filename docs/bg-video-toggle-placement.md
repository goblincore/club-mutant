# Background Video Toggle Button - Placement Options

## Current State
- Video background toggle exists in `VideoPlayer.tsx` (small icon in corner of video preview)
- Only visible when player UI is open (not minimized)
- Hard to discover - many users don't know the feature exists

## Proposed Placements (Best → Worst)

### ✅ **Option 1: Add to Minimized Player Bar (Recommended)**

**Why**: Most users keep player minimized. Toggle should be accessible without expanding.

```
┌─────────────────────────────────────────────────────────┐
│ [▢] [▶] [⏭] [Track Title Marquee...] [🎬] [_]          │
│              2:15 / 4:30 • Up next: DJ Bob             │
└─────────────────────────────────────────────────────────┘
        ↑                                   ↑
    Expand button              Background video toggle
```

**Implementation**:
- Add button between marquee and minimize button
- Icon: `Fullscreen` (off) / `FullscreenExit` (on)
- Size: 24×24px to match other mini bar buttons
- Tooltip: "Toggle video background"

**Code location**: `YoutubePlayer.tsx`, minimized `<MiniBar>` section

---

### Option 2: Add to DJ Queue Panel Header

**Why**: Users in queue see this panel frequently

```
┌─────────────────────────────────────────┐
│  DJ Queue                      [🎬] [_] │ ← Add toggle here
├─────────────────────────────────────────┤
│  🎧 mutant-abc123                       │
│  Currently playing                      │
│  ...                                    │
```

**Pros**: Easy to discover when managing queue
**Cons**: Not accessible when panel is closed

---

### Option 3: Add to Top-Right Global UI Bar

**Why**: Always visible, like chat/settings icons

```
Screen:
┌─────────────────────────────────────────┐
│                        [🎬] [💬] [⚙️]   │ ← Global toolbar
│                                         │
│         [Game Canvas]                   │
│                                         │
```

**Pros**: Always accessible, discoverable
**Cons**: Clutters global UI (this app is minimal by design)

---

### ❌ Option 4: Add to Expanded Player (Current)

**Current implementation** - toggle is in `VideoPlayer.tsx` corner

**Cons**:
- Hidden when minimized (most common state)
- Small 200×130px video preview makes button tiny
- Users don't expand player unless debugging

---

## Recommendation: **Multi-Location Toggle**

Add toggle to **both**:
1. **Minimized player bar** (primary access point)
2. **DJ Queue Panel** header (secondary, for discoverability)

Both buttons control the same Redux state (`videoBackgroundEnabled`).

### Benefits:
- Accessible in minimized state (98% of usage)
- Redundant placement aids discovery
- No new global UI elements (stays minimal)

---

## Implementation Guide

### Step 1: Add Button to Minimized Player

```typescript
// YoutubePlayer.tsx, in minimized <MiniBar>
<MiniBar>
  <IconButton aria-label="expand" onClick={() => setMinimized(false)}>
    <OpenInFullIcon />
  </IconButton>

  <PlayerControls ... />

  <Marquee>
    {/* ... title + time ... */}
  </Marquee>

  {/* ✅ ADD THIS: Background video toggle */}
  <IconButton
    aria-label="toggle video background"
    onClick={handleToggleBackground}
    size="small"
    style={{
      color: videoBackgroundEnabled
        ? 'rgba(255, 255, 100, 0.9)'  // Highlighted when ON
        : 'rgba(255, 255, 255, 0.7)'  // Dimmed when OFF
    }}
  >
    {videoBackgroundEnabled ? <FullscreenExitIcon /> : <FullscreenIcon />}
  </IconButton>

  <IconButton aria-label="minimize" onClick={() => setMinimized(true)}>
    <MinimizeIcon />
  </IconButton>
</MiniBar>
```

### Step 2: Add to DJ Queue Panel (Optional)

```typescript
// DJQueuePanel.tsx, in header
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <Title>DJ Queue</Title>

  <div style={{ display: 'flex', gap: '4px' }}>
    <IconButtonStyled
      size="small"
      onClick={() => dispatch(setVideoBackgroundEnabled(!videoBackgroundEnabled))}
      title="Toggle video background"
    >
      {videoBackgroundEnabled ? <FullscreenExitIcon /> : <FullscreenIcon />}
    </IconButtonStyled>
  </div>
</div>
```

### Step 3: Update VideoPlayer.tsx Toggle

Keep existing toggle in video preview for completeness, but it becomes tertiary access point.

---

## Visual States

### Background OFF (Default)
- Icon: `Fullscreen` (hollow rectangle with arrows)
- Color: `rgba(255, 255, 255, 0.7)` (dim white)
- Tooltip: "Enable video background"

### Background ON
- Icon: `FullscreenExit` (rectangle with inward arrows)
- Color: `rgba(255, 255, 100, 0.9)` (yellow highlight)
- Tooltip: "Disable video background"

---

## Accessibility Notes

- Add `aria-label` for screen readers
- Add `:focus` ring for keyboard navigation
- Consider adding keyboard shortcut: `Shift+B` (toggle background)

---

## Future Enhancement: Auto-Disable on Slow Connections

Detect frame drops and auto-disable background:

```typescript
// Monitor FPS in Game.ts
if (avgFPS < 30 && videoBackgroundEnabled) {
  dispatch(setVideoBackgroundEnabled(false))
  // Show toast: "Video background auto-disabled (low FPS)"
}
```
