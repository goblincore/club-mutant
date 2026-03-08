# Club Mutant Electron Implementation

## Overview

This document describes the Electron implementation for Club Mutant, which wraps the existing React/Phaser web application as a desktop application while maintaining full compatibility with the web version.

## Goals

1. **Dual Platform Support**: Maintain both web and Electron versions working simultaneously
2. **Native Features**: Add desktop-specific features (file system, auto-updater, native notifications)
3. **No CORS Restrictions**: Remove browser CORS limitations for API calls
4. **Better Storage**: Move beyond localStorage limitations
5. **Native Feel**: Provide a desktop application experience

## Current Implementation Status

### ✅ Completed Features

#### 1. Core Electron Shell
- **Main Process** (`electron/main.js`): Window management, IPC handlers, app lifecycle
- **Preload Script** (`electron/preload.js`): Secure bridge between main and renderer processes
- **TypeScript Support**: Full type definitions for Electron API

#### 2. File System Integration
- **Export Playlists**: Save playlists as JSON files to disk
- **Import Playlists**: Load playlists from JSON files
- **Cross-Platform**: Works on macOS and Windows (primary targets)
- **Web Fallback**: Same code works in browser using blob downloads

#### 3. Native API Abstraction
- **Unified API** (`src/services/NativeApi.ts`): Single interface for web and Electron
- **Auto-Detection**: Automatically detects if running in Electron
- **Seamless Fallback**: Web version uses standard browser APIs

#### 4. Build System
- **Development**: `npm run dev` (Vite) + `npx electron .` (Electron)
- **Production**: `npm run dist` creates installers for macOS and Windows
- **Hot Reload**: Vite dev server works with Electron

### 🔄 In Progress / Planned Features

#### 1. Auto-Updater
- **electron-updater** integration
- Check for updates on startup
- Silent background downloads
- User notification for restart

#### 2. Native Notifications
- Desktop notifications for:
  - New chat messages
  - DJ changes
  - Room events
- System notification center integration

#### 3. Enhanced Storage
- **electron-store** for persistent settings
- Larger storage capacity than localStorage
- Encrypted storage option
- Better data structure support

#### 4. System Integration
- **Global Hotkeys**: Media keys for play/pause/skip
- **System Tray**: Minimize to tray
- **Window State**: Remember position and size
- **Protocol Handler**: `clubmutant://` deep links

#### 5. Performance Optimizations
- **Background Throttling**: Reduce CPU when minimized
- **Memory Management**: Better garbage collection hints
- **GPU Acceleration**: Optimal Phaser rendering

## Architecture

### Project Structure

```
client/
├── electron/               # Electron-specific code
│   ├── main.js            # Main process (CommonJS)
│   ├── main.ts            # Main process source (TypeScript)
│   ├── preload.js         # Preload script (CommonJS)
│   ├── preload.ts         # Preload script source
│   └── tsconfig.json      # TypeScript config for Electron
├── src/
│   ├── services/
│   │   └── NativeApi.ts   # Cross-platform API abstraction
│   ├── types/
│   │   └── electron.d.ts  # TypeScript declarations
│   └── components/
│       └── ElectronFeatures.tsx  # Demo component
├── package.json           # Updated with Electron scripts
└── vite.config.ts         # Vite config with Electron support
```

### Key Design Decisions

1. **Context Isolation**: Enabled for security
2. **Node Integration**: Disabled in renderer (security best practice)
3. **Web Security**: Disabled for CORS (intentional for this use case)
4. **TypeScript**: Full type safety across main and renderer processes
5. **Dual Entry**: Web and Electron share the same React codebase

## How It Works

### Electron Detection

```typescript
// src/services/NativeApi.ts
export const isElectron = () => {
  return typeof window !== 'undefined' && 
         window.electronAPI?.isElectron === true
}
```

The app checks for `window.electronAPI` which is injected by the preload script only in Electron.

### File Operations

**Electron Path:**
1. User clicks "Export Playlist"
2. `nativeFileSystem.exportPlaylist()` checks `isElectron()`
3. Calls `window.electronAPI.saveFileDialog()` via IPC
4. Main process opens native save dialog
5. File written to selected location

**Web Path:**
1. Same function called
2. Falls back to blob download
3. Browser handles save dialog

### IPC Communication

```typescript
// Renderer → Main
window.electronAPI.saveFileDialog({ content, defaultPath })

// Main process handles it
ipcMain.handle('dialog:saveFile', async (_, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {...})
  if (!result.canceled && result.filePath) {
    await fs.writeFile(result.filePath, data.content, 'utf-8')
  }
  return result
})
```

## Usage

### Development

```bash
# Terminal 1: Start Vite dev server
cd client
npm run dev

# Terminal 2: Start Electron
cd client
npx electron .
```

### Building

```bash
# Build for current platform
cd client
npm run dist

# Build for specific platforms
npm run dist:mac    # macOS (.dmg, .zip)
npm run dist:win    # Windows (.exe, .portable)
```

### Testing Features

1. **Electron Detection**: Look for "Electron v0.1.0" badge in bottom-left corner
2. **Export Playlist**: Click "Export Playlist" button, choose save location
3. **Import Playlist**: Click "Import Playlist", select JSON file
4. **CORS**: Make API calls without browser restrictions

## Advantages Over Web Version

### 1. No CORS Restrictions
- Direct API calls to any endpoint
- No proxy server needed for external APIs
- Simplified YouTube integration

### 2. File System Access
- Export/import playlists as files
- Drag-and-drop file support
- Persistent storage beyond localStorage limits

### 3. Native Experience
- Desktop app feel with native window chrome
- System tray integration (planned)
- Global keyboard shortcuts (planned)

### 4. Better Audio/Video
- No autoplay restrictions
- Direct audio device selection
- Lower latency for real-time features

### 5. Distribution
- Standalone installers
- Auto-updater (planned)
- No browser compatibility issues

## Trade-offs

### 1. Larger Download
- ~100MB vs instant web load
- Electron runtime included

### 2. Update Friction
- Users must download updates
- Not instant like web deploy

### 3. Platform Builds
- Need separate builds for each OS
- macOS requires code signing for distribution

## Security Considerations

### Current Measures
- ✅ Context isolation enabled
- ✅ Node integration disabled in renderer
- ✅ Preload script validates all IPC calls
- ✅ External links open in system browser

### Disabled Protections (Intentional)
- ⚠️ Web security disabled for CORS
- ⚠️ CSP not strictly enforced

### Recommendations
- Review all IPC handlers for injection vulnerabilities
- Validate all file paths before operations
- Use electron-store for sensitive data (encryption available)
- Consider enabling CSP in production

## Future Roadmap

### Phase 1: Core (Completed)
- [x] Basic Electron shell
- [x] File system integration
- [x] Cross-platform builds

### Phase 2: Polish (In Progress)
- [ ] Auto-updater
- [ ] Native notifications
- [ ] System tray
- [ ] Window state persistence

### Phase 3: Advanced Features
- [ ] Global hotkeys
- [ ] Protocol handlers
- [ ] Better storage (electron-store)
- [ ] Performance optimizations

### Phase 4: Distribution
- [ ] Code signing (macOS)
- [ ] App Store submission
- [ ] Windows Store submission
- [ ] Linux packages

## Troubleshooting

### Common Issues

**1. Electron shows default page instead of app**
- Ensure Vite dev server is running on port 5173
- Check that `main` field in package.json points to `electron/main.js`

**2. Import errors in Electron**
- Make sure all imports use relative paths correctly
- TypeScript declaration files should not be imported directly

**3. CORS still blocked**
- Verify `webSecurity: false` in main.js webPreferences
- Check that you're running the Electron build, not browser

**4. File dialogs not opening**
- Ensure mainWindow is not null when calling dialog methods
- Check that IPC handlers are registered before renderer loads

## Contributing

When adding Electron-specific features:

1. **Always provide web fallback** in `NativeApi.ts`
2. **Use IPC for main process communication** - never use Node APIs directly in renderer
3. **Add TypeScript declarations** in `src/types/electron.d.ts`
4. **Test both web and Electron** versions before committing
5. **Update this documentation** with new features

## References

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [electron-updater](https://github.com/electron-userland/electron-updater)
- [electron-store](https://github.com/sindresorhus/electron-store)

## Changelog

### 2024-02-03
- Initial Electron implementation
- File system integration (export/import playlists)
- Native API abstraction layer
- Cross-platform build configuration
- TypeScript support for Electron APIs
