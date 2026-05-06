// src/main/ipc/dashboard.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerDashboardHandlers() {
  ipcMain.handle('dashboard:stats', () => {
    const db = getDatabase()
    return {
      mainGensCount: db.prepare('SELECT COUNT(*) as n FROM main_gens').get().n,
      iterationsCount: db.prepare('SELECT COUNT(*) as n FROM iterations').get().n,
      lorasCount: db.prepare('SELECT COUNT(*) as n FROM loras').get().n,
      checkpointsCount: db.prepare('SELECT COUNT(*) as n FROM models').get().n,
      starredCount: db.prepare('SELECT COUNT(*) as n FROM iterations WHERE starred = 1').get().n,
    }
  })

  ipcMain.handle('dashboard:top-loras', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT l.id, l.name, COUNT(il.iteration_id) as usage_count
      FROM loras l
      JOIN iteration_loras il ON il.lora_id = l.id
      GROUP BY l.id
      ORDER BY usage_count DESC
      LIMIT 5
    `).all()
  })

  ipcMain.handle('dashboard:top-checkpoints', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT m.id, m.name, COUNT(i.id) as usage_count
      FROM models m
      JOIN iterations i ON i.checkpoint_id = m.id
      GROUP BY m.id
      ORDER BY usage_count DESC
      LIMIT 5
    `).all()
  })

  ipcMain.handle('dashboard:pinned-main-gens', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      WHERE mg.pinned = 1
      GROUP BY mg.id
      ORDER BY mg.updated_at DESC
    `).all()
  })

  ipcMain.handle('dashboard:starred-iterations', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT i.*, mg.title as main_gen_title
      FROM iterations i
      JOIN main_gens mg ON mg.id = i.main_gen_id
      WHERE i.starred = 1
      ORDER BY i.starred_at DESC
      LIMIT 10
    `).all()
  })

  ipcMain.handle('dashboard:recent-main-gens', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      GROUP BY mg.id
      ORDER BY mg.updated_at DESC
      LIMIT 5
    `).all()
  })
}

module.exports = { registerDashboardHandlers }
