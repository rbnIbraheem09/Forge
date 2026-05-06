const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('forge', {
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    openFolderPicker: () => ipcRenderer.invoke('settings:openFolderPicker'),
  },
})
