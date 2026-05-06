// src/main/ipc/inbox.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function randomHeroColor() {
  const hue = Math.floor(Math.random() * 360)
  const sat = 30 + Math.floor(Math.random() * 30)
  const light = 20 + Math.floor(Math.random() * 15)
  return hslToHex(hue, sat, light)
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function registerInboxHandlers() {
  ipcMain.handle('inbox:list', () => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM inbox_items ORDER BY detected_at DESC').all()
  })

  ipcMain.handle('inbox:count', () => {
    const db = getDatabase()
    return db.prepare('SELECT COUNT(*) as n FROM inbox_items').get().n
  })

  ipcMain.handle('inbox:dismiss', (_e, { ids }) => {
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`DELETE FROM inbox_items WHERE id IN (${placeholders})`).run(...ids)
    return true
  })

  ipcMain.handle('inbox:assign', (_e, { itemIds, mainGenId, newTitle }) => {
    const db = getDatabase()

    return db.transaction(() => {
      let targetId = mainGenId

      if (!targetId && newTitle) {
        const heroColor = randomHeroColor()
        const result = db.prepare(
          'INSERT INTO main_gens (title, hero_color) VALUES (?, ?)'
        ).run(newTitle.trim(), heroColor)
        targetId = result.lastInsertRowid
      }

      if (!targetId) throw new Error('Must provide mainGenId or newTitle')

      const maxRow = db.prepare(
        'SELECT COALESCE(MAX(iteration_number), 0) as max FROM iterations WHERE main_gen_id = ?'
      ).get(targetId)
      let nextNumber = maxRow.max + 1

      const items = db.prepare(
        `SELECT * FROM inbox_items WHERE id IN (${itemIds.map(() => '?').join(',')})`
      ).all(...itemIds)

      for (const item of items) {
        const meta = item.extracted_metadata ? JSON.parse(item.extracted_metadata) : {}

        let checkpointId = null
        if (meta.checkpoint_name) {
          const model = db.prepare('SELECT id FROM models WHERE name = ?').get(meta.checkpoint_name)
          if (model) checkpointId = model.id
        }

        const iter = db.prepare(`
          INSERT INTO iterations
            (main_gen_id, iteration_number, image_path, prompt, negative_prompt,
             seed, steps, cfg, sampler, scheduler, width, height, checkpoint_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetId, nextNumber, item.image_path,
          meta.prompt || null, meta.negative_prompt || null,
          meta.seed || null, meta.steps || null, meta.cfg || null,
          meta.sampler || null, meta.scheduler || null,
          meta.width || null, meta.height || null,
          checkpointId
        )

        if (meta.loras && meta.loras.length > 0) {
          for (const l of meta.loras) {
            const loraRow = db.prepare('SELECT id FROM loras WHERE name = ?').get(l.name)
            if (loraRow) {
              db.prepare(
                'INSERT OR IGNORE INTO iteration_loras (iteration_id, lora_id, weight) VALUES (?, ?, ?)'
              ).run(iter.lastInsertRowid, loraRow.id, l.weight)
            }
          }
        }

        nextNumber++
      }

      db.prepare('UPDATE main_gens SET updated_at = datetime("now") WHERE id = ?').run(targetId)

      const placeholders = itemIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM inbox_items WHERE id IN (${placeholders})`).run(...itemIds)

      return { mainGenId: targetId }
    })()
  })
}

module.exports = { registerInboxHandlers }
