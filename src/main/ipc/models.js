// src/main/ipc/models.js
const { ipcMain, dialog, BrowserWindow } = require('electron')
const { getDatabase } = require('../db/database')
const { scanCheckpointsFolder } = require('../scanner/folder-scanner')
const { saveBufferAsExample, copyFileAsExample, unlinkExample } = require('../examples/example-images')

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
    const model = db.prepare(`
      SELECT m.*, COUNT(i.id) as usage_count,
        COUNT(DISTINCT i.main_gen_id) as main_gen_count
      FROM models m
      LEFT JOIN iterations i ON i.checkpoint_id = m.id
      WHERE m.id = ?
      GROUP BY m.id
    `).get(id)
    if (!model) return null
    model.example_images = db.prepare(`
      SELECT id, image_path, source, sort_order
      FROM model_example_images
      WHERE model_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(id)
    return model
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

  ipcMain.handle('models:add-example-image', (_e, payload) => {
    const db = getDatabase()
    const { source, entityId } = payload
    let imagePath
    let madeManagedFile = false

    if (source === 'paste') {
      const buf = Buffer.from(payload.pngBuffer)
      imagePath = saveBufferAsExample('models', entityId, buf, '.png')
      madeManagedFile = true
    } else if (source === 'file') {
      imagePath = copyFileAsExample('models', entityId, payload.sourcePath)
      madeManagedFile = true
    } else if (source === 'gallery') {
      const iter = db.prepare('SELECT image_path FROM iterations WHERE id = ?').get(payload.iterationId)
      if (!iter) throw new Error('iteration not found')
      imagePath = iter.image_path
    } else {
      throw new Error('unknown source: ' + source)
    }

    try {
      return db.transaction(() => {
        const maxRow = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as max FROM model_example_images WHERE model_id = ?'
        ).get(entityId)
        const sortOrder = maxRow.max + 1
        const result = db.prepare(
          'INSERT INTO model_example_images (model_id, image_path, source, sort_order) VALUES (?, ?, ?, ?)'
        ).run(entityId, imagePath, source, sortOrder)
        return { id: result.lastInsertRowid, image_path: imagePath, source, sort_order: sortOrder }
      })()
    } catch (err) {
      if (madeManagedFile) unlinkExample(imagePath)
      throw err
    }
  })

  ipcMain.handle('models:remove-example-image', (_e, { exampleId }) => {
    const db = getDatabase()
    const row = db.prepare('SELECT image_path, source FROM model_example_images WHERE id = ?').get(exampleId)
    if (!row) return false
    db.prepare('DELETE FROM model_example_images WHERE id = ?').run(exampleId)
    if (row.source === 'paste' || row.source === 'file') unlinkExample(row.image_path)
    return true
  })

  ipcMain.handle('models:pick-example-image-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Pick an example image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

module.exports = { registerModelsHandlers }
