"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: () => electron_1.ipcRenderer.invoke('dialog:openFile'),
    saveFileDialog: (data) => electron_1.ipcRenderer.invoke('dialog:saveFile', data),
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
    isElectron: true,
});
