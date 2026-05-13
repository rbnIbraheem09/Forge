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

  ipcMain.handle('models:update', (_e, { id, notes, recommended_cfg, recommended_steps }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (recommended_cfg !== undefined) {
      const clamped = recommended_cfg === null ? null : Math.min(30, Math.max(1, Number(recommended_cfg)))
      fields.push('recommended_cfg = ?'); values.push(clamped)
    }
    if (recommended_steps !== undefined) {
      const clamped = recommended_steps === null ? null : Math.min(150, Math.max(1, Math.round(Number(recommended_steps))))
      fields.push('recommended_steps = ?'); values.push(clamped)
    }
    if (fields.length === 0) return true
    db.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
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

  ipcMain.handle('models:merge', (_e, { keepId, deleteIds }) => {
    const db = getDatabase()
    return db.transaction(() => {
      for (const deleteId of deleteIds) {
        db.prepare('UPDATE iterations SET checkpoint_id = ? WHERE checkpoint_id = ?')
          .run(keepId, deleteId)
        db.prepare('DELETE FROM models WHERE id = ?').run(deleteId)
      }
      return true
    })()
  })
}

module.exports = { registerModelsHandlers }
