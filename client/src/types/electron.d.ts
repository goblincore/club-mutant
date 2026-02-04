interface ElectronAPI {
  isElectron: boolean
  saveFile: (data: string, filename: string) => Promise<string | null>
  readFile: () => Promise<{ data: string; filename: string } | null>
  getAppVersion: () => Promise<string>
  saveFileDialog: (options: {
    content: string
    defaultPath: string
  }) => Promise<{ canceled: boolean; filePath?: string }>
  openFileDialog: () => Promise<{ canceled: boolean; filePaths?: string[] }>
}

interface Window {
  electronAPI?: ElectronAPI
}
