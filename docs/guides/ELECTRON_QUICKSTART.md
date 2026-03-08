# Electron Quick Start Guide

## Prerequisites

- Node.js installed
- Club Mutant server running locally (for development)
- Vite dev server running

## Running in Development

### Step 1: Start the Server

```bash
cd /Users/donny/Projects/2026/club-mutant
npm run start
```

### Step 2: Start Vite Dev Server

In a new terminal:

```bash
cd /Users/donny/Projects/2026/club-mutant/client
npm run dev
```

### Step 3: Start Electron

In another terminal:

```bash
cd /Users/donny/Projects/2026/club-mutant/client
npx electron .
```

The Electron window should open showing the Club Mutant app.

## Testing Features

### Verify Electron is Working

1. Look for the badge in the **bottom-left corner** showing "Electron v0.1.0"
2. If you see "Web Mode" instead, Electron detection isn't working

### Test File Export

1. Click the **"Export Playlist"** button
2. Choose a location to save the JSON file
3. Verify the file contains playlist data

### Test File Import

1. Click the **"Import Playlist"** button
2. Select a previously exported JSON file
3. Check console for imported data

### Verify No CORS

1. Open DevTools (Cmd+Option+I on Mac)
2. Try making a fetch request to any API
3. It should work without CORS errors

## Building for Production

### Build Installers

```bash
cd /Users/donny/Projects/2026/club-mutant/client

# Build for current platform
npm run dist

# Build for macOS
npm run dist:mac

# Build for Windows
npm run dist:win
```

### Output Location

Built installers will be in:
- macOS: `client/release/Club Mutant-0.1.0.dmg`
- Windows: `client/release/Club Mutant Setup 0.1.0.exe`

## Troubleshooting

### "Electron shows default page"

**Problem**: You see the Electron welcome page instead of Club Mutant

**Solution**: 
1. Make sure Vite is running on port 5173
2. Check that `client/package.json` has `"main": "electron/main.js"`
3. Verify `electron/main.js` exists

### "Import errors in console"

**Problem**: TypeScript import errors

**Solution**:
1. Don't import `.d.ts` files directly
2. Use triple-slash references: `/// <reference path="..." />`
3. Or rely on automatic type resolution

### "File dialogs don't open"

**Problem**: Clicking export/import does nothing

**Solution**:
1. Check that `window.electronAPI` exists in console
2. Verify preload script is loading
3. Check main process logs for errors

### "CORS errors still happening"

**Problem**: API calls blocked by CORS

**Solution**:
1. Ensure you're running the Electron app, not browser
2. Check that `webSecurity: false` is set in `electron/main.js`
3. Restart Electron after changing main.js

## Development Tips

### Hot Reload

- Vite automatically reloads renderer changes
- Main process changes require Electron restart
- Preload script changes require Electron restart

### Debugging

**Renderer Process**:
- Use DevTools (Cmd+Option+I)
- Console logs appear here
- Network tab shows all requests

**Main Process**:
- Logs appear in terminal where you ran `npx electron .`
- Use `console.log()` in main.js

### File Structure

```
client/
├── electron/
│   ├── main.js          # Main process - window management
│   ├── preload.js       # Preload script - secure bridge
│   └── *.ts             # TypeScript sources
├── src/
│   ├── services/
│   │   └── NativeApi.ts # Cross-platform API
│   └── types/
│       └── electron.d.ts # Type definitions
```

### Adding New Features

1. **Add IPC handler in main.js**:
```javascript
ipcMain.handle('myFeature', async () => {
  // Do something in main process
  return result
})
```

2. **Expose in preload.js**:
```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods
  myFeature: () => ipcRenderer.invoke('myFeature')
})
```

3. **Add types in electron.d.ts**:
```typescript
interface Window {
  electronAPI?: {
    // ... existing methods
    myFeature: () => Promise<SomeType>
  }
}
```

4. **Use in NativeApi.ts**:
```typescript
export const myFeature = async () => {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.myFeature()
  }
  // Web fallback
}
```

## Next Steps

See [ELECTRON.md](./ELECTRON.md) for:
- Detailed architecture
- Planned features
- Security considerations
- Full API documentation
