interface ElectronAPI {
  saveFile: (data: string, filename: string) => Promise<string | null>
  readFile: () => Promise<{ data: string; filename: string } | null>
  getAppVersion: () => Promise<string>
}

interface Window {
  electronAPI?: ElectronAPI
}
