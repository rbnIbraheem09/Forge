// src/main/scanner/folder-scanner.js
const fs = require('fs')
const path = require('path')
const { getDatabase } = require('../db/database')

const MODEL_EXTENSIONS = ['.safetensors', '.ckpt', '.pt']

function scanCheckpointsFolder(folderPath) {
  return scanFolder(folderPath, 'models')
}

function scanLorasFolder(folderPath) {
  return scanFolder(folderPath, 'loras')
}

function scanFolder(folderPath, table) {
  const db = getDatabase()
  if (!folderPath || !fs.existsSync(folderPath)) {
    db.prepare(`UPDATE ${table} SET status = 'offline'`).run()
    return { added: 0, updated: 0, offlined: 0 }
  }

  let files
  try {
    files = fs.readdirSync(folderPath)
  } catch {
    return { added: 0, updated: 0, offlined: 0 }
  }

  const foundNames = new Set()
  let added = 0
  let updated = 0

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (!MODEL_EXTENSIONS.includes(ext)) continue

    const name = path.basename(file, ext)
    const filePath = path.join(folderPath, file)
    foundNames.add(name)

    const existing = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name)
    if (existing) {
      db.prepare(`UPDATE ${table} SET file_path = ?, status = 'online' WHERE name = ?`).run(filePath, name)
      updated++
    } else {
      db.prepare(`INSERT INTO ${table} (name, file_path, status) VALUES (?, ?, 'online')`).run(name, filePath)
      added++
    }
  }

  const allRecords = db.prepare(`SELECT name FROM ${table}`).all()
  let offlined = 0
  for (const record of allRecords) {
    if (!foundNames.has(record.name)) {
      db.prepare(`UPDATE ${table} SET status = 'offline' WHERE name = ?`).run(record.name)
      offlined++
    }
  }

  return { added, updated, offlined }
}

module.exports = { scanCheckpointsFolder, scanLorasFolder }
