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

  ipcMain.handle('settings:setApiKey', (_event, { key, plaintext }) => {
    const { safeStorage } = require('electron')
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: 'OS keychain unavailable' }
    }
    const db = getDatabase()
    if (plaintext === null || plaintext === '' || plaintext === undefined) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(key)
      return { ok: true, cleared: true }
    }
    const encrypted = safeStorage.encryptString(plaintext)
    const base64 = encrypted.toString('base64')
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, base64)
    return { ok: true }
  })

  ipcMain.handle('settings:hasApiKey', (_event, { key }) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return !!row && !!row.value
  })

  ipcMain.handle('settings:testApiKey', async (_event, { key, baseUrl }) => {
    const { safeStorage } = require('electron')
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row || !row.value) return { ok: false, reason: 'No API key set' }
    let plaintext
    try {
      plaintext = safeStorage.decryptString(Buffer.from(row.value, 'base64'))
    } catch (err) {
      return { ok: false, reason: 'Failed to decrypt API key — keychain may be unavailable' }
    }
    try {
      const resp = await fetch((baseUrl || 'https://api.deepseek.com/v1') + '/models', {
        headers: { Authorization: 'Bearer ' + plaintext },
      })
      if (resp.ok) return { ok: true }
      return { ok: false, reason: `HTTP ${resp.status} ${resp.statusText}` }
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) }
    }
  })
}

function getDecryptedSetting(key) {
  const { safeStorage } = require('electron')
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row || !row.value) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.value, 'base64'))
  } catch (err) {
    return null
  }
}

module.exports = { registerSettingsHandlers, getDecryptedSetting }
