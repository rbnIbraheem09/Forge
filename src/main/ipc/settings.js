const { ipcMain, dialog } = require('electron')
const { getDatabase } = require('../db/database')

function registerSettingsHandlers() {
  ipcMain.handle('settings:get', (_event, key) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? row.value : null
  })

  ipcMain.handle('settings:set', (_event, { key, value }) => {
    const db = getDatabase()
    if (value === null || value === undefined) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(key)
    } else {
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run(key, value)
    }
    return true
  })

  ipcMain.handle('settings:getAll', () => {
    const db = getDatabase()
    const rows = db.prepare('SELECT key, value FROM settings').all()
    const result = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  })

  ipcMain.handle('settings:openFolderPicker', async (event) => {
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

module.exports = { registerSettingsHandlers }
