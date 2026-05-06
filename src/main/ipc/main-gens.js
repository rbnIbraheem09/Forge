// src/main/ipc/main-gens.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerMainGensHandlers() {
  ipcMain.handle('main-gens:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      GROUP BY mg.id
      ORDER BY mg.pinned DESC, mg.updated_at DESC
    `).all()
  })

  ipcMain.handle('main-gens:get', (_e, { id }) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      WHERE mg.id = ?
      GROUP BY mg.id
    `).get(id)
  })

  ipcMain.handle('main-gens:create', (_e, { title }) => {
    const db = getDatabase()
    const heroColor = randomHeroColor()
    const result = db.prepare(
      'INSERT INTO main_gens (title, hero_color) VALUES (?, ?)'
    ).run(title.trim(), heroColor)
    return db.prepare('SELECT * FROM main_gens WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('main-gens:update', (_e, { id, title, hero_image_path, hero_color, pinned, notes, tags }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (title !== undefined) { fields.push('title = ?'); values.push(title.trim()) }
    if (hero_image_path !== undefined) { fields.push('hero_image_path = ?'); values.push(hero_image_path) }
    if (hero_color !== undefined) { fields.push('hero_color = ?'); values.push(hero_color) }
    if (pinned !== undefined) { fields.push('pinned = ?'); values.push(pinned ? 1 : 0) }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (tags !== undefined) { fields.push('tags = ?'); values.push(tags) }
    fields.push('updated_at = datetime("now")')
    if (fields.length === 1) return true
    db.prepare(`UPDATE main_gens SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })

  ipcMain.handle('main-gens:delete', (_e, { id }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM main_gens WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('main-gens:set-hero', (_e, { id, iterationId }) => {
    const db = getDatabase()
    const iter = db.prepare('SELECT image_path FROM iterations WHERE id = ?').get(iterationId)
    if (!iter) return false
    db.prepare('UPDATE main_gens SET hero_image_path = ?, updated_at = datetime("now") WHERE id = ?')
      .run(iter.image_path, id)
    return true
  })
}

function randomHeroColor() {
  const hue = Math.floor(Math.random() * 360)
  const sat = 30 + Math.floor(Math.random() * 30)
  const light = 20 + Math.floor(Math.random() * 15)
  const h = hue; const s = sat / 100; const l = light / 100
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

module.exports = { registerMainGensHandlers }
