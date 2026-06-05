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

// Exact-name lookup so freeform-typed tags can be colored by their Danbooru category.
// Returns a plain object { [name]: category }. Names not in the library are absent.
function resolveTags(names) {
  const list = (names || []).map(n => String(n).trim().toLowerCase()).filter(Boolean)
  if (list.length === 0) return {}
  const db = getDatabase()
  const ph = list.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT name, category FROM danbooru_tags WHERE name IN (${ph})`
  ).all(...list)
  const map = {}
  for (const r of rows) map[r.name] = r.category
  return map
}

// Given the tags currently in the prompt, return the most semantically-related tags
// from the library (excluding the inputs). Danbooru tags reuse their pre-stored
// embedding (no model call); freeform tags are embedded on the fly so they still steer.
async function relatedTags(tagNames, options = {}) {
  const limit = Math.max(1, Math.min(40, options.limit || 24))
  const names = (tagNames || []).map(n => String(n).trim().toLowerCase()).filter(Boolean)
  if (names.length === 0) return []

  loadEmbeddingCache()
  if (!embeddingMatrix || embeddingIds.length === 0) return []

  const db = getDatabase()
  const placeholders = names.map(() => '?').join(',')
  const known = db.prepare(
    `SELECT id, name FROM danbooru_tags WHERE name IN (${placeholders})`
  ).all(...names)
  const knownIds = new Set(known.map(r => r.id))
  const knownNameSet = new Set(known.map(r => r.name))

  // id -> matrix row index (embeddingIds is parallel to matrix rows).
  const idToRow = new Map()
  for (let i = 0; i < embeddingIds.length; i++) idToRow.set(embeddingIds[i], i)

  const avg = new Float32Array(EMBEDDING_DIM)
  let counted = 0

  for (const r of known) {
    const row = idToRow.get(r.id)
    if (row === undefined) continue
    const base = row * EMBEDDING_DIM
    for (let j = 0; j < EMBEDDING_DIM; j++) avg[j] += embeddingMatrix[base + j]
    counted++
  }

  const unknown = names.filter(n => !knownNameSet.has(n))
  if (unknown.length > 0) {
    const vecs = await embedTexts(unknown)
    for (const v of vecs) {
      for (let j = 0; j < EMBEDDING_DIM; j++) avg[j] += v[j]
      counted++
    }
  }

  if (counted === 0) return []

  // Renormalize the centroid — cosineRankAll expects a unit vector.
  let norm = 0
  for (let j = 0; j < EMBEDDING_DIM; j++) norm += avg[j] * avg[j]
  norm = Math.sqrt(norm) || 1
  for (let j = 0; j < EMBEDDING_DIM; j++) avg[j] /= norm

  // Over-fetch, drop tags already in the prompt, hydrate, return.
  const ranked = cosineRankAll(avg, limit + names.length + 8)
  const ids = ranked.map(r => r.id).filter(id => !knownIds.has(id)).slice(0, limit + 8)
  if (ids.length === 0) return []

  const ph2 = ids.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, name, category, post_count FROM danbooru_tags WHERE id IN (${ph2})`
  ).all(...ids)
  const byId = new Map(rows.map(r => [r.id, r]))

  return ids.map(id => byId.get(id)).filter(Boolean)
    .filter(t => !knownNameSet.has(t.name))
    .slice(0, limit)
}

module.exports = { searchTags, relatedTags, resolveTags, loadEmbeddingCache, unloadEmbeddingCache }
