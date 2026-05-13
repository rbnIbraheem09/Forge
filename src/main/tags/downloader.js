// src/main/tags/downloader.js
//
// Downloads the Danbooru tag CSV from a1111-sd-webui-tagcomplete's GitHub repo,
// streaming to a local cache file. Reports progress in bytes downloaded.

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const CSV_URL = 'https://raw.githubusercontent.com/DominikDoom/a1111-sd-webui-tagcomplete/main/tags/danbooru.csv'

function getCachePath() {
  const dir = path.join(app.getPath('userData'), 'tags-cache')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'danbooru.csv')
}

async function downloadCsv(onProgress = () => {}) {
  const cachePath = getCachePath()
  const tmpPath = cachePath + '.tmp'

  const resp = await fetch(CSV_URL)
  if (!resp.ok) {
    throw new Error(`Failed to download tag CSV: HTTP ${resp.status} ${resp.statusText}`)
  }

  const totalBytes = Number(resp.headers.get('content-length') || 0) // 0 means unknown
  let downloadedBytes = 0

  const writer = fs.createWriteStream(tmpPath)
  const reader = resp.body.getReader()

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    writer.write(Buffer.from(value))
    downloadedBytes += value.length
    onProgress({ phase: 'download', current: downloadedBytes, total: totalBytes })
  }

  await new Promise((resolve, reject) => {
    writer.end((err) => err ? reject(err) : resolve())
  })

  // Atomic rename only after the full file is written.
  fs.renameSync(tmpPath, cachePath)

  return { path: cachePath, bytes: downloadedBytes }
}

module.exports = { downloadCsv, getCachePath, CSV_URL }
