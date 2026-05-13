// src/main/tags/indexer.js
//
// Imports parsed CSV records into danbooru_tags in batched transactions.
// Then walks the table and fills in MiniLM embeddings for any row missing one.

const { getDatabase } = require('../db/database')
const { parseCsv } = require('./parser')
const { embedTexts } = require('./embedder')

const INSERT_BATCH = 1000
const EMBED_BATCH = 64

async function importCsv(csvPath, onProgress = () => {}) {
  const db = getDatabase()

  // Wipe and rebuild — for v1 we don't do incremental merge.
  db.exec('DELETE FROM danbooru_tags')

  const insert = db.prepare(
    'INSERT INTO danbooru_tags (name, category, post_count, aliases) VALUES (?, ?, ?, ?)'
  )

  let buffer = []
  let total = 0

  const flush = db.transaction((rows) => {
    for (const r of rows) {
      try {
        insert.run(r.name, r.category, r.post_count, r.aliases)
      } catch (err) {
        // The CSV may contain duplicate names; UNIQUE collisions are expected and silent.
        // Any other error indicates a real problem worth surfacing.
        if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
          console.warn('[indexer] unexpected insert error for tag', JSON.stringify(r.name), ':', err.message)
        }
      }
    }
  })

  for await (const row of parseCsv(csvPath)) {
    buffer.push(row)
    if (buffer.length >= INSERT_BATCH) {
      flush(buffer)
      total += buffer.length
      buffer = []
      onProgress({ phase: 'parse', current: total, total: 0 })
    }
  }
  if (buffer.length > 0) {
    flush(buffer)
    total += buffer.length
  }

  const finalCount = db.prepare('SELECT COUNT(*) as c FROM danbooru_tags').get().c
  onProgress({ phase: 'parse', current: finalCount, total: finalCount })
  return { inserted: finalCount }
}

async function indexEmbeddings(onProgress = () => {}) {
  const db = getDatabase()
  const totalToIndex = db.prepare(
    'SELECT COUNT(*) as c FROM danbooru_tags WHERE embedding IS NULL'
  ).get().c

  if (totalToIndex === 0) return { indexed: 0, total: 0 }

  const selectBatch = db.prepare(
    'SELECT id, name FROM danbooru_tags WHERE embedding IS NULL ORDER BY id LIMIT ?'
  )
  const update = db.prepare('UPDATE danbooru_tags SET embedding = ? WHERE id = ?')
  const updateMany = db.transaction((pairs) => {
    for (const { id, blob } of pairs) update.run(blob, id)
  })

  let done = 0
  while (true) {
    const batch = selectBatch.all(EMBED_BATCH)
    if (batch.length === 0) break

    const texts = batch.map(r => r.name)
    const vectors = await embedTexts(texts)

    const pairs = batch.map((r, i) => ({
      id: r.id,
      blob: Buffer.from(vectors[i].buffer, vectors[i].byteOffset, vectors[i].byteLength),
    }))
    updateMany(pairs)
    done += batch.length

    onProgress({ phase: 'embed', current: done, total: totalToIndex })
  }

  return { indexed: done, total: totalToIndex }
}

module.exports = { importCsv, indexEmbeddings }
