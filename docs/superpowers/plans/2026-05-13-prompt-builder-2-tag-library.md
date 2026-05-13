# Prompt Builder — Plan 2: Danbooru Tag Library

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a local, searchable Danbooru tag library (~150k tags) with both keyword (FTS5) and semantic (MiniLM embeddings) search. By the end of this plan, the user can hit "Download tag library" in Settings, watch the download + embedding indexing progress, and call `window.forge.prompt.searchTags(query)` from DevTools to get ranked tag matches. Plans 3 and 4 will consume this library; this plan stands on its own as a verifiable backend feature.

**Architecture:** Tags are sourced from the `a1111-sd-webui-tagcomplete` GitHub-hosted CSV (~150k tags, MIT-licensed, includes post counts and aliases). Tags are inserted into a `danbooru_tags` SQLite table backed by an FTS5 virtual table for keyword search. Each tag also gets a 384-dim MiniLM embedding stored as a raw Float32 BLOB. The embedder runs locally via `@huggingface/transformers` (no remote inference). Search merges FTS5 + cosine via Reciprocal Rank Fusion. Progress events stream to the renderer during long-running operations.

**Tech Stack:** SQLite (better-sqlite3), FTS5 virtual tables, `@huggingface/transformers` for embeddings, Node `fetch` (Electron has it built-in), CSV streaming, IPC with `webContents.send` for progress events.

**Reference spec:** [docs/superpowers/specs/2026-05-13-prompt-builder-design.md](../specs/2026-05-13-prompt-builder-design.md) sections on "Tag library", "Schema migration", and "IPC contract".

---

## File Structure

**Files to create (main process):**
- `src/main/tags/downloader.js` — Fetches `danbooru.csv` from GitHub raw with progress reporting. Streams to a local cache file under `userData/tags-cache/danbooru.csv`.
- `src/main/tags/parser.js` — Streaming CSV parser. Yields `{ name, category, post_count, aliases }` records with name transformed (`underscore → space`).
- `src/main/tags/indexer.js` — Inserts parsed records into `danbooru_tags` via batched transactions. Also drives the embedding pass.
- `src/main/tags/embedder.js` — Lazy-loaded MiniLM pipeline via `@huggingface/transformers`. Exposes `embedTexts(texts)` returning `Float32Array[]`.
- `src/main/tags/search.js` — Search backend: FTS5 `MATCH` + in-memory cosine + Reciprocal Rank Fusion. Used by both the AI tool-call (Plan 3) and the Settings DevTools verification.
- `src/main/ipc/prompt-library.js` — IPC handlers for `prompt:search-tags`, `prompt:library-status`, `prompt:library-refresh`.

**Files to modify:**
- `src/main/db/schema.sql` — Add `danbooru_tags` table, FTS5 virtual table, and the three FTS sync triggers.
- `src/main/db/database.js` — Bump `user_version` from 5 → 6. No `ALTER` needed; the new tables are created idempotently by `schema.sql`.
- `src/main/preload.js` — Add `window.forge.prompt.searchTags`, `window.forge.prompt.library.*`, and allowlist the `prompt:library-progress` event channel.
- `src/main/index.js` — Register the new `prompt-library` IPC handler module.
- `src/renderer/pages/Settings.jsx` — Add a "Prompt Builder" section showing library status (count, last refresh, indexed) and a "Download / Refresh tag library" button with progress.
- `CLAUDE.md` — Update schema-version note to 6 and mention the new tag library tables.
- `package.json` — Add `@huggingface/transformers` to dependencies.

**New settings keys:**
- `danbooru_library_version` — ISO timestamp of last successful refresh.
- `danbooru_library_count` — number of tags after last refresh.
- `danbooru_library_indexed` — `'true'` once embeddings are populated, `'false'` or absent otherwise.

---

## Task 1: Install `@huggingface/transformers` and verify it loads

**Files:**
- Modify: `package.json`

`@huggingface/transformers` is the JS-native ML runtime (formerly `@xenova/transformers`). It ships ONNX Runtime under the hood and supports running quantized models locally. In a Node/Electron environment, it uses `onnxruntime-node` (native binaries) by default; we'll rely on that.

- [ ] **Step 1: Install the package**

```bash
npm install @huggingface/transformers
```

- [ ] **Step 2: Run postinstall to rebuild any native deps for Electron**

```bash
npm run postinstall
```

This rebuilds `better-sqlite3` against Electron's ABI. If `@huggingface/transformers` brought in native binaries that need rebuilding, this step also covers them via `electron-rebuild`. If `npm run postinstall` errors, run `npx electron-rebuild -f` to force-rebuild everything.

- [ ] **Step 3: Verify the package loads in a Node-equivalent context**

Create a temporary verification script at `/tmp/verify-transformers.mjs`:

```javascript
import('@huggingface/transformers').then(async (mod) => {
  console.log('Package loaded. Available exports:', Object.keys(mod).slice(0, 8))
  console.log('pipeline factory:', typeof mod.pipeline)
})
```

Run it:

```bash
node --experimental-vm-modules /tmp/verify-transformers.mjs 2>&1 | head -10
```

Expected: prints available exports including a function named `pipeline`. No errors.

If it fails because of ESM/CJS interop, that's OK — the production code uses dynamic `import()` from inside CommonJS, which we'll verify in Task 5.

Delete the verification script:

```bash
rm /tmp/verify-transformers.mjs
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @huggingface/transformers for local embedding inference"
```

---

## Task 2: Schema migration v5 → v6 — tag library tables

**Files:**
- Modify: `src/main/db/schema.sql`
- Modify: `src/main/db/database.js`

New tables: `danbooru_tags`, `danbooru_tags_fts` (FTS5 virtual table), and the three FTS sync triggers (after insert, after delete, after update).

- [ ] **Step 1: Append new tables and triggers to `schema.sql`**

Open `src/main/db/schema.sql`. After the existing `CREATE TABLE IF NOT EXISTS model_example_images` block (around line 118), append:

```sql

CREATE TABLE IF NOT EXISTS danbooru_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  aliases TEXT,
  embedding BLOB
);

CREATE INDEX IF NOT EXISTS idx_danbooru_tags_post_count ON danbooru_tags(post_count DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS danbooru_tags_fts USING fts5(
  name, aliases,
  content='danbooru_tags', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS danbooru_tags_ai AFTER INSERT ON danbooru_tags BEGIN
  INSERT INTO danbooru_tags_fts(rowid, name, aliases) VALUES (new.id, new.name, new.aliases);
END;
CREATE TRIGGER IF NOT EXISTS danbooru_tags_ad AFTER DELETE ON danbooru_tags BEGIN
  INSERT INTO danbooru_tags_fts(danbooru_tags_fts, rowid, name, aliases) VALUES('delete', old.id, old.name, old.aliases);
END;
CREATE TRIGGER IF NOT EXISTS danbooru_tags_au AFTER UPDATE ON danbooru_tags BEGIN
  INSERT INTO danbooru_tags_fts(danbooru_tags_fts, rowid, name, aliases) VALUES('delete', old.id, old.name, old.aliases);
  INSERT INTO danbooru_tags_fts(rowid, name, aliases) VALUES (new.id, new.name, new.aliases);
END;
```

Categories follow Danbooru's convention: 0=general, 1=artist, 3=copyright, 4=character, 5=meta (note: 2 is skipped in Danbooru's own tag categorization).

- [ ] **Step 2: Bump `user_version` in `database.js`**

Open `src/main/db/database.js`. Find the existing `if (version < 5)` block, then add immediately after it:

```javascript
  if (version < 6) {
    // Tag library tables are created idempotently by schema.sql above — no ALTER needed.
    // This guard exists to document the version bump and reserve the migration step
    // in case future hardening (e.g. backfilling) is added.
  }
```

Change the final pragma:

```javascript
  db.pragma('user_version = 6')
```

- [ ] **Step 3: Verify the migration applies cleanly**

```bash
npm run dev
```

Wait ~15 seconds for the Electron window to open. Then in a separate terminal:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "PRAGMA user_version; SELECT name FROM sqlite_master WHERE name LIKE 'danbooru%' ORDER BY name;"
```

Expected:
- `user_version` is `6`.
- The five new objects appear: `danbooru_tags`, `danbooru_tags_ad`, `danbooru_tags_ai`, `danbooru_tags_au`, `danbooru_tags_fts` (plus any FTS-internal shadow tables like `danbooru_tags_fts_*` — those are FTS5's own bookkeeping, expected).

Stop the dev server.

- [ ] **Step 4: Verify the FTS sync triggers fire on a manual insert**

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "INSERT INTO danbooru_tags (name, category, post_count, aliases) VALUES ('test_tag', 0, 1, 'tt'); SELECT name FROM danbooru_tags_fts WHERE name MATCH 'test_tag'; DELETE FROM danbooru_tags WHERE name = 'test_tag';"
```

Expected output: `test_tag` printed once. Then no rows after the DELETE (FTS sync should remove the row).

Confirm cleanup:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT COUNT(*) FROM danbooru_tags;"
```

Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.sql src/main/db/database.js
git commit -m "feat(db): danbooru_tags + FTS5 virtual table (user_version 6)"
```

---

## Task 3: Tag CSV downloader

**Files:**
- Create: `src/main/tags/downloader.js`

Downloads `danbooru.csv` from `a1111-sd-webui-tagcomplete`'s GitHub repo. Streams to a local cache file under `userData/tags-cache/danbooru.csv`. Emits progress to a callback for IPC streaming.

- [ ] **Step 1: Create the downloader module**

```javascript
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
```

- [ ] **Step 2: Verify the downloader can fetch the CSV**

Create a one-off verification script at `/tmp/verify-downloader.js`:

```javascript
const { app } = require('electron')

// This script runs inside an Electron context, so we need to wait for app ready.
app.whenReady().then(async () => {
  const { downloadCsv, getCachePath } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/tags/downloader')
  let lastLog = 0
  const result = await downloadCsv((p) => {
    if (Date.now() - lastLog > 500) {
      console.log(`[progress] ${p.phase}: ${p.current} / ${p.total}`)
      lastLog = Date.now()
    }
  })
  console.log('Done:', result)
  console.log('Cache path:', getCachePath())
  app.quit()
})
```

Run it:

```bash
NODE_ENV=development npx electron /tmp/verify-downloader.js 2>&1 | tail -10
```

Expected: a few progress lines and then `Done: { path: '...', bytes: 12345678 }` (size around 10–15 MB). The file should exist at `~/Library/Application Support/forge/tags-cache/danbooru.csv`.

Verify:

```bash
ls -lh "$HOME/Library/Application Support/forge/tags-cache/danbooru.csv"
head -3 "$HOME/Library/Application Support/forge/tags-cache/danbooru.csv"
```

Expected: a file of ~10 MB. First three lines look like CSV rows with comma-separated values.

Delete the verification script:

```bash
rm /tmp/verify-downloader.js
```

- [ ] **Step 3: Commit**

```bash
git add src/main/tags/downloader.js
git commit -m "feat(tags): CSV downloader for Danbooru tag library"
```

---

## Task 4: Streaming CSV parser

**Files:**
- Create: `src/main/tags/parser.js`

Parses the downloaded CSV row-by-row. The CSV format used by `a1111-sd-webui-tagcomplete` is:

```
tag_name,category,post_count,aliases
```

Where:
- `tag_name` uses underscores (we'll transform to spaces).
- `category` is an integer (0=general, 1=artist, 3=copyright, 4=character, 5=meta).
- `post_count` is an integer.
- `aliases` is a comma-separated list, surrounded by double-quotes if it contains commas.

- [ ] **Step 1: Create the parser module**

```javascript
// src/main/tags/parser.js
//
// Streaming CSV parser for the Danbooru tag library CSV.
// The CSV is small enough (~150k lines, ~10 MB) to read into memory at once,
// but we still iterate line-by-line so the indexer can transaction-batch its inserts.

const fs = require('fs')
const readline = require('readline')

// CSV row format: name,category,post_count,aliases
// Aliases may be empty, a single value, or a comma-separated list wrapped in double-quotes.
function parseCsvRow(line) {
  // Find the first three commas at top level. Aliases is everything after, possibly quoted.
  const c1 = line.indexOf(',')
  const c2 = line.indexOf(',', c1 + 1)
  const c3 = line.indexOf(',', c2 + 1)
  if (c1 < 0 || c2 < 0 || c3 < 0) return null

  const rawName = line.slice(0, c1)
  const category = parseInt(line.slice(c1 + 1, c2), 10) || 0
  const postCount = parseInt(line.slice(c2 + 1, c3), 10) || 0
  let aliases = line.slice(c3 + 1).trim()

  // Strip surrounding double-quotes if present.
  if (aliases.startsWith('"') && aliases.endsWith('"')) {
    aliases = aliases.slice(1, -1)
  }
  if (aliases.length === 0) aliases = null

  // Transform underscores to spaces in the canonical tag name.
  // Keep underscores in aliases as-is — aliases are reference text, not what we'll output.
  const name = rawName.replace(/_/g, ' ').trim()
  if (!name) return null

  return { name, category, post_count: postCount, aliases }
}

// Async iterable: yields {name, category, post_count, aliases} for each parseable row.
async function* parseCsv(csvPath) {
  const stream = fs.createReadStream(csvPath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line || line.startsWith('#')) continue
    const row = parseCsvRow(line)
    if (row) yield row
  }
}

module.exports = { parseCsv, parseCsvRow }
```

- [ ] **Step 2: Unit-verify the parser logic**

The parser is pure JS — verifiable without spinning up Electron. Create a temporary script `/tmp/verify-parser.js`:

```javascript
const { parseCsvRow } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/tags/parser')

const cases = [
  ['1girl,0,5000000,', { name: '1girl', category: 0, post_count: 5000000, aliases: null }],
  ['long_hair,0,3000000,', { name: 'long hair', category: 0, post_count: 3000000, aliases: null }],
  ['hatsune_miku_(vocaloid),4,500000,"miku,miku_hatsune"',
    { name: 'hatsune miku (vocaloid)', category: 4, post_count: 500000, aliases: 'miku,miku_hatsune' }],
  ['source_anime,0,100000,', { name: 'source anime', category: 0, post_count: 100000, aliases: null }],
  ['', null],
  ['malformed_no_commas', null],
]

let pass = 0, fail = 0
for (const [input, expected] of cases) {
  const got = parseCsvRow(input)
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (ok) { pass++ } else {
    console.error('FAIL:', input, '\n  expected:', expected, '\n  got:', got)
    fail++
  }
}
console.log(`Parser: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
```

Run it:

```bash
node /tmp/verify-parser.js
```

Expected: `Parser: 6 passed, 0 failed`.

Delete the script:

```bash
rm /tmp/verify-parser.js
```

- [ ] **Step 3: Commit**

```bash
git add src/main/tags/parser.js
git commit -m "feat(tags): streaming CSV parser with underscore-to-space transform"
```

---

## Task 5: Embedder runtime

**Files:**
- Create: `src/main/tags/embedder.js`

Wraps `@huggingface/transformers` to provide a `embedTexts(texts)` function. The model `Xenova/all-MiniLM-L6-v2` is automatically downloaded on first use by the library to its default cache (typically `~/.cache/huggingface/transformers/` in Node). Subsequent calls reuse the cached model. Output is 384-dim normalized vectors.

- [ ] **Step 1: Create the embedder module**

```javascript
// src/main/tags/embedder.js
//
// Local MiniLM (all-MiniLM-L6-v2) embedding via @huggingface/transformers.
// Outputs 384-dim normalized float32 vectors. Model is cached after first load.

let pipelinePromise = null

async function getPipeline() {
  if (pipelinePromise) return pipelinePromise
  pipelinePromise = (async () => {
    // Dynamic import — @huggingface/transformers is ESM, this file is CommonJS.
    const { pipeline } = await import('@huggingface/transformers')
    return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true })
  })()
  return pipelinePromise
}

// Returns an array of Float32Array, one per input text. All vectors are length 384 and L2-normalized.
async function embedTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return []
  const extractor = await getPipeline()
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  // output.data is a single contiguous Float32Array shaped [batch * dim].
  const dim = output.dims[output.dims.length - 1]
  const result = []
  for (let i = 0; i < texts.length; i++) {
    const start = i * dim
    // Copy out — output.data is a view into a single buffer we don't want to retain.
    result.push(new Float32Array(output.data.slice(start, start + dim)))
  }
  return result
}

// Preload the model so the first user query isn't slowed by cold-start.
function warmUp() {
  return getPipeline()
}

module.exports = { embedTexts, warmUp }
```

- [ ] **Step 2: Verify the embedder works end-to-end**

Create `/tmp/verify-embedder.js`:

```javascript
const { app } = require('electron')
app.whenReady().then(async () => {
  const { embedTexts } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/tags/embedder')
  console.log('Loading model + embedding 3 texts (first run downloads ~22 MB)…')
  const t0 = Date.now()
  const vecs = await embedTexts(['red hair', 'crimson hair', 'broken refrigerator'])
  const elapsed = Date.now() - t0
  console.log(`Embedded in ${elapsed} ms. Vector dim: ${vecs[0].length} (expected 384).`)

  // Cosine similarity sanity: red hair ↔ crimson hair should be much higher than red hair ↔ broken refrigerator.
  function cos(a, b) {
    let s = 0
    for (let i = 0; i < a.length; i++) s += a[i] * b[i]
    return s
  }
  console.log('cos(red hair, crimson hair):', cos(vecs[0], vecs[1]).toFixed(4))
  console.log('cos(red hair, broken refrigerator):', cos(vecs[0], vecs[2]).toFixed(4))

  app.quit()
})
```

Run:

```bash
NODE_ENV=development npx electron /tmp/verify-embedder.js 2>&1 | tail -15
```

Expected on first run: takes ~30 seconds because the model downloads (~22 MB). Subsequent runs are <2 seconds.

Output expected to show:
- `Vector dim: 384`
- `cos(red hair, crimson hair): 0.7` or higher
- `cos(red hair, broken refrigerator): 0.2` or lower

If `cos(red hair, crimson hair)` is suspiciously close to `cos(red hair, broken refrigerator)` (e.g. both ~0.5), the model didn't load correctly or normalization is off.

Clean up:

```bash
rm /tmp/verify-embedder.js
```

- [ ] **Step 3: Commit**

```bash
git add src/main/tags/embedder.js
git commit -m "feat(tags): MiniLM embedder wrapper using @huggingface/transformers"
```

---

## Task 6: Tag indexer — CSV → SQLite

**Files:**
- Create: `src/main/tags/indexer.js`

Two operations:
1. `importCsv(csvPath, onProgress)` — Stream-parse CSV, batch-insert into `danbooru_tags` (1000 rows per transaction). Replaces all existing rows (we don't merge across versions for v1).
2. `indexEmbeddings(onProgress)` — Reads tags with NULL `embedding`, calls embedder in batches of 64, writes vector back as a `Buffer` blob.

- [ ] **Step 1: Create the indexer module**

```javascript
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
        // Likely a UNIQUE constraint failure on duplicate names within the CSV — skip.
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
```

- [ ] **Step 2: Verify the importer + indexer end-to-end**

This task's verification depends on Task 3 (downloader) and Task 5 (embedder) being committed. Run the full flow in a single one-off Electron script `/tmp/verify-indexer.js`:

```javascript
const { app } = require('electron')
app.whenReady().then(async () => {
  const { downloadCsv } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/tags/downloader')
  const { importCsv, indexEmbeddings } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/tags/indexer')

  console.log('Downloading CSV…')
  const dl = await downloadCsv((p) => process.stdout.write(`\rdownload: ${p.current}/${p.total || '?'} `))
  console.log('\nImporting CSV…')
  const imp = await importCsv(dl.path, (p) => process.stdout.write(`\rparse: ${p.current}/${p.total || '?'} `))
  console.log('\nImported:', imp.inserted, 'rows')

  console.log('Indexing embeddings (this takes 2–5 min on M-series)…')
  let lastLog = 0
  const idx = await indexEmbeddings((p) => {
    if (Date.now() - lastLog > 1000) {
      console.log(`embed: ${p.current}/${p.total} (${((p.current/p.total)*100).toFixed(1)}%)`)
      lastLog = Date.now()
    }
  })
  console.log('Embedded:', idx.indexed, 'of', idx.total)

  app.quit()
})
```

Run it (note: this will take 5–10 minutes total on the first run):

```bash
NODE_ENV=development npx electron /tmp/verify-indexer.js 2>&1 | tail -30
```

Verify the DB state:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT COUNT(*) as total, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded FROM danbooru_tags;"
```

Expected: `total` is ~150,000 (the exact number depends on the CSV snapshot, anywhere in 100k–200k is plausible). `embedded` equals `total`.

Spot-check a tag:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT name, post_count, length(embedding) as emb_bytes FROM danbooru_tags WHERE name='1girl';"
```

Expected: `1girl|<big number>|1536` (the 1536 bytes = 384 floats × 4 bytes confirms the BLOB is correctly sized).

Clean up:

```bash
rm /tmp/verify-indexer.js
```

- [ ] **Step 3: Commit**

```bash
git add src/main/tags/indexer.js
git commit -m "feat(tags): CSV importer + embedding indexer with batched transactions"
```

---

## Task 7: Search backend — FTS5 + cosine + RRF

**Files:**
- Create: `src/main/tags/search.js`

The search backend is what the AI tool call will invoke (Plan 3) and what the Settings DevTools test will exercise. It does:
1. **FTS5 keyword search** ranked by `bm25(table) * log(1 + post_count)` (post-count-aware).
2. **Cosine search** against the in-memory embedding matrix.
3. **Reciprocal Rank Fusion** to merge the two ranked lists.

The embedding matrix is loaded lazily on first search and cached in module-scope memory. At ~150k tags × 384 floats × 4 bytes = ~225 MB, the matrix dominates main-process memory; that's the accepted trade-off for fast cosine.

- [ ] **Step 1: Create the search module**

```javascript
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
```

- [ ] **Step 2: Verify the search returns sensible results**

Create `/tmp/verify-search.js`:

```javascript
const { app } = require('electron')
app.whenReady().then(async () => {
  const { searchTags } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/tags/search')

  const queries = ['red hair', 'golden hour lighting', 'cinematic mood']
  for (const q of queries) {
    console.log(`\n--- "${q}" ---`)
    const results = await searchTags(q, { limit: 8 })
    for (const t of results) {
      console.log(`  ${t.name.padEnd(35)} cat=${t.category} count=${t.post_count}`)
    }
  }
  app.quit()
})
```

Run:

```bash
NODE_ENV=development npx electron /tmp/verify-search.js 2>&1 | tail -40
```

Expected:
- `red hair` should return `red hair` as the top result, followed by semantically-related variants like `crimson hair`, `auburn hair`, `red haired`, etc.
- `golden hour lighting` should pick up `golden hour`, `sunset`, `evening`, `warm lighting`, etc.
- `cinematic mood` should return tags like `cinematic`, `dramatic lighting`, `moody`, etc.

If results look like random tags (no semantic relevance), the embedding cache failed to load — check that Task 6 populated the embeddings.

Clean up:

```bash
rm /tmp/verify-search.js
```

- [ ] **Step 3: Commit**

```bash
git add src/main/tags/search.js
git commit -m "feat(tags): FTS5 + cosine + RRF search backend"
```

---

## Task 8: IPC handlers — library management + search

**Files:**
- Create: `src/main/ipc/prompt-library.js`
- Modify: `src/main/index.js`
- Modify: `src/main/preload.js`

Three handlers:
- `prompt:search-tags` — request/response, used by AI tool calls (Plan 3) and the renderer UI.
- `prompt:library-status` — returns `{ version, count, indexed }`.
- `prompt:library-refresh` — long-running, streams `prompt:library-progress` events via `webContents.send`. Returns `{ inserted, indexed }` when done.

- [ ] **Step 1: Create the IPC handler module**

```javascript
// src/main/ipc/prompt-library.js
//
// IPC handlers for the Danbooru tag library: search, status, and refresh.

const { ipcMain, BrowserWindow } = require('electron')
const { getDatabase } = require('../db/database')
const { downloadCsv } = require('../tags/downloader')
const { importCsv, indexEmbeddings } = require('../tags/indexer')
const { searchTags, unloadEmbeddingCache } = require('../tags/search')

let refreshInProgress = false

function registerPromptLibraryHandlers() {
  ipcMain.handle('prompt:search-tags', async (_e, { query, options }) => {
    return searchTags(query, options || {})
  })

  ipcMain.handle('prompt:library-status', () => {
    const db = getDatabase()
    const countRow = db.prepare('SELECT COUNT(*) as c FROM danbooru_tags').get()
    const indexedRow = db.prepare(
      'SELECT COUNT(*) as c FROM danbooru_tags WHERE embedding IS NOT NULL'
    ).get()
    const versionRow = db.prepare("SELECT value FROM settings WHERE key = 'danbooru_library_version'").get()
    return {
      count: countRow.c,
      indexed_count: indexedRow.c,
      indexed: indexedRow.c > 0 && indexedRow.c === countRow.c,
      version: versionRow ? versionRow.value : null,
      refreshInProgress,
    }
  })

  ipcMain.handle('prompt:library-refresh', async (event) => {
    if (refreshInProgress) {
      return { ok: false, reason: 'Refresh already in progress' }
    }
    refreshInProgress = true

    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload) => {
      if (win && !win.isDestroyed()) win.webContents.send('prompt:library-progress', payload)
    }

    const db = getDatabase()

    try {
      emit({ phase: 'download', current: 0, total: 0 })
      const dl = await downloadCsv((p) => emit(p))

      emit({ phase: 'parse', current: 0, total: 0 })
      // Drop the in-memory embedding cache before wiping the table.
      unloadEmbeddingCache()
      const imp = await importCsv(dl.path, (p) => emit(p))

      emit({ phase: 'embed', current: 0, total: imp.inserted })
      const idx = await indexEmbeddings((p) => emit(p))

      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run('danbooru_library_version', now)
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run('danbooru_library_count', String(imp.inserted))
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run('danbooru_library_indexed', idx.indexed === imp.inserted ? 'true' : 'false')

      emit({ phase: 'done', current: imp.inserted, total: imp.inserted })
      return { ok: true, inserted: imp.inserted, indexed: idx.indexed }
    } catch (err) {
      emit({ phase: 'error', message: String(err && err.message || err) })
      return { ok: false, reason: String(err && err.message || err) }
    } finally {
      refreshInProgress = false
    }
  })
}

module.exports = { registerPromptLibraryHandlers }
```

- [ ] **Step 2: Register the handler in `src/main/index.js`**

Open `src/main/index.js`. After the existing `const { registerSearchHandlers } = require('./ipc/search')` line, add:

```javascript
const { registerPromptLibraryHandlers } = require('./ipc/prompt-library')
```

Then in the `app.whenReady().then(...)` callback, after `registerSearchHandlers()`, add:

```javascript
  registerPromptLibraryHandlers()
```

- [ ] **Step 3: Expose the new IPC surface in `preload.js`**

Open `src/main/preload.js`. The current `contextBridge.exposeInMainWorld('forge', { ... })` block exposes several namespaces. Add a new `prompt` namespace alongside the existing ones (insert after the existing `search` namespace, before `scanner`):

```javascript
  prompt: {
    searchTags: (query, options) => ipcRenderer.invoke('prompt:search-tags', { query, options }),
    libraryStatus: () => ipcRenderer.invoke('prompt:library-status'),
    libraryRefresh: () => ipcRenderer.invoke('prompt:library-refresh'),
  },
```

Then extend the event allowlist in the `on` method. Find the existing line:

```javascript
    const allowed = ['inbox:new-item']
```

Change to:

```javascript
    const allowed = ['inbox:new-item', 'prompt:library-progress']
```

- [ ] **Step 4: Verify the IPC surface**

Start the dev server: `npm run dev`. Wait for the window. Open the renderer DevTools (View → Toggle Developer Tools). In the console:

```javascript
const status = await window.forge.prompt.libraryStatus()
console.log(status)
```

Expected: `{ count: <some number>, indexed_count: <some number>, indexed: true, version: '<ISO>', refreshInProgress: false }` (Task 6's verification populated the DB already).

Then:

```javascript
const results = await window.forge.prompt.searchTags('red hair', { limit: 5 })
console.log(results)
```

Expected: an array of 5 tag objects with sensible matches.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/prompt-library.js src/main/index.js src/main/preload.js
git commit -m "feat(prompt): IPC surface for tag library search/status/refresh"
```

---

## Task 9: Settings UI — Prompt Builder section

**Files:**
- Modify: `src/renderer/pages/Settings.jsx`

A new section displays library status and a "Refresh tag library" button. When the refresh is running, the button shows progress (download → parse → embed → done), driven by `prompt:library-progress` events.

- [ ] **Step 1: Add state and effect for library status + progress**

Open `src/renderer/pages/Settings.jsx`. Inside `export default function Settings() { ... }`, after the existing `useState` declarations (around line 45), add:

```javascript
  const [libStatus, setLibStatus] = useState(null)
  const [libProgress, setLibProgress] = useState(null)
  const [libRefreshing, setLibRefreshing] = useState(false)
```

After the existing initial `useEffect` (which loads `forge.settings.getAll`), add a second effect that loads library status and subscribes to progress events:

```javascript
  useEffect(() => {
    window.forge.prompt.libraryStatus().then(setLibStatus).catch(() => {})
    const handler = (payload) => setLibProgress(payload)
    window.forge.on('prompt:library-progress', handler)
    return () => window.forge.off('prompt:library-progress', handler)
  }, [])
```

- [ ] **Step 2: Add the refresh handler**

Below the existing `toggleAutoScan` function, add:

```javascript
  const refreshTagLibrary = async () => {
    setLibRefreshing(true)
    setLibProgress(null)
    try {
      const result = await window.forge.prompt.libraryRefresh()
      if (result.ok) {
        showToast(`Tag library refreshed: ${result.inserted} tags indexed.`)
      } else {
        showToast(`Refresh failed: ${result.reason}`)
      }
      const fresh = await window.forge.prompt.libraryStatus()
      setLibStatus(fresh)
    } catch (err) {
      showToast(`Refresh error: ${err.message || err}`)
    } finally {
      setLibRefreshing(false)
      setLibProgress(null)
    }
  }
```

- [ ] **Step 3: Add the Prompt Builder section to the JSX**

Find the closing `</div>` that ends the auto-scan toggle card (around line 206). Before that final closing `</div>` (the one that closes the `max-w-2xl mx-auto px-8 py-10`), add:

```jsx
        {/* Prompt Builder — Tag Library */}
        <div className="rounded-xl p-5 mt-4" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#eae5dc' }}>Prompt Builder — Tag Library</p>
          <p className="text-xs mb-4" style={{ color: '#bfb8a8' }}>
            Local Danbooru tag library used by the AI prompt builder. Includes ~150k tags with semantic embeddings.
          </p>

          {libStatus && libStatus.count > 0 ? (
            <div className="flex items-center justify-between mb-3 text-xs" style={{ color: '#bfb8a8' }}>
              <div>
                <span style={{ color: '#7daa88', fontWeight: 600 }}>{libStatus.count.toLocaleString()}</span>
                {' tags · '}
                {libStatus.indexed ? (
                  <span style={{ color: '#7daa88' }}>indexed</span>
                ) : (
                  <span style={{ color: '#e8c820' }}>
                    {libStatus.indexed_count.toLocaleString()} / {libStatus.count.toLocaleString()} indexed
                  </span>
                )}
                {libStatus.version && ' · last refreshed ' + new Date(libStatus.version).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <p className="text-xs mb-3" style={{ color: '#e8c820' }}>Not yet downloaded.</p>
          )}

          {libRefreshing && libProgress && (
            <div className="mb-3">
              <p className="text-xs mb-1" style={{ color: '#635c48' }}>
                {libProgress.phase === 'download' && `Downloading… ${(libProgress.current / 1_000_000).toFixed(1)} MB`}
                {libProgress.phase === 'parse' && `Parsing… ${libProgress.current.toLocaleString()} tags`}
                {libProgress.phase === 'embed' && `Indexing embeddings… ${libProgress.current.toLocaleString()} / ${libProgress.total.toLocaleString()}`}
                {libProgress.phase === 'done' && 'Done.'}
                {libProgress.phase === 'error' && `Error: ${libProgress.message}`}
              </p>
              {libProgress.total > 0 && libProgress.phase !== 'done' && libProgress.phase !== 'error' && (
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#302c1e' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: '#e8c820',
                      width: `${Math.min(100, (libProgress.current / libProgress.total) * 100)}%`,
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <button
            onClick={refreshTagLibrary}
            disabled={libRefreshing}
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              background: libRefreshing ? '#302c1e' : '#242118',
              color: libRefreshing ? '#635c48' : '#bfb8a8',
              cursor: libRefreshing ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (!libRefreshing) e.currentTarget.style.background = '#302c1e' }}
            onMouseLeave={e => { if (!libRefreshing) e.currentTarget.style.background = '#242118' }}
          >
            {libRefreshing ? 'Refreshing…' : libStatus && libStatus.count > 0 ? '↻ Refresh tag library' : '⇩ Download tag library'}
          </button>
        </div>
```

- [ ] **Step 4: Verify the UI**

Start: `npm run dev`. Go to Settings (sidebar gear).

Expected (since Task 6 already populated the DB):
- A new "Prompt Builder — Tag Library" card appears below "Auto-scan Output Folder".
- It shows the tag count (e.g. "152,398 tags · indexed · last refreshed 2026-05-13").
- The button reads "↻ Refresh tag library".

Click the button to confirm the refresh flow works end-to-end through the UI:
- Button text changes to "Refreshing…" and is disabled.
- Progress text + bar update as the phases progress (download → parse → embed → done).
- On completion: a toast says "Tag library refreshed: NNNNN tags indexed."
- The status display updates with the new count + refresh date.

If the user has not yet downloaded the library, the button initially reads "⇩ Download tag library". Test this path by first running `sqlite3 ... "DELETE FROM danbooru_tags"` and observing the UI updates after a status refresh.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/Settings.jsx
git commit -m "feat(settings): Prompt Builder section — tag library status + refresh"
```

---

## Task 10: Update `CLAUDE.md` to reflect the new tables and version

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the schema version note from 5 → 6**

Open `CLAUDE.md`. Find the line:

```
- `db/database.js` — singleton `better-sqlite3` connection at `userData/forge.db` with `journal_mode=WAL`, `foreign_keys=ON`. Schema versioning uses `PRAGMA user_version`; bumping the version requires both updating `schema.sql` and adding an `ALTER`/backfill block before the new `user_version` is set (current version: 5).
```

Change `(current version: 5)` → `(current version: 6)`.

- [ ] **Step 2: Append a sentence about the tag library tables**

Find the `db/schema.sql` bullet (the one ending with "…keep them in sync."). Append after that sentence (within the same bullet):

```
The Danbooru tag library lives in `danbooru_tags` (with `danbooru_tags_fts` FTS5 virtual table and three sync triggers — keep them aligned if the schema changes) and is populated from `a1111-sd-webui-tagcomplete`'s `tags/danbooru.csv` via the Settings "Refresh tag library" action.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document tag library tables and bump schema version to 6"
```

---

## Task 11: End-to-end verification

**Files:** (none — verification only)

- [ ] **Step 1: Fresh-install simulation**

Drop the entire tag library and verify the full flow works from scratch:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "DELETE FROM danbooru_tags; UPDATE settings SET value = NULL WHERE key IN ('danbooru_library_version', 'danbooru_library_count', 'danbooru_library_indexed');"
```

Confirm the table is empty:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT COUNT(*) FROM danbooru_tags;"
```

Expected: `0`.

- [ ] **Step 2: Run the full UI flow**

Start `npm run dev`. Navigate to Settings. The "Prompt Builder — Tag Library" card should show "Not yet downloaded." and the button reads "⇩ Download tag library."

Click the button. Observe:
1. Phase "Downloading…" with byte count growing.
2. Phase "Parsing…" with tag count growing.
3. Phase "Indexing embeddings…" with `<n> / <total>` progress and a yellow progress bar. This phase takes 3–5 minutes on M-series.
4. Phase "Done." then the card re-renders with the final count + date.

A toast announces completion.

- [ ] **Step 3: Search through DevTools**

In the renderer DevTools console (after the refresh finishes):

```javascript
const results = await window.forge.prompt.searchTags('moody portrait', { limit: 10 })
console.log(results.map(r => r.name))
```

Expected: an array of 10 semantically-related tag names.

- [ ] **Step 4: Restart the app, verify persistence**

⌘Q to quit, then `npm run dev` again. Open Settings. The status should still show the indexed library — no re-download needed.

Run another search via DevTools to confirm the embedding cache reloads correctly (first search after a fresh boot may take ~1 second longer because the in-memory matrix is being rebuilt from the BLOB column).

- [ ] **Step 5: Confirm the tag cache file on disk**

```bash
ls -lh "$HOME/Library/Application Support/forge/tags-cache/"
```

Expected: `danbooru.csv` exists, ~10 MB.

---

## Self-Review checklist

Before considering Plan 2 done:

- **Spec coverage:** The spec's "Tag library" section requires CSV source + FTS5 + MiniLM embeddings + RRF search — all covered by Tasks 3, 4, 5, 6, 7. The "Settings additions" section's tag library row + refresh button is Task 9. The "First-launch download flow" modal is intentionally deferred to Plan 4 (the pane); the Settings refresh path is the v1 trigger.

- **Placeholder scan:** No "TBD" / "TODO" / "implement later" remains; every step has code or commands.

- **Type consistency:**
  - The `embedding` BLOB layout (Float32 × 384, little-endian per JS default) is consistent across the indexer's `Buffer.from(vec.buffer, ...)` and the search's `new Float32Array(blob.buffer, blob.byteOffset, DIM)`.
  - The progress event payload `{ phase, current, total }` is the same shape across `downloader`, `indexer`, and the Settings UI.
  - `prompt:library-progress` is allowlisted in both `preload.js` and used by the renderer effect.

## Out-of-scope for Plan 2

- The Prompt Builder pane (Plan 4).
- DeepSeek client / AI tool-call loop (Plan 3) — though Plan 3 will use `prompt:search-tags` from this plan as the tool-loop's `search_tags` function.
- The first-launch download modal (the prompt builder pane will show this in Plan 4). For Plan 2, the user triggers refresh from Settings.
- Incremental CSV merge (we wipe + reload on each refresh — fine for v1, may revisit if refreshes become slow).
- HNSW or approximate-NN search — full linear cosine at 150k tags is ~15–25 ms on M-series, fast enough.
- Per-LoRA trigger word indexing — that's handled in Plan 3 by injecting them directly into the AI context, not into the tag library.
