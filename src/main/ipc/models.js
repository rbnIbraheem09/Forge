// src/main/ipc/models.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')
const { scanCheckpointsFolder } = require('../scanner/folder-scanner')

function registerModelsHandlers() {
  ipcMain.handle('models:scan', () => {
    const db = getDatabase()
    const folder = db.prepare("SELECT value FROM settings WHERE key = 'checkpoints_folder'").get()
    return scanCheckpointsFolder(folder ? folder.value : null)
  })

  ipcMain.handle('models:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT m.*, COUNT(i.id) as usage_count
      FROM models m
      LEFT JOIN iterations i ON i.checkpoint_id = m.id
      GROUP BY m.id
      ORDER BY usage_count DESC, m.name ASC
    `).all()
  })

  ipcMain.handle('models:get', (_e, { id }) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT m.*, COUNT(i.id) as usage_count,
        COUNT(DISTINCT i.main_gen_id) as main_gen_count
      FROM models m
      LEFT JOIN iterations i ON i.checkpoint_id = m.id
      WHERE m.id = ?
      GROUP BY m.id
    `).get(id)
  })

  ipcMain.handle('models:update', (_e, { id, notes }) => {
    const db = getDatabase()
    db.prepare('UPDATE models SET notes = ? WHERE id = ?').run(notes, id)
    return true
  })

  ipcMain.handle('models:usage', (_e, { id }) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id,
        mg.title as main_gen_title
      FROM iterations i
      JOIN main_gens mg ON mg.id = i.main_gen_id
      WHERE i.checkpoint_id = ?
      ORDER BY i.created_at DESC
    `).all(id)
  })

  ipcMain.handle('models:create', (_e, { name, file_path, notes }) => {
    const db = getDatabase()
    const result = db.prepare(
      'INSERT INTO models (name, file_path, notes) VALUES (?, ?, ?)'
    ).run(name.trim(), file_path || null, notes || null)
    return db.prepare('SELECT * FROM models WHERE id = ?').get(result.lastInsertRowid)
  })
}

module.exports = { registerModelsHandlers }
