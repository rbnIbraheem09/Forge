const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')

let db = null

function getDatabase() {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'forge.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const version = db.pragma('user_version', { simple: true })

  if (version === 0) {
    // Fresh install or pre-session-2 DB — drop old tables and apply full schema
    db.exec(`
      DROP TABLE IF EXISTS generation_loras;
      DROP TABLE IF EXISTS generations;
    `)
  }

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
  db.pragma('user_version = 2')

  return db
}

module.exports = { getDatabase }
