// src/main/ipc/loras.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')
const { scanLorasFolder } = require('../scanner/folder-scanner')

function registerLorasHandlers() {
  ipcMain.handle('loras:scan', () => {
    const db = getDatabase()
    const folder = db.prepare("SELECT value FROM settings WHERE key = 'loras_folder'").get()
    return scanLorasFolder(folder ? folder.value : null)
  })

  ipcMain.handle('loras:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT l.*, COUNT(il.iteration_id) as usage_count
      FROM loras l
      LEFT JOIN iteration_loras il ON il.lora_id = l.id
      GROUP BY l.id
      ORDER BY usage_count DESC, l.name ASC
    `).all()
  })

  ipcMain.handle('loras:get', (_e, { id }) => {
    const db = getDatabase()
    const lora = db.prepare(`
      SELECT l.*,
        COUNT(il.iteration_id) as usage_count,
        AVG(il.weight) as avg_weight,
        COUNT(DISTINCT i.main_gen_id) as main_gen_count
      FROM loras l
      LEFT JOIN iteration_loras il ON il.lora_id = l.id
      LEFT JOIN iterations i ON i.id = il.iteration_id
      WHERE l.id = ?
      GROUP BY l.id
    `).get(id)
    return lora
  })

  ipcMain.handle('loras:update', (_e, { id, notes, default_weight, trigger_words, recommended_strength }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (default_weight !== undefined) { fields.push('default_weight = ?'); values.push(default_weight) }
    if (trigger_words !== undefined) { fields.push('trigger_words = ?'); values.push(trigger_words) }
    if (recommended_strength !== undefined) {
      const clamped = recommended_strength === null ? null : Math.min(2, Math.max(0, Number(recommended_strength)))
      fields.push('recommended_strength = ?'); values.push(clamped)
    }
    if (fields.length === 0) return true
    db.prepare(`UPDATE loras SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })

  ipcMain.handle('loras:usage', (_e, { id, minWeight, maxWeight, checkpointId }) => {
    const db = getDatabase()
    let query = `
      SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id, il.weight,
        mg.title as main_gen_title
      FROM iteration_loras il
      JOIN iterations i ON i.id = il.iteration_id
      JOIN main_gens mg ON mg.id = i.main_gen_id
      WHERE il.lora_id = ?
    `
    const params = [id]
    if (minWeight !== undefined) { query += ' AND il.weight >= ?'; params.push(minWeight) }
    if (maxWeight !== undefined) { query += ' AND il.weight <= ?'; params.push(maxWeight) }
    if (checkpointId) { query += ' AND i.checkpoint_id = ?'; params.push(checkpointId) }
    query += ' ORDER BY i.created_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('loras:create', (_e, { name, file_path, notes, default_weight }) => {
    const db = getDatabase()
    const result = db.prepare(
      'INSERT INTO loras (name, file_path, notes, default_weight) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), file_path || null, notes || null, default_weight || 1.0)
    return db.prepare('SELECT * FROM loras WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('loras:merge', (_e, { keepId, deleteIds }) => {
    const db = getDatabase()
    return db.transaction(() => {
      for (const deleteId of deleteIds) {
        // Reassign iteration_loras, skipping any that would conflict on the primary key
        const rows = db.prepare('SELECT iteration_id, weight FROM iteration_loras WHERE lora_id = ?').all(deleteId)
        for (const row of rows) {
          const conflict = db.prepare(
            'SELECT 1 FROM iteration_loras WHERE iteration_id = ? AND lora_id = ?'
          ).get(row.iteration_id, keepId)
          if (!conflict) {
            db.prepare('UPDATE iteration_loras SET lora_id = ? WHERE iteration_id = ? AND lora_id = ?')
              .run(keepId, row.iteration_id, deleteId)
          } else {
            db.prepare('DELETE FROM iteration_loras WHERE iteration_id = ? AND lora_id = ?')
              .run(row.iteration_id, deleteId)
          }
        }
        db.prepare('DELETE FROM loras WHERE id = ?').run(deleteId)
      }
      return true
    })()
  })
}

module.exports = { registerLorasHandlers }
