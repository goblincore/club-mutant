export const isElectron = () => {
  return typeof window !== 'undefined' && 
         window.electronAPI?.isElectron === true
}

export const nativeFileSystem = {
  async exportPlaylist(playlistData: object, filename: string) {
    if (isElectron() && window.electronAPI) {
      return window.electronAPI.saveFileDialog({
        content: JSON.stringify(playlistData, null, 2),
        defaultPath: filename,
      })
    } else {
      const blob = new Blob([JSON.stringify(playlistData, null, 2)], 
        { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return { canceled: false }
    }
  },

  async importPlaylist(): Promise<object | null> {
    if (isElectron() && window.electronAPI) {
      const result = await window.electronAPI.openFileDialog()
      if (!result.canceled && result.filePaths?.[0]) {
        const response = await fetch(result.filePaths[0])
        return response.json()
      }
      return null
    } else {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) {
            const text = await file.text()
            resolve(JSON.parse(text))
          } else {
            resolve(null)
          }
        }
        input.click()
      })
    }
  },
}

export const nativeStorage = {
  get: (key: string) => {
    return localStorage.getItem(key)
  },
  
  set: (key: string, value: string) => {
    localStorage.setItem(key, value)
  },
}
