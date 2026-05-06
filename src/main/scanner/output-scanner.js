// src/main/scanner/output-scanner.js
const chokidar = require('chokidar')
const path = require('path')
const { getDatabase } = require('../db/database')
const { extractPngMetadata } = require('./png-metadata')

let watcher = null

function startOutputScanner(outputFolder, mainWindow) {
  stopOutputScanner()
  if (!outputFolder) return

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

  const meta = extractPngMetadata(filePath)
  db.prepare(
    'INSERT OR IGNORE INTO inbox_items (image_path, extracted_metadata) VALUES (?, ?)'
  ).run(filePath, meta ? JSON.stringify(meta) : null)

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
