// src/main/ipc/iterations.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerIterationsHandlers() {
  ipcMain.handle('iterations:list', (_e, { mainGenId }) => {
    const db = getDatabase()
    const iterations = db.prepare(`
      SELECT i.*, m.name as checkpoint_name
      FROM iterations i
      LEFT JOIN models m ON m.id = i.checkpoint_id
      WHERE i.main_gen_id = ?
      ORDER BY i.iteration_number ASC
    `).all(mainGenId)

    for (const iter of iterations) {
      iter.loras = db.prepare(`
        SELECT l.id, l.name, il.weight
        FROM iteration_loras il
        JOIN loras l ON l.id = il.lora_id
        WHERE il.iteration_id = ?
      `).all(iter.id)
    }
    return iterations
  })

  ipcMain.handle('iterations:list-all', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id,
        mg.title as main_gen_title
      FROM iterations i
      JOIN main_gens mg ON mg.id = i.main_gen_id
      ORDER BY i.created_at DESC
    `).all()
  })

  ipcMain.handle('iterations:get', (_e, { id }) => {
    const db = getDatabase()
    const iter = db.prepare(`
      SELECT i.*, m.name as checkpoint_name
      FROM iterations i
      LEFT JOIN models m ON m.id = i.checkpoint_id
      WHERE i.id = ?
    `).get(id)
    if (!iter) return null
    iter.loras = db.prepare(`
      SELECT l.id, l.name, il.weight
      FROM iteration_loras il
      JOIN loras l ON l.id = il.lora_id
      WHERE il.iteration_id = ?
    `).all(id)
    iter.custom_fields = db.prepare(
      'SELECT id, field_key, field_value FROM iteration_custom_fields WHERE iteration_id = ? ORDER BY id'
    ).all(id)
    return iter
  })

  ipcMain.handle('iterations:create', (_e, { mainGenId, imagePath, extractedMetadata }) => {
    const db = getDatabase()
    return db.transaction(() => {
      const maxRow = db.prepare(
        'SELECT COALESCE(MAX(iteration_number), 0) as max FROM iterations WHERE main_gen_id = ?'
      ).get(mainGenId)
      const iterNum = maxRow.max + 1
      const meta = extractedMetadata || {}

      let checkpointId = null
      if (meta.checkpoint_name) {
        const model = db.prepare('SELECT id FROM models WHERE name = ?').get(meta.checkpoint_name)
        if (model) checkpointId = model.id
      }

      const result = db.prepare(`
        INSERT INTO iterations
          (main_gen_id, iteration_number, image_path, prompt, negative_prompt,
           seed, steps, cfg, sampler, scheduler, width, height, checkpoint_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mainGenId, iterNum, imagePath,
        meta.prompt || null, meta.negative_prompt || null,
        meta.seed || null, meta.steps || null, meta.cfg || null,
        meta.sampler || null, meta.scheduler || null,
        meta.width || null, meta.height || null, checkpointId
      )

      if (meta.loras) {
        for (const l of meta.loras) {
          const loraRow = db.prepare('SELECT id FROM loras WHERE name = ?').get(l.name)
          if (loraRow) {
            db.prepare(
              'INSERT OR IGNORE INTO iteration_loras (iteration_id, lora_id, weight) VALUES (?, ?, ?)'
            ).run(result.lastInsertRowid, loraRow.id, l.weight)
          }
        }
      }

      db.prepare('UPDATE main_gens SET updated_at = datetime("now") WHERE id = ?').run(mainGenId)
      return { id: result.lastInsertRowid, iteration_number: iterNum }
    })()
  })

  ipcMain.handle('iterations:update', (_e, { id, title, starred, notes, tags }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (title !== undefined) { fields.push('title = ?'); values.push(title) }
    if (starred !== undefined) {
      fields.push('starred = ?'); values.push(starred ? 1 : 0)
      fields.push('starred_at = ?'); values.push(starred ? new Date().toISOString() : null)
    }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (tags !== undefined) { fields.push('tags = ?'); values.push(tags) }
    if (fields.length === 0) return true
    db.prepare(`UPDATE iterations SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })

  ipcMain.handle('iterations:delete', (_e, { id }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM iterations WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('iterations:set-loras', (_e, { id, loras }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM iteration_loras WHERE iteration_id = ?').run(id)
    for (const l of loras) {
      db.prepare(
        'INSERT OR IGNORE INTO iteration_loras (iteration_id, lora_id, weight) VALUES (?, ?, ?)'
      ).run(id, l.loraId, l.weight)
    }
    return true
  })

  ipcMain.handle('iterations:set-custom-fields', (_e, { id, fields }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM iteration_custom_fields WHERE iteration_id = ?').run(id)
    for (const f of fields) {
      db.prepare(
        'INSERT INTO iteration_custom_fields (iteration_id, field_key, field_value) VALUES (?, ?, ?)'
      ).run(id, f.key, f.value)
    }
    return true
  })

  ipcMain.handle('global-fields:list', () => {
    const db = getDatabase()
    return db.prepare('SELECT field_key FROM global_field_templates ORDER BY id').all().map(r => r.field_key)
  })

  ipcMain.handle('global-fields:pin', (_e, { key }) => {
    const db = getDatabase()
    db.prepare('INSERT OR IGNORE INTO global_field_templates (field_key) VALUES (?)').run(key)
    return true
  })

  ipcMain.handle('global-fields:unpin', (_e, { key }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM global_field_templates WHERE field_key = ?').run(key)
    return true
  })
}

module.exports = { registerIterationsHandlers }
