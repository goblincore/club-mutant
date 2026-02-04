import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import { isElectron, nativeFileSystem } from '../services/NativeApi'

const Container = styled.div`
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 100;
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.7);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
`

const StatusText = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  display: flex;
  align-items: center;
`

export default function ElectronFeatures() {
  const [electronDetected, setElectronDetected] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [lastAction, setLastAction] = useState('')

  useEffect(() => {
    const detected = isElectron()
    setElectronDetected(detected)
    
    if (detected && window.electronAPI) {
      window.electronAPI.getAppVersion().then(version => {
        setAppVersion(version)
      })
    }
  }, [])

  const handleExport = async () => {
    const testPlaylist = {
      name: 'Test Playlist',
      created: new Date().toISOString(),
      tracks: [
        { id: '1', title: 'Test Track 1', url: 'https://youtube.com/test1' },
        { id: '2', title: 'Test Track 2', url: 'https://youtube.com/test2' },
      ]
    }
    
    const result = await nativeFileSystem.exportPlaylist(testPlaylist, 'my-playlist.json')
    if (!result.canceled) {
      setLastAction(`Exported to: ${result.filePath || 'downloads'}`)
    }
  }

  const handleImport = async () => {
    const playlist = await nativeFileSystem.importPlaylist()
    if (playlist) {
      setLastAction(`Imported: ${(playlist as any).name || 'Unknown playlist'}`)
      console.log('Imported playlist:', playlist)
    }
  }

  return (
    <Container>
      <StatusText>
        {electronDetected ? `Electron v${appVersion}` : 'Web Mode'}
      </StatusText>
      
      <Button 
        variant="outlined" 
        size="small"
        onClick={handleExport}
        sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
      >
        Export Playlist
      </Button>
      
      <Button 
        variant="outlined" 
        size="small"
        onClick={handleImport}
        sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
      >
        Import Playlist
      </Button>
      
      {lastAction && (
        <StatusText>{lastAction}</StatusText>
      )}
    </Container>
  )
}
