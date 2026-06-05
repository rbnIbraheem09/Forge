// src/main/scanner/output-scanner.js
const path = require('path')
const { getDatabase } = require('../db/database')
const { extractPngMetadata } = require('./png-metadata')

let watcher = null

function backfillMissingMetadata() {
  const db = getDatabase()

  console.log('[backfill] starting metadata backfill...')

  // Inbox items: NULL metadata OR previously-extracted-but-all-null (visual workflow was picked before fix)
  const inboxRows = db.prepare(`
    SELECT id, image_path FROM inbox_items
    WHERE extracted_metadata IS NULL
       OR json_extract(extracted_metadata, '$.seed') IS NULL
  `).all()
  const updateInbox = db.prepare('UPDATE inbox_items SET extracted_metadata = ? WHERE id = ?')
  for (const row of inboxRows) {
    const meta = extractPngMetadata(row.image_path)
    if (meta && (meta.seed || meta.steps || meta.prompt || meta.checkpoint_name)) {
      updateInbox.run(JSON.stringify(meta), row.id)
    }
  }

  console.log(`[backfill] inbox: updated ${inboxRows.length} items`)

  // Iterations: backfill fields that were created from null-metadata inbox items
  const iterRows = db.prepare(`
    SELECT id, image_path FROM iterations
    WHERE seed IS NULL AND steps IS NULL AND prompt IS NULL
  `).all()
  const updateIter = db.prepare(`
    UPDATE iterations SET
      prompt = ?, negative_prompt = ?, seed = ?, steps = ?,
      cfg = ?, sampler = ?, scheduler = ?, width = ?, height = ?
    WHERE id = ?
  `)
  let iterFixed = 0
  for (const row of iterRows) {
    const meta = extractPngMetadata(row.image_path)
    if (meta && (meta.seed || meta.steps || meta.prompt)) {
      updateIter.run(
        meta.prompt || null, meta.negative_prompt || null,
        meta.seed || null, meta.steps || null,
        meta.cfg || null, meta.sampler || null, meta.scheduler || null,
        meta.width || null, meta.height || null,
        row.id
      )
      iterFixed++
    }
  }
  console.log(`[backfill] iterations: updated ${iterFixed} of ${iterRows.length} candidates`)

  // Backfill checkpoint_id for iterations missing it
  const noCheckpoint = db.prepare('SELECT id, image_path FROM iterations WHERE checkpoint_id IS NULL').all()
  const setCheckpoint = db.prepare('UPDATE iterations SET checkpoint_id = ? WHERE id = ?')
  let ckptFixed = 0
  for (const row of noCheckpoint) {
    const meta = extractPngMetadata(row.image_path)
    if (!meta?.checkpoint_name) continue
    let model = db.prepare('SELECT id FROM models WHERE name = ?').get(meta.checkpoint_name)
    if (!model) {
      db.prepare("INSERT OR IGNORE INTO models (name, status) VALUES (?, 'offline')").run(meta.checkpoint_name)
      model = db.prepare('SELECT id FROM models WHERE name = ?').get(meta.checkpoint_name)
    }
    if (model) { setCheckpoint.run(model.id, row.id); ckptFixed++ }
  }
  console.log(`[backfill] checkpoints: linked ${ckptFixed} of ${noCheckpoint.length} candidates`)

  // Backfill iteration_loras for iterations that have none
  const noLoras = db.prepare(`
    SELECT i.id, i.image_path FROM iterations i
    LEFT JOIN iteration_loras il ON il.iteration_id = i.id
    WHERE il.iteration_id IS NULL
  `).all()
  const insertLora = db.prepare('INSERT OR IGNORE INTO iteration_loras (iteration_id, lora_id, weight) VALUES (?, ?, ?)')
  let loraFixed = 0
  for (const row of noLoras) {
    const meta = extractPngMetadata(row.image_path)
    if (!meta?.loras?.length) continue
    for (const l of meta.loras) {
      let loraRow = db.prepare('SELECT id FROM loras WHERE name = ?').get(l.name)
      if (!loraRow) {
        db.prepare("INSERT OR IGNORE INTO loras (name, status) VALUES (?, 'offline')").run(l.name)
        loraRow = db.prepare('SELECT id FROM loras WHERE name = ?').get(l.name)
      }
      if (loraRow) { insertLora.run(row.id, loraRow.id, l.weight); loraFixed++ }
    }
  }
  console.log(`[backfill] loras: linked ${loraFixed} lora-iteration pairs across ${noLoras.length} candidates`)
}

async function startOutputScanner(outputFolder, mainWindow) {
  stopOutputScanner()
  if (!outputFolder) return

  backfillMissingMetadata()

  const { default: chokidar } = await import('chokidar')

  watcher = chokidar.watch(outputFolder, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
  })

  watcher.on('add', (filePath) => {
    if (path.extname(filePath).toLowerCase() !== '.png') return
    handleNewPng(filePath, mainWindow)
  })
}

function stopOutputScanner() {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}

function handleNewPng(filePath, mainWindow) {
  const db = getDatabase()
  const existing = db.prepare('SELECT id FROM inbox_items WHERE image_path = ?').get(filePath)
  if (existing) return

  const assigned = db.prepare('SELECT id FROM iterations WHERE image_path = ?').get(filePath)
  if (assigned) return

  const meta = extractPngMetadata(filePath)
  let file_mtime = null
  try { file_mtime = require('fs').statSync(filePath).mtime.toISOString() } catch {}
  db.prepare(
    'INSERT OR IGNORE INTO inbox_items (image_path, extracted_metadata, file_mtime) VALUES (?, ?, ?)'
  ).run(filePath, meta ? JSON.stringify(meta) : null, file_mtime)

  const count = db.prepare('SELECT COUNT(*) as n FROM inbox_items').get().n
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('inbox:new-item', { count })
  }
}

function scanExisting(outputFolder, mainWindow) {
  const fs = require('fs')
  if (!outputFolder || !fs.existsSync(outputFolder)) return
  const files = fs.readdirSync(outputFolder)
  for (const file of files) {
    if (path.extname(file).toLowerCase() === '.png') {
      handleNewPng(path.join(outputFolder, file), mainWindow)
    }
  }
}

module.exports = { startOutputScanner, stopOutputScanner, scanExisting }
