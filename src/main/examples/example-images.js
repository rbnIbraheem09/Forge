// File operations for the managed example-images directory:
//   <userData>/example-images/{loras|models}/<entity_id>/<uuid>.png
//
// Only paste/file sources land here. Gallery picks just reference the existing
// iteration image_path and don't touch this directory.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { app } = require('electron')

function ensureEntityDir(entityKind, entityId) {
  // entityKind: 'loras' | 'models'
  const dir = path.join(app.getPath('userData'), 'example-images', entityKind, String(entityId))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function saveBufferAsExample(entityKind, entityId, buffer, extension = '.png') {
  const dir = ensureEntityDir(entityKind, entityId)
  const filename = crypto.randomUUID() + extension
  const fullPath = path.join(dir, filename)
  fs.writeFileSync(fullPath, buffer)
  return fullPath
}

function copyFileAsExample(entityKind, entityId, sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase() || '.png'
  const dir = ensureEntityDir(entityKind, entityId)
  const filename = crypto.randomUUID() + ext
  const fullPath = path.join(dir, filename)
  fs.copyFileSync(sourcePath, fullPath)
  return fullPath
}

function unlinkExample(filePath) {
  try { fs.unlinkSync(filePath) } catch (err) {
    // ENOENT is fine — file is already gone; anything else, log and continue
    if (err.code !== 'ENOENT') console.warn('[example-images] unlink failed:', err.message)
  }
}

module.exports = { saveBufferAsExample, copyFileAsExample, unlinkExample }
