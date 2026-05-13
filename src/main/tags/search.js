// src/main/tags/search.js
//
// Search backend for the Danbooru tag library.
// Combines FTS5 keyword search with cosine similarity over MiniLM embeddings,
// merging the two via Reciprocal Rank Fusion (RRF, k=60).

const { getDatabase } = require('../db/database')
const { embedTexts } = require('./embedder')

const RRF_K = 60
const EMBEDDING_DIM = 384

// In-memory cache. Lazy-loaded on first cosine search.
let embeddingMatrix = null   // Float32Array of length (numTags * DIM)
let embeddingIds = null      // Int32Array of length numTags, parallel to matrix rows

function unloadEmbeddingCache() {
  embeddingMatrix = null
  embeddingIds = null
}

function loadEmbeddingCache() {
  if (embeddingMatrix) return
  const db = getDatabase()
  const rows = db.prepare(
    'SELECT id, embedding FROM danbooru_tags WHERE embedding IS NOT NULL ORDER BY id'
  ).all()

  const n = rows.length
  embeddingMatrix = new Float32Array(n * EMBEDDING_DIM)
  embeddingIds = new Int32Array(n)

  for (let i = 0; i < n; i++) {
    const blob = rows[i].embedding
    const arr = new Float32Array(blob.buffer, blob.byteOffset, EMBEDDING_DIM)
    embeddingMatrix.set(arr, i * EMBEDDING_DIM)
    embeddingIds[i] = rows[i].id
  }
}

function cosineRankAll(queryVec, limit) {
  // queryVec is L2-normalized (embedder already normalized). matrix vectors are too.
  // Cosine simplifies to dot product. Return top-limit by similarity.
  const n = embeddingIds.length
  const scores = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let dot = 0
    const base = i * EMBEDDING_DIM
    for (let j = 0; j < EMBEDDING_DIM; j++) {
      dot += embeddingMatrix[base + j] * queryVec[j]
    }
    scores[i] = dot
  }

  // Partial sort: pick top-`limit` indices by score.
  const indexed = []
  for (let i = 0; i < n; i++) indexed.push(i)
  indexed.sort((a, b) => scores[b] - scores[a])
  return indexed.slice(0, limit).map(idx => ({ id: embeddingIds[idx], score: scores[idx] }))
}

function ftsSearch(query, limit) {
  const db = getDatabase()
  // Escape: FTS5 prefix search uses `term*`; we trim and split on whitespace.
  const terms = query.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/"/g, '') + '*')
  if (terms.length === 0) return []
  const ftsQuery = terms.join(' OR ')

  try {
    const rows = db.prepare(`
      SELECT t.id, bm25(danbooru_tags_fts) AS bm25_score, t.post_count
      FROM danbooru_tags_fts
      JOIN danbooru_tags t ON t.id = danbooru_tags_fts.rowid
      WHERE danbooru_tags_fts MATCH ?
      ORDER BY bm25_score * (1.0 + log(1 + t.post_count) / log(10)) ASC
      LIMIT ?
    `).all(ftsQuery, limit)
    return rows.map(r => ({ id: r.id, bm25: r.bm25_score }))
  } catch (err) {
    // FTS5 MATCH syntax errors → empty result rather than crash
    return []
  }
}

function rrfMerge(listA, listB, limit) {
  // Reciprocal Rank Fusion: score(item) = sum(1 / (K + rank_in_each_list))
  const scores = new Map()
  listA.forEach((item, idx) => {
    scores.set(item.id, (scores.get(item.id) || 0) + 1 / (RRF_K + idx + 1))
  })
  listB.forEach((item, idx) => {
    scores.set(item.id, (scores.get(item.id) || 0) + 1 / (RRF_K + idx + 1))
  })
  const merged = Array.from(scores.entries()).map(([id, score]) => ({ id, score }))
  merged.sort((a, b) => b.score - a.score)
  return merged.slice(0, limit)
}

async function searchTags(query, options = {}) {
  const limit = Math.max(1, Math.min(50, options.limit || 20))
  const category = options.category && options.category !== 'any' ? options.category : null
  const trimmed = (query || '').trim()
  if (!trimmed) return []

  // FTS first — cheap and immediately available.
  const ftsResults = ftsSearch(trimmed, limit * 3)

  // Cosine second — requires embedding cache + a query embedding.
  loadEmbeddingCache()
  let cosResults = []
  if (embeddingMatrix && embeddingIds.length > 0) {
    const [queryVec] = await embedTexts([trimmed])
    cosResults = cosineRankAll(queryVec, limit * 3)
  }

  const merged = rrfMerge(ftsResults, cosResults, limit * 2)

  // Hydrate by id.
  const db = getDatabase()
  const idList = merged.map(m => m.id)
  if (idList.length === 0) return []
  const placeholders = idList.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, name, category, post_count, aliases FROM danbooru_tags WHERE id IN (${placeholders})`
  ).all(...idList)
  const byId = new Map(rows.map(r => [r.id, r]))

  let final = merged.map(m => byId.get(m.id)).filter(Boolean)

  // Filter by category if requested.
  if (category) {
    const categoryMap = { general: 0, artist: 1, copyright: 3, character: 4, meta: 5 }
    const wantCat = categoryMap[category]
    if (wantCat !== undefined) final = final.filter(t => t.category === wantCat)
  }

  return final.slice(0, limit)
}

module.exports = { searchTags, loadEmbeddingCache, unloadEmbeddingCache }
