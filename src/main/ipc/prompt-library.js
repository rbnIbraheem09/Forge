// src/main/ipc/prompt-library.js
//
// IPC handlers for the Danbooru tag library: search, status, and refresh.

const { ipcMain, BrowserWindow } = require('electron')
const { getDatabase } = require('../db/database')
const { downloadCsv } = require('../tags/downloader')
const { importCsv, indexEmbeddings } = require('../tags/indexer')
const { searchTags, unloadEmbeddingCache } = require('../tags/search')

let refreshInProgress = false

function registerPromptLibraryHandlers() {
  ipcMain.handle('prompt:search-tags', async (_e, { query, options }) => {
    return searchTags(query, options || {})
  })

  ipcMain.handle('prompt:library-status', () => {
    const db = getDatabase()
    const countRow = db.prepare('SELECT COUNT(*) as c FROM danbooru_tags').get()
    const indexedRow = db.prepare(
      'SELECT COUNT(*) as c FROM danbooru_tags WHERE embedding IS NOT NULL'
    ).get()
    const versionRow = db.prepare("SELECT value FROM settings WHERE key = 'danbooru_library_version'").get()
    return {
      count: countRow.c,
      indexed_count: indexedRow.c,
      indexed: indexedRow.c > 0 && indexedRow.c === countRow.c,
      version: versionRow ? versionRow.value : null,
      refreshInProgress,
    }
  })

  ipcMain.handle('prompt:library-refresh', async (event) => {
    if (refreshInProgress) {
      return { ok: false, reason: 'Refresh already in progress' }
    }
    refreshInProgress = true

    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload) => {
      if (win && !win.isDestroyed()) win.webContents.send('prompt:library-progress', payload)
    }

    const db = getDatabase()

    try {
      emit({ phase: 'download', current: 0, total: 0 })
      const dl = await downloadCsv((p) => emit(p))

      emit({ phase: 'parse', current: 0, total: 0 })
      // Drop the in-memory embedding cache before wiping the table.
      unloadEmbeddingCache()
      const imp = await importCsv(dl.path, (p) => emit(p))

      emit({ phase: 'embed', current: 0, total: imp.inserted })
      const idx = await indexEmbeddings((p) => emit(p))

      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run('danbooru_library_version', now)
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run('danbooru_library_count', String(imp.inserted))
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run('danbooru_library_indexed', idx.indexed === imp.inserted ? 'true' : 'false')

      emit({ phase: 'done', current: imp.inserted, total: imp.inserted })
      return { ok: true, inserted: imp.inserted, indexed: idx.indexed }
    } catch (err) {
      emit({ phase: 'error', message: String(err && err.message || err) })
      return { ok: false, reason: String(err && err.message || err) }
    } finally {
      refreshInProgress = false
    }
  })
}

module.exports = { registerPromptLibraryHandlers }
