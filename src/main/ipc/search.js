// src/main/ipc/search.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerSearchHandlers() {
  ipcMain.handle('search:query', (_e, { query, filters = {} }) => {
    const db = getDatabase()
    const q = `%${query}%`
    const { types = [], starred, hasTags } = filters
    const includeAll = types.length === 0

    const results = { mainGens: [], iterations: [], loras: [], checkpoints: [] }

    if (includeAll || types.includes('main-gens')) {
      let sql = `
        SELECT id, title, hero_image_path, hero_color, tags, updated_at
        FROM main_gens
        WHERE (title LIKE ? OR notes LIKE ? OR tags LIKE ?)
      `
      const params = [q, q, q]
      if (hasTags) { sql += ' AND tags IS NOT NULL AND tags != ""'; }
      sql += ' ORDER BY updated_at DESC LIMIT 20'
      results.mainGens = db.prepare(sql).all(...params)
    }

    if (includeAll || types.includes('iterations')) {
      let sql = `
        SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id, i.seed,
          i.starred, i.tags, i.created_at, mg.title as main_gen_title
        FROM iterations i
        JOIN main_gens mg ON mg.id = i.main_gen_id
        WHERE (i.title LIKE ? OR i.prompt LIKE ? OR i.negative_prompt LIKE ?
          OR i.notes LIKE ? OR i.tags LIKE ? OR i.seed = ?)
      `
      const params = [q, q, q, q, q, query]
      if (starred) { sql += ' AND i.starred = 1' }
      if (hasTags) { sql += ' AND i.tags IS NOT NULL AND i.tags != ""' }
      sql += ' ORDER BY i.created_at DESC LIMIT 20'
      results.iterations = db.prepare(sql).all(...params)
    }

    if (includeAll || types.includes('loras')) {
      results.loras = db.prepare(
        "SELECT id, name, notes, status FROM loras WHERE name LIKE ? OR notes LIKE ? LIMIT 10"
      ).all(q, q)
    }

    if (includeAll || types.includes('checkpoints')) {
      results.checkpoints = db.prepare(
        "SELECT id, name, notes, status FROM models WHERE name LIKE ? OR notes LIKE ? LIMIT 10"
      ).all(q, q)
    }

    return results
  })
}

module.exports = { registerSearchHandlers }
