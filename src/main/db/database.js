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

  if (version < 3) {
    // Add file_mtime to existing inbox_items tables; fails silently on fresh installs
    // where the column already exists from the schema above
    try { db.exec('ALTER TABLE inbox_items ADD COLUMN file_mtime TEXT') } catch {}

    // Backfill mtime for any existing rows that have NULL
    const rows = db.prepare('SELECT id, image_path FROM inbox_items WHERE file_mtime IS NULL').all()
    const update = db.prepare('UPDATE inbox_items SET file_mtime = ? WHERE id = ?')
    for (const row of rows) {
      try {
        const mtime = fs.statSync(row.image_path).mtime.toISOString()
        update.run(mtime, row.id)
      } catch {}
    }
  }

  if (version < 4) {
    // Tables lora_example_images / model_example_images are created idempotently by schema.sql above — no version-guarded CREATE needed here.
    try { db.exec('ALTER TABLE loras  ADD COLUMN trigger_words TEXT') } catch {}
    try { db.exec('ALTER TABLE loras  ADD COLUMN recommended_strength REAL') } catch {}
    try { db.exec('ALTER TABLE models ADD COLUMN recommended_cfg REAL') } catch {}
    try { db.exec('ALTER TABLE models ADD COLUMN recommended_steps INTEGER') } catch {}
  }

  if (version < 5) {
    try { db.exec('ALTER TABLE models ADD COLUMN family TEXT') } catch {}
  }

  db.pragma('user_version = 5')

  return db
}

module.exports = { getDatabase }
