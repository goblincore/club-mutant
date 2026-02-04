import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (data: { content: string; defaultPath?: string }) => 
    ipcRenderer.invoke('dialog:saveFile', data),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  isElectron: true,
})

declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<{ canceled: boolean; filePaths?: string[] }>
      saveFileDialog: (data: { content: string; defaultPath?: string }) => 
        Promise<{ canceled: boolean; filePath?: string }>
      getAppVersion: () => Promise<string>
      isElectron: boolean
    }
  }
}
