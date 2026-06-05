// src/main/ipc/system.js
const { ipcMain, shell } = require('electron')

function registerSystemHandlers() {
  ipcMain.handle('system:open-external', async (_e, url) => {
    if (typeof url !== 'string') return false
    let parsed
    try { parsed = new URL(url) } catch { return false }
    // Only allow web + mail links — never file:, etc.
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return false
    await shell.openExternal(url)
    return true
  })
}

module.exports = { registerSystemHandlers }
