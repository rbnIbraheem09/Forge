# Forge Sessions 2–7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Forge app — Inbox auto-scan, Main Gens, Iteration gallery, LoRA/Checkpoint pages, Dashboard, Search, and .dmg packaging — on top of the existing Electron+React+SQLite scaffold.

**Architecture:** Vertical slices: each slice (Inbox → Main Gens → Iterations → LoRAs/Checkpoints → Dashboard → Search → Polish) is fully usable before the next begins. All DB access goes through `better-sqlite3` in the Electron main process via IPC handlers in `src/main/ipc/`; the renderer calls `window.forge.*` methods exposed via contextBridge in `preload.js`. No state management library — React context for toasts and inbox count only.

**Tech Stack:** Electron 33, React 18, Vite 6, Tailwind CSS 3, better-sqlite3 11, chokidar 4, pngjs 7, react-router-dom 6

---

## File Map

### New files (main process)
- `src/main/db/schema.sql` — rewritten: all tables including main_gens, iterations, inbox_items, etc.
- `src/main/scanner/png-metadata.js` — pure fn: reads ComfyUI tEXt chunks from PNG buffer
- `src/main/scanner/output-scanner.js` — chokidar watcher for output_folder; inserts inbox_items
- `src/main/scanner/folder-scanner.js` — scans loras/checkpoints folder, upserts records
- `src/main/ipc/inbox.js` — inbox:list, inbox:assign, inbox:dismiss, inbox:count
- `src/main/ipc/main-gens.js` — main-gens:* CRUD
- `src/main/ipc/iterations.js` — iterations:* CRUD + global-fields:*
- `src/main/ipc/loras.js` — loras:scan, loras:list, loras:get, loras:update, loras:usage
- `src/main/ipc/models.js` — models:scan, models:list, models:get, models:update, models:usage
- `src/main/ipc/dashboard.js` — dashboard:stats, top-loras, top-checkpoints, pinned-main-gens, starred-iterations, recent-main-gens
- `src/main/ipc/search.js` — search:query

### Modified files (main process)
- `src/main/db/database.js` — add schema versioning via PRAGMA user_version
- `src/main/index.js` — register all new IPC handlers; start output scanner on ready
- `src/main/preload.js` — expose all new namespaces + IPC event bridge

### New files (renderer)
- `src/renderer/context/ToastContext.jsx` — toast provider + useToast hook
- `src/renderer/context/InboxContext.jsx` — inbox count provider; listens for inbox:new-item IPC event
- `src/renderer/components/Toast.jsx` — toast notification UI
- `src/renderer/components/ConfirmDialog.jsx` — delete confirmation modal
- `src/renderer/components/GalleryGrid.jsx` — reusable S/M/L image grid
- `src/renderer/components/MetadataPanel.jsx` — iteration detail side panel
- `src/renderer/components/CompareOverlay.jsx` — side-by-side iteration compare modal
- `src/renderer/components/TagChips.jsx` — tag chip editor
- `src/renderer/components/SearchOverlay.jsx` — ⌘K search modal
- `src/renderer/pages/Inbox.jsx` — inbox page with multi-select + assign
- `src/renderer/pages/MainGensList.jsx` — all Main Gens grid (replaces GenerationsList stub)
- `src/renderer/pages/MainGenDetail.jsx` — single Main Gen with iteration gallery
- `src/renderer/pages/LoRADetail.jsx` — LoRA detail page
- `src/renderer/pages/ModelDetail.jsx` — Checkpoint detail page
- `src/renderer/pages/OnboardingModal.jsx` — first-launch 3-step modal

### Modified files (renderer)
- `src/renderer/App.jsx` — wrap in providers; add ⌘K listener; add all routes
- `src/renderer/components/Sidebar.jsx` — inbox badge; updated nav items
- `src/renderer/pages/Dashboard.jsx` — full implementation (replaces stub)
- `src/renderer/pages/LoRAsList.jsx` — full implementation (replaces stub)
- `src/renderer/pages/ModelsList.jsx` — full implementation (replaces stub)
- `src/renderer/pages/Settings.jsx` — add rescan buttons, gallery size selector, auto-scan toggle

### Config
- `package.json` — add chokidar, pngjs

---

## Task 1: Install dependencies + init git

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Init git and install new packages**

```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject
git init
git add .
git commit -m "chore: initial scaffold (session 1)"
npm install chokidar pngjs
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('chokidar'); require('pngjs'); console.log('OK')"
```
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add chokidar and pngjs dependencies"
```

---

## Task 2: Rewrite DB schema + migration

**Files:**
- Rewrite: `src/main/db/schema.sql`
- Modify: `src/main/db/database.js`

- [ ] **Step 1: Rewrite schema.sql**

Replace the entire file with:

```sql
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'online',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  default_weight REAL DEFAULT 1.0,
  status TEXT DEFAULT 'online',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS main_gens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  hero_image_path TEXT,
  hero_color TEXT,
  pinned INTEGER DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  main_gen_id INTEGER NOT NULL REFERENCES main_gens(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,
  title TEXT,
  image_path TEXT NOT NULL,
  prompt TEXT,
  negative_prompt TEXT,
  seed TEXT,
  steps INTEGER,
  cfg REAL,
  sampler TEXT,
  scheduler TEXT,
  width INTEGER,
  height INTEGER,
  checkpoint_id INTEGER REFERENCES models(id),
  starred INTEGER DEFAULT 0,
  starred_at TEXT,
  notes TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iteration_loras (
  iteration_id INTEGER REFERENCES iterations(id) ON DELETE CASCADE,
  lora_id INTEGER REFERENCES loras(id),
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (iteration_id, lora_id)
);

CREATE TABLE IF NOT EXISTS iteration_custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iteration_id INTEGER NOT NULL REFERENCES iterations(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT
);

CREATE TABLE IF NOT EXISTS global_field_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL UNIQUE,
  extracted_metadata TEXT,
  detected_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

- [ ] **Step 2: Update database.js to drop old tables and apply new schema**

Replace `src/main/db/database.js` entirely:

```js
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
  db.pragma('user_version = 2')

  return db
}

module.exports = { getDatabase }
```

- [ ] **Step 3: Delete the old DB file so the app starts fresh (dev only)**

```bash
rm -f ~/Library/Application\ Support/forge/forge.db
```

- [ ] **Step 4: Verify schema loads without error**

```bash
npm run dev
```

Open DevTools console — should see no errors. Quit the app.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.sql src/main/db/database.js
git commit -m "feat: rewrite DB schema for main_gens, iterations, inbox (session 2)"
```

---

## Task 3: PNG metadata extractor

**Files:**
- Create: `src/main/scanner/png-metadata.js`

- [ ] **Step 1: Create the extractor**

```js
// src/main/scanner/png-metadata.js
const fs = require('fs')

/**
 * Reads ComfyUI workflow metadata embedded in a PNG tEXt chunk.
 * Returns a parsed metadata object or null if nothing found.
 */
function extractPngMetadata(imagePath) {
  let buffer
  try {
    buffer = fs.readFileSync(imagePath)
  } catch {
    return null
  }

  const raw = readPngTextChunks(buffer)
  const workflowJson = raw.workflow || raw.prompt || null
  if (!workflowJson) return null

  let workflow
  try {
    workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson
  } catch {
    return null
  }

  return parseComfyWorkflow(workflow)
}

function readPngTextChunks(buffer) {
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIG[i]) return {}
  }

  const chunks = {}
  let offset = 8

  while (offset < buffer.length - 12) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii')

    if (type === 'tEXt') {
      const data = buffer.slice(offset + 8, offset + 8 + length)
      const nullIdx = data.indexOf(0)
      if (nullIdx !== -1) {
        const key = data.slice(0, nullIdx).toString('ascii')
        const value = data.slice(nullIdx + 1).toString('latin1')
        chunks[key] = value
      }
    } else if (type === 'iTXt') {
      const data = buffer.slice(offset + 8, offset + 8 + length)
      const nullIdx = data.indexOf(0)
      if (nullIdx !== -1) {
        const key = data.slice(0, nullIdx).toString('ascii')
        // iTXt: keyword\0compression_flag(1)\0compression_method(1)\0language\0translated_keyword\0text
        const rest = data.slice(nullIdx + 1)
        const textStart = rest.indexOf(0, 2) + 1 // skip two flags
        const langEnd = rest.indexOf(0, textStart)
        const transEnd = rest.indexOf(0, langEnd + 1)
        const value = rest.slice(transEnd + 1).toString('utf8')
        chunks[key] = value
      }
    } else if (type === 'IEND') {
      break
    }

    offset += 12 + length
  }

  return chunks
}

function parseComfyWorkflow(workflow) {
  const result = {
    seed: null,
    steps: null,
    cfg: null,
    sampler: null,
    scheduler: null,
    prompt: null,
    negative_prompt: null,
    checkpoint_name: null,
    loras: [],
    width: null,
    height: null,
  }

  if (!workflow || typeof workflow !== 'object') return result

  const nodes = Object.values(workflow)
  const textNodes = []

  for (const node of nodes) {
    if (!node || !node.class_type) continue
    const inputs = node.inputs || {}

    switch (node.class_type) {
      case 'KSampler':
      case 'KSamplerAdvanced':
        if (inputs.seed !== undefined) result.seed = String(inputs.seed)
        if (inputs.steps !== undefined) result.steps = Number(inputs.steps)
        if (inputs.cfg !== undefined) result.cfg = Number(inputs.cfg)
        if (inputs.sampler_name) result.sampler = inputs.sampler_name
        if (inputs.scheduler) result.scheduler = inputs.scheduler
        break

      case 'CLIPTextEncode':
        if (typeof inputs.text === 'string') textNodes.push(inputs.text)
        break

      case 'CheckpointLoaderSimple':
      case 'CheckpointLoader':
        if (inputs.ckpt_name) {
          result.checkpoint_name = inputs.ckpt_name.replace(/\.[^.]+$/, '')
        }
        break

      case 'LoraLoader':
      case 'LoRALoader':
        if (inputs.lora_name) {
          result.loras.push({
            name: inputs.lora_name.replace(/\.[^.]+$/, ''),
            weight: inputs.strength_model !== undefined ? Number(inputs.strength_model) : 1.0,
          })
        }
        break

      case 'EmptyLatentImage':
        if (inputs.width) result.width = Number(inputs.width)
        if (inputs.height) result.height = Number(inputs.height)
        break
    }
  }

  // First text node = positive prompt, second = negative (ComfyUI convention)
  if (textNodes[0]) result.prompt = textNodes[0]
  if (textNodes[1]) result.negative_prompt = textNodes[1]

  return result
}

module.exports = { extractPngMetadata }
```

- [ ] **Step 2: Smoke test it manually**

```bash
node -e "
const { extractPngMetadata } = require('./src/main/scanner/png-metadata')
// Test with a non-PNG — should return null
const r = extractPngMetadata('/tmp/nonexistent.png')
console.log('missing file:', r) // null
console.log('OK')
"
```

Expected: `missing file: null` then `OK`

- [ ] **Step 3: Commit**

```bash
git add src/main/scanner/png-metadata.js
git commit -m "feat: PNG tEXt chunk reader for ComfyUI metadata extraction"
```

---

## Task 4: Output folder scanner (chokidar)

**Files:**
- Create: `src/main/scanner/output-scanner.js`

- [ ] **Step 1: Create the scanner**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/scanner/output-scanner.js
git commit -m "feat: chokidar output folder watcher for inbox auto-scan"
```

---

## Task 5: Folder scanner for LoRAs and Checkpoints

**Files:**
- Create: `src/main/scanner/folder-scanner.js`

- [ ] **Step 1: Create the folder scanner**

```js
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
    // Mark all as offline if folder doesn't exist
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

  // Mark records not found in this scan as offline
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/scanner/folder-scanner.js
git commit -m "feat: folder scanner for LoRA and checkpoint auto-import"
```

---

## Task 6: Inbox IPC handlers

**Files:**
- Create: `src/main/ipc/inbox.js`

- [ ] **Step 1: Create inbox.js**

```js
// src/main/ipc/inbox.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function randomHeroColor() {
  const hue = Math.floor(Math.random() * 360)
  const sat = 30 + Math.floor(Math.random() * 30)
  const light = 20 + Math.floor(Math.random() * 15)
  return hslToHex(hue, sat, light)
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function registerInboxHandlers() {
  ipcMain.handle('inbox:list', () => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM inbox_items ORDER BY detected_at DESC').all()
  })

  ipcMain.handle('inbox:count', () => {
    const db = getDatabase()
    return db.prepare('SELECT COUNT(*) as n FROM inbox_items').get().n
  })

  ipcMain.handle('inbox:dismiss', (_e, { ids }) => {
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`DELETE FROM inbox_items WHERE id IN (${placeholders})`).run(...ids)
    return true
  })

  ipcMain.handle('inbox:assign', (_e, { itemIds, mainGenId, newTitle }) => {
    const db = getDatabase()

    return db.transaction(() => {
      let targetId = mainGenId

      if (!targetId && newTitle) {
        const heroColor = randomHeroColor()
        const result = db.prepare(
          'INSERT INTO main_gens (title, hero_color) VALUES (?, ?)'
        ).run(newTitle.trim(), heroColor)
        targetId = result.lastInsertRowid
      }

      if (!targetId) throw new Error('Must provide mainGenId or newTitle')

      const maxRow = db.prepare(
        'SELECT COALESCE(MAX(iteration_number), 0) as max FROM iterations WHERE main_gen_id = ?'
      ).get(targetId)
      let nextNumber = maxRow.max + 1

      const items = db.prepare(
        `SELECT * FROM inbox_items WHERE id IN (${itemIds.map(() => '?').join(',')})`
      ).all(...itemIds)

      for (const item of items) {
        const meta = item.extracted_metadata ? JSON.parse(item.extracted_metadata) : {}

        // Resolve checkpoint id by name
        let checkpointId = null
        if (meta.checkpoint_name) {
          const model = db.prepare('SELECT id FROM models WHERE name = ?').get(meta.checkpoint_name)
          if (model) checkpointId = model.id
        }

        const iter = db.prepare(`
          INSERT INTO iterations
            (main_gen_id, iteration_number, image_path, prompt, negative_prompt,
             seed, steps, cfg, sampler, scheduler, width, height, checkpoint_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetId, nextNumber, item.image_path,
          meta.prompt || null, meta.negative_prompt || null,
          meta.seed || null, meta.steps || null, meta.cfg || null,
          meta.sampler || null, meta.scheduler || null,
          meta.width || null, meta.height || null,
          checkpointId
        )

        // Link LoRAs
        if (meta.loras && meta.loras.length > 0) {
          for (const l of meta.loras) {
            const loraRow = db.prepare('SELECT id FROM loras WHERE name = ?').get(l.name)
            if (loraRow) {
              db.prepare(
                'INSERT OR IGNORE INTO iteration_loras (iteration_id, lora_id, weight) VALUES (?, ?, ?)'
              ).run(iter.lastInsertRowid, loraRow.id, l.weight)
            }
          }
        }

        nextNumber++
      }

      // Update main_gen updated_at
      db.prepare('UPDATE main_gens SET updated_at = datetime("now") WHERE id = ?').run(targetId)

      // Delete from inbox
      const placeholders = itemIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM inbox_items WHERE id IN (${placeholders})`).run(...itemIds)

      return { mainGenId: targetId }
    })()
  })
}

module.exports = { registerInboxHandlers }
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc/inbox.js
git commit -m "feat: inbox IPC handlers (list, count, assign, dismiss)"
```

---

## Task 7: Main Gens IPC handlers

**Files:**
- Create: `src/main/ipc/main-gens.js`

- [ ] **Step 1: Create main-gens.js**

```js
// src/main/ipc/main-gens.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerMainGensHandlers() {
  ipcMain.handle('main-gens:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      GROUP BY mg.id
      ORDER BY mg.pinned DESC, mg.updated_at DESC
    `).all()
  })

  ipcMain.handle('main-gens:get', (_e, { id }) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      WHERE mg.id = ?
      GROUP BY mg.id
    `).get(id)
  })

  ipcMain.handle('main-gens:create', (_e, { title }) => {
    const db = getDatabase()
    const heroColor = randomHeroColor()
    const result = db.prepare(
      'INSERT INTO main_gens (title, hero_color) VALUES (?, ?)'
    ).run(title.trim(), heroColor)
    return db.prepare('SELECT * FROM main_gens WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('main-gens:update', (_e, { id, title, hero_image_path, hero_color, pinned, notes, tags }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (title !== undefined) { fields.push('title = ?'); values.push(title.trim()) }
    if (hero_image_path !== undefined) { fields.push('hero_image_path = ?'); values.push(hero_image_path) }
    if (hero_color !== undefined) { fields.push('hero_color = ?'); values.push(hero_color) }
    if (pinned !== undefined) { fields.push('pinned = ?'); values.push(pinned ? 1 : 0) }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (tags !== undefined) { fields.push('tags = ?'); values.push(tags) }
    fields.push('updated_at = datetime("now")')
    if (fields.length === 1) return true
    db.prepare(`UPDATE main_gens SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })

  ipcMain.handle('main-gens:delete', (_e, { id }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM main_gens WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('main-gens:set-hero', (_e, { id, iterationId }) => {
    const db = getDatabase()
    const iter = db.prepare('SELECT image_path FROM iterations WHERE id = ?').get(iterationId)
    if (!iter) return false
    db.prepare('UPDATE main_gens SET hero_image_path = ?, updated_at = datetime("now") WHERE id = ?')
      .run(iter.image_path, id)
    return true
  })
}

function randomHeroColor() {
  const hue = Math.floor(Math.random() * 360)
  const sat = 30 + Math.floor(Math.random() * 30)
  const light = 20 + Math.floor(Math.random() * 15)
  const h = hue; const s = sat / 100; const l = light / 100
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

module.exports = { registerMainGensHandlers }
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc/main-gens.js
git commit -m "feat: main-gens IPC handlers (CRUD, pin, set-hero)"
```

---

## Task 8: Iterations IPC handlers

**Files:**
- Create: `src/main/ipc/iterations.js`

- [ ] **Step 1: Create iterations.js**

```js
// src/main/ipc/iterations.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerIterationsHandlers() {
  ipcMain.handle('iterations:list', (_e, { mainGenId }) => {
    const db = getDatabase()
    const iterations = db.prepare(`
      SELECT i.*, m.name as checkpoint_name
      FROM iterations i
      LEFT JOIN models m ON m.id = i.checkpoint_id
      WHERE i.main_gen_id = ?
      ORDER BY i.iteration_number ASC
    `).all(mainGenId)

    for (const iter of iterations) {
      iter.loras = db.prepare(`
        SELECT l.id, l.name, il.weight
        FROM iteration_loras il
        JOIN loras l ON l.id = il.lora_id
        WHERE il.iteration_id = ?
      `).all(iter.id)
    }
    return iterations
  })

  ipcMain.handle('iterations:get', (_e, { id }) => {
    const db = getDatabase()
    const iter = db.prepare(`
      SELECT i.*, m.name as checkpoint_name
      FROM iterations i
      LEFT JOIN models m ON m.id = i.checkpoint_id
      WHERE i.id = ?
    `).get(id)
    if (!iter) return null
    iter.loras = db.prepare(`
      SELECT l.id, l.name, il.weight
      FROM iteration_loras il
      JOIN loras l ON l.id = il.lora_id
      WHERE il.iteration_id = ?
    `).all(id)
    iter.custom_fields = db.prepare(
      'SELECT id, field_key, field_value FROM iteration_custom_fields WHERE iteration_id = ? ORDER BY id'
    ).all(id)
    return iter
  })

  ipcMain.handle('iterations:create', (_e, { mainGenId, imagePath, extractedMetadata }) => {
    const db = getDatabase()
    return db.transaction(() => {
      const maxRow = db.prepare(
        'SELECT COALESCE(MAX(iteration_number), 0) as max FROM iterations WHERE main_gen_id = ?'
      ).get(mainGenId)
      const iterNum = maxRow.max + 1
      const meta = extractedMetadata || {}

      let checkpointId = null
      if (meta.checkpoint_name) {
        const model = db.prepare('SELECT id FROM models WHERE name = ?').get(meta.checkpoint_name)
        if (model) checkpointId = model.id
      }

      const result = db.prepare(`
        INSERT INTO iterations
          (main_gen_id, iteration_number, image_path, prompt, negative_prompt,
           seed, steps, cfg, sampler, scheduler, width, height, checkpoint_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mainGenId, iterNum, imagePath,
        meta.prompt || null, meta.negative_prompt || null,
        meta.seed || null, meta.steps || null, meta.cfg || null,
        meta.sampler || null, meta.scheduler || null,
        meta.width || null, meta.height || null, checkpointId
      )

      if (meta.loras) {
        for (const l of meta.loras) {
          const loraRow = db.prepare('SELECT id FROM loras WHERE name = ?').get(l.name)
          if (loraRow) {
            db.prepare(
              'INSERT OR IGNORE INTO iteration_loras (iteration_id, lora_id, weight) VALUES (?, ?, ?)'
            ).run(result.lastInsertRowid, loraRow.id, l.weight)
          }
        }
      }

      db.prepare('UPDATE main_gens SET updated_at = datetime("now") WHERE id = ?').run(mainGenId)
      return { id: result.lastInsertRowid, iteration_number: iterNum }
    })()
  })

  ipcMain.handle('iterations:update', (_e, { id, title, starred, notes, tags }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (title !== undefined) { fields.push('title = ?'); values.push(title) }
    if (starred !== undefined) {
      fields.push('starred = ?'); values.push(starred ? 1 : 0)
      fields.push('starred_at = ?'); values.push(starred ? new Date().toISOString() : null)
    }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (tags !== undefined) { fields.push('tags = ?'); values.push(tags) }
    if (fields.length === 0) return true
    db.prepare(`UPDATE iterations SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })

  ipcMain.handle('iterations:delete', (_e, { id }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM iterations WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('iterations:set-loras', (_e, { id, loras }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM iteration_loras WHERE iteration_id = ?').run(id)
    for (const l of loras) {
      db.prepare(
        'INSERT OR IGNORE INTO iteration_loras (iteration_id, lora_id, weight) VALUES (?, ?, ?)'
      ).run(id, l.loraId, l.weight)
    }
    return true
  })

  ipcMain.handle('iterations:set-custom-fields', (_e, { id, fields }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM iteration_custom_fields WHERE iteration_id = ?').run(id)
    for (const f of fields) {
      db.prepare(
        'INSERT INTO iteration_custom_fields (iteration_id, field_key, field_value) VALUES (?, ?, ?)'
      ).run(id, f.key, f.value)
    }
    return true
  })

  ipcMain.handle('global-fields:list', () => {
    const db = getDatabase()
    return db.prepare('SELECT field_key FROM global_field_templates ORDER BY id').all().map(r => r.field_key)
  })

  ipcMain.handle('global-fields:pin', (_e, { key }) => {
    const db = getDatabase()
    db.prepare('INSERT OR IGNORE INTO global_field_templates (field_key) VALUES (?)').run(key)
    return true
  })

  ipcMain.handle('global-fields:unpin', (_e, { key }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM global_field_templates WHERE field_key = ?').run(key)
    return true
  })
}

module.exports = { registerIterationsHandlers }
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc/iterations.js
git commit -m "feat: iterations IPC handlers (CRUD, loras, custom fields, global templates)"
```

---

## Task 9: LoRA + Model (Checkpoint) IPC handlers

**Files:**
- Create: `src/main/ipc/loras.js`
- Create: `src/main/ipc/models.js`

- [ ] **Step 1: Create loras.js**

```js
// src/main/ipc/loras.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')
const { scanLorasFolder } = require('../scanner/folder-scanner')

function registerLorasHandlers() {
  ipcMain.handle('loras:scan', () => {
    const db = getDatabase()
    const folder = db.prepare("SELECT value FROM settings WHERE key = 'loras_folder'").get()
    return scanLorasFolder(folder ? folder.value : null)
  })

  ipcMain.handle('loras:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT l.*, COUNT(il.iteration_id) as usage_count
      FROM loras l
      LEFT JOIN iteration_loras il ON il.lora_id = l.id
      GROUP BY l.id
      ORDER BY usage_count DESC, l.name ASC
    `).all()
  })

  ipcMain.handle('loras:get', (_e, { id }) => {
    const db = getDatabase()
    const lora = db.prepare(`
      SELECT l.*,
        COUNT(il.iteration_id) as usage_count,
        AVG(il.weight) as avg_weight,
        COUNT(DISTINCT i.main_gen_id) as main_gen_count
      FROM loras l
      LEFT JOIN iteration_loras il ON il.lora_id = l.id
      LEFT JOIN iterations i ON i.id = il.iteration_id
      WHERE l.id = ?
      GROUP BY l.id
    `).get(id)
    return lora
  })

  ipcMain.handle('loras:update', (_e, { id, notes, default_weight }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (default_weight !== undefined) { fields.push('default_weight = ?'); values.push(default_weight) }
    if (fields.length === 0) return true
    db.prepare(`UPDATE loras SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })

  ipcMain.handle('loras:usage', (_e, { id, minWeight, maxWeight, checkpointId }) => {
    const db = getDatabase()
    let query = `
      SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id, il.weight,
        mg.title as main_gen_title
      FROM iteration_loras il
      JOIN iterations i ON i.id = il.iteration_id
      JOIN main_gens mg ON mg.id = i.main_gen_id
      WHERE il.lora_id = ?
    `
    const params = [id]
    if (minWeight !== undefined) { query += ' AND il.weight >= ?'; params.push(minWeight) }
    if (maxWeight !== undefined) { query += ' AND il.weight <= ?'; params.push(maxWeight) }
    if (checkpointId) { query += ' AND i.checkpoint_id = ?'; params.push(checkpointId) }
    query += ' ORDER BY i.created_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('loras:create', (_e, { name, file_path, notes, default_weight }) => {
    const db = getDatabase()
    const result = db.prepare(
      'INSERT INTO loras (name, file_path, notes, default_weight) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), file_path || null, notes || null, default_weight || 1.0)
    return db.prepare('SELECT * FROM loras WHERE id = ?').get(result.lastInsertRowid)
  })
}

module.exports = { registerLorasHandlers }
```

- [ ] **Step 2: Create models.js**

```js
// src/main/ipc/models.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')
const { scanCheckpointsFolder } = require('../scanner/folder-scanner')

function registerModelsHandlers() {
  ipcMain.handle('models:scan', () => {
    const db = getDatabase()
    const folder = db.prepare("SELECT value FROM settings WHERE key = 'checkpoints_folder'").get()
    return scanCheckpointsFolder(folder ? folder.value : null)
  })

  ipcMain.handle('models:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT m.*, COUNT(i.id) as usage_count
      FROM models m
      LEFT JOIN iterations i ON i.checkpoint_id = m.id
      GROUP BY m.id
      ORDER BY usage_count DESC, m.name ASC
    `).all()
  })

  ipcMain.handle('models:get', (_e, { id }) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT m.*, COUNT(i.id) as usage_count,
        COUNT(DISTINCT i.main_gen_id) as main_gen_count
      FROM models m
      LEFT JOIN iterations i ON i.checkpoint_id = m.id
      WHERE m.id = ?
      GROUP BY m.id
    `).get(id)
  })

  ipcMain.handle('models:update', (_e, { id, notes }) => {
    const db = getDatabase()
    db.prepare('UPDATE models SET notes = ? WHERE id = ?').run(notes, id)
    return true
  })

  ipcMain.handle('models:usage', (_e, { id }) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id,
        mg.title as main_gen_title
      FROM iterations i
      JOIN main_gens mg ON mg.id = i.main_gen_id
      WHERE i.checkpoint_id = ?
      ORDER BY i.created_at DESC
    `).all(id)
  })

  ipcMain.handle('models:create', (_e, { name, file_path, notes }) => {
    const db = getDatabase()
    const result = db.prepare(
      'INSERT INTO models (name, file_path, notes) VALUES (?, ?, ?)'
    ).run(name.trim(), file_path || null, notes || null)
    return db.prepare('SELECT * FROM models WHERE id = ?').get(result.lastInsertRowid)
  })
}

module.exports = { registerModelsHandlers }
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/loras.js src/main/ipc/models.js
git commit -m "feat: loras and models IPC handlers with folder scan"
```

---

## Task 10: Dashboard + Search IPC handlers

**Files:**
- Create: `src/main/ipc/dashboard.js`
- Create: `src/main/ipc/search.js`

- [ ] **Step 1: Create dashboard.js**

```js
// src/main/ipc/dashboard.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerDashboardHandlers() {
  ipcMain.handle('dashboard:stats', () => {
    const db = getDatabase()
    return {
      mainGensCount: db.prepare('SELECT COUNT(*) as n FROM main_gens').get().n,
      iterationsCount: db.prepare('SELECT COUNT(*) as n FROM iterations').get().n,
      lorasCount: db.prepare('SELECT COUNT(*) as n FROM loras').get().n,
      checkpointsCount: db.prepare('SELECT COUNT(*) as n FROM models').get().n,
      starredCount: db.prepare('SELECT COUNT(*) as n FROM iterations WHERE starred = 1').get().n,
    }
  })

  ipcMain.handle('dashboard:top-loras', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT l.id, l.name, COUNT(il.iteration_id) as usage_count
      FROM loras l
      JOIN iteration_loras il ON il.lora_id = l.id
      GROUP BY l.id
      ORDER BY usage_count DESC
      LIMIT 5
    `).all()
  })

  ipcMain.handle('dashboard:top-checkpoints', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT m.id, m.name, COUNT(i.id) as usage_count
      FROM models m
      JOIN iterations i ON i.checkpoint_id = m.id
      GROUP BY m.id
      ORDER BY usage_count DESC
      LIMIT 5
    `).all()
  })

  ipcMain.handle('dashboard:pinned-main-gens', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      WHERE mg.pinned = 1
      GROUP BY mg.id
      ORDER BY mg.updated_at DESC
    `).all()
  })

  ipcMain.handle('dashboard:starred-iterations', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT i.*, mg.title as main_gen_title
      FROM iterations i
      JOIN main_gens mg ON mg.id = i.main_gen_id
      WHERE i.starred = 1
      ORDER BY i.starred_at DESC
      LIMIT 10
    `).all()
  })

  ipcMain.handle('dashboard:recent-main-gens', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT mg.*, COUNT(i.id) as iteration_count
      FROM main_gens mg
      LEFT JOIN iterations i ON i.main_gen_id = mg.id
      GROUP BY mg.id
      ORDER BY mg.updated_at DESC
      LIMIT 5
    `).all()
  })
}

module.exports = { registerDashboardHandlers }
```

- [ ] **Step 2: Create search.js**

```js
// src/main/ipc/search.js
const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerSearchHandlers() {
  ipcMain.handle('search:query', (_e, { query, filters = {} }) => {
    const db = getDatabase()
    const q = `%${query}%`
    const { types = [], starred, hasTags } = filters
    const includeAll = types.length === 0

    const results = { mainGens: [], iterations: [], loras: [], checkpoints: [] }

    if (includeAll || types.includes('main-gens')) {
      let sql = `
        SELECT id, title, hero_image_path, hero_color, tags, updated_at
        FROM main_gens
        WHERE (title LIKE ? OR notes LIKE ? OR tags LIKE ?)
      `
      const params = [q, q, q]
      if (hasTags) { sql += ' AND tags IS NOT NULL AND tags != ""'; }
      sql += ' ORDER BY updated_at DESC LIMIT 20'
      results.mainGens = db.prepare(sql).all(...params)
    }

    if (includeAll || types.includes('iterations')) {
      let sql = `
        SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id, i.seed,
          i.starred, i.tags, i.created_at, mg.title as main_gen_title
        FROM iterations i
        JOIN main_gens mg ON mg.id = i.main_gen_id
        WHERE (i.title LIKE ? OR i.prompt LIKE ? OR i.negative_prompt LIKE ?
          OR i.notes LIKE ? OR i.tags LIKE ? OR i.seed = ?)
      `
      const params = [q, q, q, q, q, query]
      if (starred) { sql += ' AND i.starred = 1' }
      if (hasTags) { sql += ' AND i.tags IS NOT NULL AND i.tags != ""' }
      sql += ' ORDER BY i.created_at DESC LIMIT 20'
      results.iterations = db.prepare(sql).all(...params)
    }

    if (includeAll || types.includes('loras')) {
      results.loras = db.prepare(
        "SELECT id, name, notes, status FROM loras WHERE name LIKE ? OR notes LIKE ? LIMIT 10"
      ).all(q, q)
    }

    if (includeAll || types.includes('checkpoints')) {
      results.checkpoints = db.prepare(
        "SELECT id, name, notes, status FROM models WHERE name LIKE ? OR notes LIKE ? LIMIT 10"
      ).all(q, q)
    }

    return results
  })
}

module.exports = { registerSearchHandlers }
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/dashboard.js src/main/ipc/search.js
git commit -m "feat: dashboard and search IPC handlers"
```

---

## Task 11: Wire up main process — index.js + preload.js

**Files:**
- Modify: `src/main/index.js`
- Modify: `src/main/preload.js`

- [ ] **Step 1: Rewrite index.js**

```js
// src/main/index.js
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { registerForgeProtocol, handleForgeProtocol } = require('./protocol')
const { registerSettingsHandlers } = require('./ipc/settings')
const { registerInboxHandlers } = require('./ipc/inbox')
const { registerMainGensHandlers } = require('./ipc/main-gens')
const { registerIterationsHandlers } = require('./ipc/iterations')
const { registerLorasHandlers } = require('./ipc/loras')
const { registerModelsHandlers } = require('./ipc/models')
const { registerDashboardHandlers } = require('./ipc/dashboard')
const { registerSearchHandlers } = require('./ipc/search')
const { startOutputScanner, stopOutputScanner } = require('./scanner/output-scanner')
const { scanLorasFolder } = require('./scanner/folder-scanner')
const { scanCheckpointsFolder } = require('./scanner/folder-scanner')
const { getDatabase } = require('./db/database')

registerForgeProtocol()

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }
}

app.whenReady().then(() => {
  handleForgeProtocol()

  registerSettingsHandlers()
  registerInboxHandlers()
  registerMainGensHandlers()
  registerIterationsHandlers()
  registerLorasHandlers()
  registerModelsHandlers()
  registerDashboardHandlers()
  registerSearchHandlers()

  createWindow()

  // Start auto-scan after window is ready
  mainWindow.webContents.once('did-finish-load', () => {
    const db = getDatabase()
    const outputFolder = db.prepare("SELECT value FROM settings WHERE key = 'output_folder'").get()
    if (outputFolder) startOutputScanner(outputFolder.value, mainWindow)

    const lorasFolder = db.prepare("SELECT value FROM settings WHERE key = 'loras_folder'").get()
    if (lorasFolder) scanLorasFolder(lorasFolder.value)

    const checkpointsFolder = db.prepare("SELECT value FROM settings WHERE key = 'checkpoints_folder'").get()
    if (checkpointsFolder) scanCheckpointsFolder(checkpointsFolder.value)
  })

  // Restart scanner when output_folder setting changes
  ipcMain.on('scanner:restart', () => {
    const db = getDatabase()
    const outputFolder = db.prepare("SELECT value FROM settings WHERE key = 'output_folder'").get()
    stopOutputScanner()
    if (outputFolder) startOutputScanner(outputFolder.value, mainWindow)
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  stopOutputScanner()
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Rewrite preload.js**

```js
// src/main/preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('forge', {
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    openFolderPicker: () => ipcRenderer.invoke('settings:openFolderPicker'),
  },
  inbox: {
    list: () => ipcRenderer.invoke('inbox:list'),
    count: () => ipcRenderer.invoke('inbox:count'),
    assign: (args) => ipcRenderer.invoke('inbox:assign', args),
    dismiss: (args) => ipcRenderer.invoke('inbox:dismiss', args),
  },
  mainGens: {
    list: () => ipcRenderer.invoke('main-gens:list'),
    get: (id) => ipcRenderer.invoke('main-gens:get', { id }),
    create: (title) => ipcRenderer.invoke('main-gens:create', { title }),
    update: (args) => ipcRenderer.invoke('main-gens:update', args),
    delete: (id) => ipcRenderer.invoke('main-gens:delete', { id }),
    setHero: (id, iterationId) => ipcRenderer.invoke('main-gens:set-hero', { id, iterationId }),
  },
  iterations: {
    list: (mainGenId) => ipcRenderer.invoke('iterations:list', { mainGenId }),
    get: (id) => ipcRenderer.invoke('iterations:get', { id }),
    create: (args) => ipcRenderer.invoke('iterations:create', args),
    update: (args) => ipcRenderer.invoke('iterations:update', args),
    delete: (id) => ipcRenderer.invoke('iterations:delete', { id }),
    setLoras: (id, loras) => ipcRenderer.invoke('iterations:set-loras', { id, loras }),
    setCustomFields: (id, fields) => ipcRenderer.invoke('iterations:set-custom-fields', { id, fields }),
  },
  globalFields: {
    list: () => ipcRenderer.invoke('global-fields:list'),
    pin: (key) => ipcRenderer.invoke('global-fields:pin', { key }),
    unpin: (key) => ipcRenderer.invoke('global-fields:unpin', { key }),
  },
  loras: {
    scan: () => ipcRenderer.invoke('loras:scan'),
    list: () => ipcRenderer.invoke('loras:list'),
    get: (id) => ipcRenderer.invoke('loras:get', { id }),
    update: (args) => ipcRenderer.invoke('loras:update', args),
    usage: (args) => ipcRenderer.invoke('loras:usage', args),
    create: (args) => ipcRenderer.invoke('loras:create', args),
  },
  models: {
    scan: () => ipcRenderer.invoke('models:scan'),
    list: () => ipcRenderer.invoke('models:list'),
    get: (id) => ipcRenderer.invoke('models:get', { id }),
    update: (args) => ipcRenderer.invoke('models:update', args),
    usage: (id) => ipcRenderer.invoke('models:usage', { id }),
    create: (args) => ipcRenderer.invoke('models:create', args),
  },
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats'),
    topLoras: () => ipcRenderer.invoke('dashboard:top-loras'),
    topCheckpoints: () => ipcRenderer.invoke('dashboard:top-checkpoints'),
    pinnedMainGens: () => ipcRenderer.invoke('dashboard:pinned-main-gens'),
    starredIterations: () => ipcRenderer.invoke('dashboard:starred-iterations'),
    recentMainGens: () => ipcRenderer.invoke('dashboard:recent-main-gens'),
  },
  search: {
    query: (args) => ipcRenderer.invoke('search:query', args),
  },
  scanner: {
    restart: () => ipcRenderer.send('scanner:restart'),
  },
  on: (channel, callback) => {
    const allowed = ['inbox:new-item']
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => callback(...args))
    }
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback)
  },
})
```

- [ ] **Step 3: Start the app and verify no errors in the console**

```bash
npm run dev
```

Open DevTools → Console. Should show no errors. Quit.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.js src/main/preload.js
git commit -m "feat: wire all IPC handlers and output scanner into main process"
```

---

## Task 12: Toast system + ConfirmDialog

**Files:**
- Create: `src/renderer/context/ToastContext.jsx`
- Create: `src/renderer/components/Toast.jsx`
- Create: `src/renderer/components/ConfirmDialog.jsx`

- [ ] **Step 1: Create ToastContext.jsx**

```jsx
// src/renderer/context/ToastContext.jsx
import React, { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast(null), 2200)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-[9999] pointer-events-none"
          style={{ background: '#7c6ff7', color: '#fff' }}
        >
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
```

- [ ] **Step 2: Create ConfirmDialog.jsx**

```jsx
// src/renderer/components/ConfirmDialog.jsx
import React, { useEffect } from 'react'

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl p-6 w-80 shadow-2xl"
        style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1" style={{ color: '#f0f0f0' }}>{title}</h3>
        <p className="text-sm mb-5" style={{ color: '#888' }}>{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ background: '#2a2a2e', color: '#888' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: '#c0392b', color: '#fff' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/context/ToastContext.jsx src/renderer/components/ConfirmDialog.jsx
git commit -m "feat: toast system and confirm dialog components"
```

---

## Task 13: InboxContext + Sidebar update + App.jsx rewire

**Files:**
- Create: `src/renderer/context/InboxContext.jsx`
- Modify: `src/renderer/components/Sidebar.jsx`
- Modify: `src/renderer/App.jsx`

- [ ] **Step 1: Create InboxContext.jsx**

```jsx
// src/renderer/context/InboxContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react'

const InboxContext = createContext(0)

export function InboxProvider({ children }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    window.forge.inbox.count().then(setCount)
    const handler = ({ count: n }) => setCount(n)
    window.forge.on('inbox:new-item', handler)
    return () => window.forge.off('inbox:new-item', handler)
  }, [])

  return <InboxContext.Provider value={{ count, setCount }}>{children}</InboxContext.Provider>
}

export function useInbox() {
  return useContext(InboxContext)
}
```

- [ ] **Step 2: Rewrite App.jsx**

```jsx
// src/renderer/App.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import SearchOverlay from './components/SearchOverlay.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inbox from './pages/Inbox.jsx'
import MainGensList from './pages/MainGensList.jsx'
import MainGenDetail from './pages/MainGenDetail.jsx'
import LoRAsList from './pages/LoRAsList.jsx'
import LoRADetail from './pages/LoRADetail.jsx'
import ModelsList from './pages/ModelsList.jsx'
import ModelDetail from './pages/ModelDetail.jsx'
import Extras from './pages/Extras.jsx'
import Settings from './pages/Settings.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { InboxProvider } from './context/InboxContext.jsx'

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <HashRouter>
      <ToastProvider>
        <InboxProvider>
          <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0e0e0f' }}>
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/main-gens" element={<MainGensList />} />
                <Route path="/main-gens/:id" element={<MainGenDetail />} />
                <Route path="/loras" element={<LoRAsList />} />
                <Route path="/loras/:id" element={<LoRADetail />} />
                <Route path="/models" element={<ModelsList />} />
                <Route path="/models/:id" element={<ModelDetail />} />
                <Route path="/extras" element={<Extras />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
            <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
          </div>
        </InboxProvider>
      </ToastProvider>
    </HashRouter>
  )
}
```

- [ ] **Step 3: Rewrite Sidebar.jsx**

```jsx
// src/renderer/components/Sidebar.jsx
import React from 'react'
import { NavLink } from 'react-router-dom'
import { useInbox } from '../context/InboxContext.jsx'

function NavItem({ icon, label, to, end, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-100 ${
          isActive
            ? 'bg-[#7c6ff7]/15 text-[#7c6ff7] font-medium'
            : 'text-[#888] hover:text-[#f0f0f0] hover:bg-white/5'
        }`
      }
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
          style={{ background: '#c0392b', color: '#fff' }}>
          {badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { count } = useInbox()

  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full pt-8 pb-4 px-3"
      style={{ width: '220px', background: '#141415', borderRight: '1px solid #2a2a2e' }}
    >
      <div className="px-3 mb-6">
        <h1 className="text-base font-semibold tracking-wide" style={{ color: '#f0f0f0' }}>Forge</h1>
        <p className="text-xs mt-0.5" style={{ color: '#555' }}>Generation Manager</p>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <NavItem icon="🏠" label="Dashboard" to="/" end />
        <NavItem icon="📥" label="Inbox" to="/inbox" badge={count} />
        <NavItem icon="🗂" label="Main Gens" to="/main-gens" />
        <NavItem icon="🎛" label="LoRAs" to="/loras" />
        <NavItem icon="🧱" label="Checkpoints" to="/models" />
        <NavItem icon="📝" label="Extras" to="/extras" />
      </nav>

      <div className="mt-auto">
        <div style={{ borderTop: '1px solid #2a2a2e' }} className="pt-3">
          <NavItem icon="⚙️" label="Settings" to="/settings" />
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Run app and verify sidebar renders correctly**

```bash
npm run dev
```

Verify: sidebar shows all nav items, Inbox has no badge (0). No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/context/InboxContext.jsx src/renderer/App.jsx src/renderer/components/Sidebar.jsx
git commit -m "feat: inbox badge, updated nav, providers, and routing"
```

---

## Task 14: Inbox page

**Files:**
- Create: `src/renderer/pages/Inbox.jsx`

- [ ] **Step 1: Create Inbox.jsx**

```jsx
// src/renderer/pages/Inbox.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'
import { useInbox } from '../context/InboxContext.jsx'

export default function Inbox() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [mainGens, setMainGens] = useState([])
  const [loading, setLoading] = useState(true)
  const [newGenTitle, setNewGenTitle] = useState('')
  const [showNewGenInput, setShowNewGenInput] = useState(false)
  const showToast = useToast()
  const { setCount } = useInbox()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const [inboxItems, gens] = await Promise.all([
      window.forge.inbox.list(),
      window.forge.mainGens.list(),
    ])
    setItems(inboxItems)
    setMainGens(gens)
    setCount(inboxItems.length)
    setLoading(false)
  }, [setCount])

  useEffect(() => { load() }, [load])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(items.map(i => i.id)))
  }

  const assign = async (args) => {
    const itemIds = [...selected]
    const result = await window.forge.inbox.assign({ itemIds, ...args })
    showToast(`Assigned ${itemIds.length} image${itemIds.length > 1 ? 's' : ''}.`)
    setSelected(new Set())
    await load()
    navigate(`/main-gens/${result.mainGenId}`)
  }

  const dismiss = async () => {
    await window.forge.inbox.dismiss({ ids: [...selected] })
    showToast('Dismissed.')
    setSelected(new Set())
    await load()
  }

  if (loading) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-2xl">📥</div>
        <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>Inbox is empty</p>
        <p className="text-xs" style={{ color: '#555' }}>New images from your ComfyUI output folder will appear here.</p>
      </div>
    )
  }

  const selectedArr = [...selected]

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#f0f0f0' }}>Inbox</h1>
          <p className="text-xs mt-0.5" style={{ color: '#555' }}>{items.length} new image{items.length !== 1 ? 's' : ''} detected</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ background: '#2a2a2e', color: '#888' }}
          >
            Select All
          </button>
          <button
            onClick={() => {}}
            disabled={selectedArr.length === 0}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity"
            style={{
              background: '#7c6ff7',
              color: '#fff',
              opacity: selectedArr.length === 0 ? 0.4 : 1,
              cursor: selectedArr.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Assign Selected ({selectedArr.length})
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {items.map(item => {
          const meta = item.extracted_metadata ? JSON.parse(item.extracted_metadata) : {}
          const isSelected = selected.has(item.id)
          return (
            <div
              key={item.id}
              onClick={() => toggleSelect(item.id)}
              className="relative cursor-pointer rounded-xl overflow-hidden"
              style={{
                border: `2px solid ${isSelected ? '#7c6ff7' : '#2a2a2e'}`,
                aspectRatio: '1',
              }}
            >
              <img
                src={`forge://${item.image_path}`}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }}
              />
              {/* Checkbox */}
              <div
                className="absolute top-2 left-2 w-5 h-5 rounded flex items-center justify-center"
                style={{
                  background: isSelected ? '#7c6ff7' : 'rgba(0,0,0,0.5)',
                  border: isSelected ? 'none' : '1.5px solid #555',
                }}
              >
                {isSelected && <span className="text-white text-xs">✓</span>}
              </div>
              {/* Meta overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                {meta.seed && <p className="text-[10px]" style={{ color: '#ccc' }}>seed {meta.seed}</p>}
                {meta.steps && <p className="text-[10px]" style={{ color: '#aaa' }}>{meta.steps} steps</p>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Assign panel */}
      {selectedArr.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#1c1c1e', border: '1px solid #7c6ff7' }}
        >
          <p className="text-sm font-medium mb-3" style={{ color: '#f0f0f0' }}>
            Assign {selectedArr.length} image{selectedArr.length !== 1 ? 's' : ''} to:
          </p>
          <div className="flex flex-wrap gap-2">
            {showNewGenInput ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newGenTitle.trim()) assign({ newTitle: newGenTitle })
                }}
              >
                <input
                  autoFocus
                  value={newGenTitle}
                  onChange={(e) => setNewGenTitle(e.target.value)}
                  placeholder="New Main Gen title…"
                  className="rounded-lg px-3 py-1.5 text-sm outline-none"
                  style={{ background: '#0e0e0f', border: '1px solid #7c6ff7', color: '#f0f0f0', width: '200px' }}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: '#7c6ff7', color: '#fff' }}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGenInput(false)}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: '#2a2a2e', color: '#888' }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowNewGenInput(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: '#7c6ff7', color: '#fff' }}
              >
                + New Main Gen
              </button>
            )}
            {mainGens.map(mg => (
              <button
                key={mg.id}
                onClick={() => assign({ mainGenId: mg.id })}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: '#2a2a2e', color: '#aaa' }}
              >
                {mg.title} <span style={{ color: '#555' }}>{mg.iteration_count} iters</span>
              </button>
            ))}
            <button
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg text-sm ml-auto"
              style={{ background: '#1a1a1c', color: '#555', border: '1px solid #2a2a2e' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test in the app**

```bash
npm run dev
```

Navigate to Inbox. Should show empty state. Set output folder in Settings to a folder with PNGs and verify items appear.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/Inbox.jsx
git commit -m "feat: inbox page with multi-select and batch assign"
```

---

## Task 15: GalleryGrid component

**Files:**
- Create: `src/renderer/components/GalleryGrid.jsx`

- [ ] **Step 1: Create GalleryGrid.jsx**

```jsx
// src/renderer/components/GalleryGrid.jsx
import React from 'react'

const SIZE_COLS = { S: 6, M: 4, L: 2 }

export default function GalleryGrid({
  items,
  size = 'M',
  selectedId,
  compareMode = false,
  compareSelected = new Set(),
  onSelect,
  onCompareToggle,
  renderOverlay,
}) {
  const cols = SIZE_COLS[size] || 4

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const isSelected = item.id === selectedId
        const inCompare = compareSelected.has(item.id)

        return (
          <div
            key={item.id}
            onClick={() => {
              if (compareMode) onCompareToggle?.(item.id)
              else onSelect?.(item.id)
            }}
            className="relative cursor-pointer rounded-lg overflow-hidden group"
            style={{
              aspectRatio: '0.85',
              border: `2px solid ${isSelected && !compareMode ? '#7c6ff7' : inCompare ? '#7c6ff7' : 'transparent'}`,
              background: '#1c1c1e',
            }}
          >
            <img
              src={`forge://${item.image_path}`}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.background = '#2a2a2e'; e.target.style.display = 'none' }}
            />

            {/* Compare checkbox */}
            {compareMode && (
              <div
                className="absolute top-1.5 left-1.5 w-4 h-4 rounded flex items-center justify-center"
                style={{
                  background: inCompare ? '#7c6ff7' : 'rgba(0,0,0,0.6)',
                  border: inCompare ? 'none' : '1.5px solid #666',
                }}
              >
                {inCompare && <span className="text-white text-[9px]">✓</span>}
              </div>
            )}

            {/* Iteration badge */}
            <div
              className="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium leading-none"
              style={{
                background: 'rgba(0,0,0,0.65)',
                color: '#ccc',
                display: compareMode ? 'none' : 'block',
              }}
            >
              #{item.iteration_number}
            </div>

            {/* Custom overlay slot */}
            {renderOverlay && renderOverlay(item)}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/GalleryGrid.jsx
git commit -m "feat: GalleryGrid component with S/M/L sizes and compare mode"
```

---

## Task 16: TagChips component

**Files:**
- Create: `src/renderer/components/TagChips.jsx`

- [ ] **Step 1: Create TagChips.jsx**

```jsx
// src/renderer/components/TagChips.jsx
import React, { useState } from 'react'

export default function TagChips({ tags = '', onChange }) {
  const [input, setInput] = useState('')
  const list = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []

  const addTag = (tag) => {
    const t = tag.trim()
    if (!t || list.includes(t)) return
    onChange([...list, t].join(','))
    setInput('')
  }

  const removeTag = (tag) => {
    onChange(list.filter(t => t !== tag).join(','))
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {list.map(tag => (
        <span
          key={tag}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
          style={{ background: '#2a2a2e', color: '#aaa' }}
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="ml-0.5 leading-none"
            style={{ color: '#555' }}
          >×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addTag(input)
          }
        }}
        placeholder="Add tag…"
        className="text-xs outline-none bg-transparent"
        style={{ color: '#888', minWidth: '70px', maxWidth: '120px' }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/TagChips.jsx
git commit -m "feat: TagChips inline editor component"
```

---

## Task 17: MetadataPanel component

**Files:**
- Create: `src/renderer/components/MetadataPanel.jsx`

- [ ] **Step 1: Create MetadataPanel.jsx**

```jsx
// src/renderer/components/MetadataPanel.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import TagChips from './TagChips.jsx'
import { useToast } from '../context/ToastContext.jsx'

function FieldRow({ label, value, dimmed }) {
  return (
    <div className="flex justify-between items-start gap-2 text-xs">
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color: dimmed ? '#666' : '#f0f0f0', textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
    </div>
  )
}

export default function MetadataPanel({ iterationId, mainGenId, onClose, onStarChange }) {
  const [iter, setIter] = useState(null)
  const [globalFields, setGlobalFields] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [notesDraft, setNotesDraft] = useState('')
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [negExpanded, setNegExpanded] = useState(false)
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimer = useRef(null)

  const load = useCallback(async () => {
    const [data, gf] = await Promise.all([
      window.forge.iterations.get(iterationId),
      window.forge.globalFields.list(),
    ])
    setIter(data)
    setNotesDraft(data.notes || '')
    setGlobalFields(gf)

    // Merge custom fields with global templates (show global fields even if empty)
    const existing = data.custom_fields || []
    const existingKeys = new Set(existing.map(f => f.field_key))
    const merged = [
      ...existing,
      ...gf.filter(k => !existingKeys.has(k)).map(k => ({ field_key: k, field_value: '' })),
    ]
    setCustomFields(merged)
  }, [iterationId])

  useEffect(() => { load() }, [load])

  const saveNotes = useCallback(async (val) => {
    await window.forge.iterations.update({ id: iterationId, notes: val })
  }, [iterationId])

  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotesDraft(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNotes(val), 500)
  }

  const toggleStar = async () => {
    const next = !iter.starred
    await window.forge.iterations.update({ id: iterationId, starred: next })
    setIter(prev => ({ ...prev, starred: next }))
    onStarChange?.()
  }

  const saveCustomFields = async (fields) => {
    const toSave = fields.filter(f => f.field_key && f.field_value !== '')
    await window.forge.iterations.setCustomFields(iterationId, toSave.map(f => ({ key: f.field_key, value: f.field_value })))
  }

  const updateCustomField = (idx, key, value) => {
    setCustomFields(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: value }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveCustomFields(next), 500)
      return next
    })
  }

  const removeCustomField = (idx) => {
    setCustomFields(prev => {
      const next = prev.filter((_, i) => i !== idx)
      saveCustomFields(next)
      return next
    })
  }

  const pinField = async (key) => {
    const isPinned = globalFields.includes(key)
    if (isPinned) {
      await window.forge.globalFields.unpin(key)
      setGlobalFields(prev => prev.filter(k => k !== key))
      showToast('Field unpinned.')
    } else {
      await window.forge.globalFields.pin(key)
      setGlobalFields(prev => [...prev, key])
      showToast('Field pinned globally.')
    }
  }

  const saveTags = async (tags) => {
    await window.forge.iterations.update({ id: iterationId, tags })
    setIter(prev => ({ ...prev, tags }))
  }

  if (!iter) return (
    <div className="w-64 h-full flex items-center justify-center" style={{ color: '#555', fontSize: 12 }}>
      Loading…
    </div>
  )

  return (
    <div
      className="flex-shrink-0 overflow-y-auto h-full"
      style={{ width: '240px', background: '#141415', borderLeft: '1px solid #2a2a2e' }}
    >
      <div className="p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>
              {iter.title || `Iteration #${iter.iteration_number}`}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#555' }}>
              {new Date(iter.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleStar} className="text-base leading-none">
              {iter.starred ? '⭐' : '☆'}
            </button>
            <button onClick={onClose} className="text-sm" style={{ color: '#555' }}>✕</button>
          </div>
        </div>

        {/* Extracted */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Extracted</p>
          <div
            className="rounded-lg p-3 flex flex-col gap-2"
            style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
          >
            <FieldRow label="Seed" value={iter.seed} />
            <FieldRow label="Steps" value={iter.steps} />
            <FieldRow label="CFG" value={iter.cfg} />
            <FieldRow label="Sampler" value={iter.sampler} />
            <FieldRow label="Scheduler" value={iter.scheduler} />
            <FieldRow label="Size" value={iter.width ? `${iter.width}×${iter.height}` : null} />
            {iter.checkpoint_name && (
              <div className="flex justify-between items-start text-xs">
                <span style={{ color: '#555' }}>Checkpoint</span>
                <button
                  onClick={() => navigate(`/models/${iter.checkpoint_id}`)}
                  className="text-right"
                  style={{ color: '#7c6ff7', wordBreak: 'break-all' }}
                >
                  {iter.checkpoint_name}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* LoRAs */}
        {iter.loras && iter.loras.length > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>LoRAs</p>
            <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
              {iter.loras.map(l => (
                <div key={l.id} className="flex justify-between items-center text-xs">
                  <button
                    onClick={() => navigate(`/loras/${l.id}`)}
                    style={{ color: '#7c6ff7' }}
                  >
                    {l.name}
                  </button>
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#2a2a2e', color: '#f0f0f0' }}>
                    {l.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prompt */}
        <div>
          <button
            className="text-[9px] uppercase tracking-wider mb-2 flex items-center gap-1"
            style={{ color: '#555' }}
            onClick={() => setPromptExpanded(p => !p)}
          >
            Prompt {promptExpanded ? '▲' : '▼'}
          </button>
          {promptExpanded && (
            <p className="text-xs leading-relaxed" style={{ color: '#aaa' }}>
              {iter.prompt || '—'}
            </p>
          )}
        </div>

        {/* Negative Prompt */}
        <div>
          <button
            className="text-[9px] uppercase tracking-wider mb-2 flex items-center gap-1"
            style={{ color: '#555' }}
            onClick={() => setNegExpanded(p => !p)}
          >
            Negative {negExpanded ? '▲' : '▼'}
          </button>
          {negExpanded && (
            <p className="text-xs leading-relaxed" style={{ color: '#aaa' }}>
              {iter.negative_prompt || '—'}
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Notes</p>
          <textarea
            value={notesDraft}
            onChange={handleNotesChange}
            placeholder="Your notes…"
            rows={4}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none"
            style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0' }}
          />
        </div>

        {/* Custom Fields */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Custom Fields</p>
          <div className="flex flex-col gap-1.5">
            {customFields.map((f, idx) => {
              const isPinned = globalFields.includes(f.field_key)
              return (
                <div key={idx} className="flex items-center gap-1">
                  <input
                    value={f.field_key}
                    onChange={(e) => updateCustomField(idx, 'field_key', e.target.value)}
                    placeholder="Key"
                    className="flex-1 rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#888', width: '70px' }}
                  />
                  <input
                    value={f.field_value}
                    onChange={(e) => updateCustomField(idx, 'field_value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0', width: '70px' }}
                  />
                  <button
                    onClick={() => pinField(f.field_key)}
                    title={isPinned ? 'Unpin globally' : 'Pin globally'}
                    className="text-xs"
                    style={{ color: isPinned ? '#7c6ff7' : '#444' }}
                  >📌</button>
                  <button onClick={() => removeCustomField(idx)} className="text-xs" style={{ color: '#444' }}>✕</button>
                </div>
              )
            })}
            <button
              onClick={() => setCustomFields(prev => [...prev, { field_key: '', field_value: '' }])}
              className="text-xs mt-1"
              style={{ color: '#7c6ff7' }}
            >
              + Add field
            </button>
          </div>
        </div>

        {/* Tags */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Tags</p>
          <TagChips tags={iter.tags || ''} onChange={saveTags} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/MetadataPanel.jsx
git commit -m "feat: MetadataPanel with auto-save, custom fields, pin, tags"
```

---

## Task 18: CompareOverlay component

**Files:**
- Create: `src/renderer/components/CompareOverlay.jsx`

- [ ] **Step 1: Create CompareOverlay.jsx**

```jsx
// src/renderer/components/CompareOverlay.jsx
import React, { useEffect } from 'react'

function diffValue(a, b) {
  if (a === b || (a == null && b == null)) return null
  return 'diff'
}

function MetaRow({ label, aVal, bVal }) {
  const isDiff = diffValue(String(aVal ?? ''), String(bVal ?? '')) !== null
  return (
    <div className="grid gap-2 text-xs" style={{ gridTemplateColumns: '80px 1fr 1fr' }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color: '#f0f0f0' }}>{aVal ?? '—'}</span>
      <span style={{ color: isDiff ? '#ff6b6b' : '#f0f0f0' }}>
        {bVal ?? '—'}{isDiff && ' ≠'}
      </span>
    </div>
  )
}

export default function CompareOverlay({ iterA, iterB, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!iterA || !iterB) return null

  const loraA = (iterA.loras || []).map(l => `${l.name} ${l.weight}`).join(', ')
  const loraB = (iterB.loras || []).map(l => `${l.name} ${l.weight}`).join(', ')

  return (
    <div
      className="fixed inset-0 z-[9997] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
        <h2 className="text-base font-semibold" style={{ color: '#f0f0f0' }}>Compare</h2>
        <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: '#2a2a2e', color: '#888' }}>
          Close (ESC)
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Images */}
          <div>
            <p className="text-xs mb-2 font-medium" style={{ color: '#7c6ff7' }}>
              Iteration #{iterA.iteration_number} {iterA.title ? `— ${iterA.title}` : ''}
            </p>
            <img src={`forge://${iterA.image_path}`} alt="" className="w-full rounded-xl object-contain" style={{ maxHeight: '40vh', background: '#1c1c1e' }} />
          </div>
          <div>
            <p className="text-xs mb-2 font-medium" style={{ color: '#7c6ff7' }}>
              Iteration #{iterB.iteration_number} {iterB.title ? `— ${iterB.title}` : ''}
            </p>
            <img src={`forge://${iterB.image_path}`} alt="" className="w-full rounded-xl object-contain" style={{ maxHeight: '40vh', background: '#1c1c1e' }} />
          </div>
        </div>

        {/* Metadata diff */}
        <div
          className="mt-6 rounded-xl p-4 flex flex-col gap-3"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
        >
          {/* Column headers */}
          <div className="grid text-[10px] uppercase tracking-wider gap-2" style={{ gridTemplateColumns: '80px 1fr 1fr', color: '#555' }}>
            <span />
            <span>#{iterA.iteration_number}</span>
            <span>#{iterB.iteration_number}</span>
          </div>
          <MetaRow label="Seed" aVal={iterA.seed} bVal={iterB.seed} />
          <MetaRow label="Steps" aVal={iterA.steps} bVal={iterB.steps} />
          <MetaRow label="CFG" aVal={iterA.cfg} bVal={iterB.cfg} />
          <MetaRow label="Sampler" aVal={iterA.sampler} bVal={iterB.sampler} />
          <MetaRow label="Checkpoint" aVal={iterA.checkpoint_name} bVal={iterB.checkpoint_name} />
          <MetaRow label="LoRAs" aVal={loraA || '—'} bVal={loraB || '—'} />

          {/* Custom fields */}
          {(() => {
            const keysA = new Map((iterA.custom_fields || []).map(f => [f.field_key, f.field_value]))
            const keysB = new Map((iterB.custom_fields || []).map(f => [f.field_key, f.field_value]))
            const allKeys = new Set([...keysA.keys(), ...keysB.keys()])
            return [...allKeys].map(key => (
              <MetaRow key={key} label={key} aVal={keysA.get(key)} bVal={keysB.get(key)} />
            ))
          })()}
        </div>
        <p className="text-[10px] mt-3 text-center" style={{ color: '#444' }}>
          Values in red differ between iterations
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/CompareOverlay.jsx
git commit -m "feat: CompareOverlay with aligned diff highlighting"
```

---

## Task 19: MainGensList page

**Files:**
- Create: `src/renderer/pages/MainGensList.jsx`

- [ ] **Step 1: Create MainGensList.jsx**

```jsx
// src/renderer/pages/MainGensList.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

function MainGenCard({ mg, onDelete, onTogglePin }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const timeAgo = getTimeAgo(mg.updated_at)

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer relative group"
      style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
      onClick={() => navigate(`/main-gens/${mg.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hero */}
      <div className="h-32 relative">
        {mg.hero_image_path ? (
          <img src={`forge://${mg.hero_image_path}`} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: mg.hero_color || '#2a2a2e' }} />
        )}
        {hovered && (
          <div
            className="absolute top-2 right-2 flex gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onTogglePin(mg)}
              className="w-6 h-6 rounded flex items-center justify-center text-xs"
              style={{ background: 'rgba(0,0,0,0.7)' }}
              title={mg.pinned ? 'Unpin' : 'Pin'}
            >
              {mg.pinned ? '📌' : '📍'}
            </button>
            <button
              onClick={() => onDelete(mg)}
              className="w-6 h-6 rounded flex items-center justify-center text-xs"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#ff6b6b' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>{mg.title}</p>
        <p className="text-xs mt-0.5" style={{ color: '#555' }}>
          {mg.iteration_count} iteration{mg.iteration_count !== 1 ? 's' : ''} · {timeAgo}
        </p>
      </div>
    </div>
  )
}

function getTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MainGensList() {
  const [allGens, setAllGens] = useState([])
  const [search, setSearch] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const gens = await window.forge.mainGens.list()
    setAllGens(gens)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = allGens.filter(mg => mg.title.toLowerCase().includes(search.toLowerCase()))
  const pinned = filtered.filter(mg => mg.pinned)
  const rest = filtered.filter(mg => !mg.pinned)

  const createNew = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const mg = await window.forge.mainGens.create(newTitle)
    setCreating(false)
    setNewTitle('')
    navigate(`/main-gens/${mg.id}`)
  }

  const handleDelete = async () => {
    await window.forge.mainGens.delete(toDelete.id)
    showToast(`Deleted "${toDelete.title}".`)
    setToDelete(null)
    load()
  }

  const togglePin = async (mg) => {
    await window.forge.mainGens.update({ id: mg.id, pinned: !mg.pinned })
    showToast(mg.pinned ? 'Unpinned.' : 'Pinned.')
    load()
  }

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold flex-1" style={{ color: '#f0f0f0' }}>Main Gens</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0', width: '180px' }}
        />
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: '#7c6ff7', color: '#fff' }}
        >
          + New
        </button>
      </div>

      {creating && (
        <form onSubmit={createNew} className="flex gap-2 mb-6">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Main Gen title…"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: '#1c1c1e', border: '1px solid #7c6ff7', color: '#f0f0f0' }}
          />
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#7c6ff7', color: '#fff' }}>Create</button>
          <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 rounded-lg text-sm" style={{ background: '#2a2a2e', color: '#888' }}>Cancel</button>
        </form>
      )}

      {allGens.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">🗂</div>
          <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No Main Gens yet</p>
          <p className="text-xs" style={{ color: '#555' }}>Assign images from the Inbox to create your first Main Gen.</p>
        </div>
      )}

      {pinned.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: '#555' }}>📌 Pinned</p>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {pinned.map(mg => (
              <MainGenCard key={mg.id} mg={mg} onDelete={setToDelete} onTogglePin={togglePin} />
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          {pinned.length > 0 && <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: '#555' }}>All</p>}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {rest.map(mg => (
              <MainGenCard key={mg.id} mg={mg} onDelete={setToDelete} onTogglePin={togglePin} />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        title={`Delete "${toDelete?.title}"?`}
        message="This will permanently delete all iterations inside. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Run app — navigate to Main Gens, create one**

```bash
npm run dev
```

Go to Main Gens → click "+ New" → enter title → should navigate to an empty detail page.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/MainGensList.jsx
git commit -m "feat: MainGensList page with pinned section, search, create, delete"
```

---

## Task 20: MainGenDetail page

**Files:**
- Create: `src/renderer/pages/MainGenDetail.jsx`

- [ ] **Step 1: Create MainGenDetail.jsx**

```jsx
// src/renderer/pages/MainGenDetail.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import GalleryGrid from '../components/GalleryGrid.jsx'
import MetadataPanel from '../components/MetadataPanel.jsx'
import CompareOverlay from '../components/CompareOverlay.jsx'
import { useToast } from '../context/ToastContext.jsx'

const SIZES = ['S', 'M', 'L']

export default function MainGenDetail() {
  const { id } = useParams()
  const mainGenId = parseInt(id)
  const [mg, setMg] = useState(null)
  const [iterations, setIterations] = useState([])
  const [size, setSize] = useState('M')
  const [selectedId, setSelectedId] = useState(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelected, setCompareSelected] = useState(new Set())
  const [compareData, setCompareData] = useState(null)
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const [mgData, iters] = await Promise.all([
      window.forge.mainGens.get(mainGenId),
      window.forge.iterations.list(mainGenId),
    ])
    setMg(mgData)
    setIterations(iters)
  }, [mainGenId])

  useEffect(() => { load() }, [load])

  const openCompare = async () => {
    const [idA, idB] = [...compareSelected]
    const [a, b] = await Promise.all([
      window.forge.iterations.get(idA),
      window.forge.iterations.get(idB),
    ])
    setCompareData({ a, b })
  }

  const toggleCompareSelect = (itemId) => {
    setCompareSelected(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else if (next.size < 2) {
        next.add(itemId)
      }
      return next
    })
  }

  const addIterationManually = async () => {
    const path = await window.forge.settings.openFolderPicker()
    if (!path) return
    // openFolderPicker opens a folder picker but we need a file — use a workaround
    // In a full implementation this would use dialog.showOpenDialog with file filter
    showToast('Use the Inbox to add images from your output folder.')
  }

  if (!mg) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#0e0e0f' }}>
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <button onClick={() => navigate('/main-gens')} className="text-sm" style={{ color: '#555' }}>← Back</button>
          <div
            className="w-8 h-8 rounded-lg flex-shrink-0"
            style={{
              background: mg.hero_image_path ? `url(forge://${mg.hero_image_path}) center/cover` : mg.hero_color,
            }}
          />
          <div className="flex-1">
            <h1 className="text-base font-semibold" style={{ color: '#f0f0f0' }}>{mg.title}</h1>
            <p className="text-xs" style={{ color: '#555' }}>{mg.iteration_count} iteration{mg.iteration_count !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => window.forge.mainGens.update({ id: mainGenId, pinned: !mg.pinned }).then(load)}
            className="text-sm"
            style={{ color: mg.pinned ? '#7c6ff7' : '#555' }}
          >
            {mg.pinned ? '📌' : '📍'}
          </button>

          {/* Size toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #2a2a2e' }}>
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  background: size === s ? '#7c6ff7' : '#1c1c1e',
                  color: size === s ? '#fff' : '#888',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setCompareMode(m => !m)
              setCompareSelected(new Set())
            }}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ background: compareMode ? '#7c6ff7' : '#2a2a2e', color: compareMode ? '#fff' : '#888' }}
          >
            Compare
          </button>

          {compareMode && compareSelected.size === 2 && (
            <button
              onClick={openCompare}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#7c6ff7', color: '#fff' }}
            >
              View Compare
            </button>
          )}
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto p-6">
          {iterations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="text-3xl">🖼</div>
              <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No iterations yet</p>
              <p className="text-xs" style={{ color: '#555' }}>Assign images from the Inbox to this Main Gen.</p>
            </div>
          ) : (
            <GalleryGrid
              items={iterations}
              size={size}
              selectedId={selectedId}
              compareMode={compareMode}
              compareSelected={compareSelected}
              onSelect={(id) => setSelectedId(prev => prev === id ? null : id)}
              onCompareToggle={toggleCompareSelect}
              renderOverlay={(item) =>
                item.starred ? (
                  <div className="absolute top-1.5 right-1.5 text-xs">⭐</div>
                ) : null
              }
            />
          )}
        </div>
      </div>

      {/* Metadata panel */}
      {selectedId && !compareMode && (
        <MetadataPanel
          iterationId={selectedId}
          mainGenId={mainGenId}
          onClose={() => setSelectedId(null)}
          onStarChange={load}
        />
      )}

      {/* Compare overlay */}
      {compareData && (
        <CompareOverlay
          iterA={compareData.a}
          iterB={compareData.b}
          onClose={() => setCompareData(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test in app — navigate to a Main Gen, verify gallery and panel**

```bash
npm run dev
```

Create a Main Gen via Inbox, open it, click an iteration → metadata panel should slide in.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/MainGenDetail.jsx
git commit -m "feat: MainGenDetail with gallery, metadata panel, compare mode"
```

---

## Task 21: LoRAsList + LoRADetail pages

**Files:**
- Rewrite: `src/renderer/pages/LoRAsList.jsx`
- Create: `src/renderer/pages/LoRADetail.jsx`

- [ ] **Step 1: Rewrite LoRAsList.jsx**

```jsx
// src/renderer/pages/LoRAsList.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'

export default function LoRAsList() {
  const [loras, setLoras] = useState([])
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoras(await window.forge.loras.list())
  }, [])

  useEffect(() => { load() }, [load])

  const scan = async () => {
    setScanning(true)
    const result = await window.forge.loras.scan()
    await load()
    setScanning(false)
    showToast(`Scan complete: +${result.added} new, ${result.offlined} offline.`)
  }

  const filtered = loras.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold flex-1" style={{ color: '#f0f0f0' }}>LoRAs</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0', width: '160px' }}
        />
        <button
          onClick={scan}
          disabled={scanning}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: '#2a2a2e', color: '#888' }}
        >
          {scanning ? 'Scanning…' : '↻ Rescan'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">🎛</div>
          <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No LoRAs found</p>
          <p className="text-xs" style={{ color: '#555' }}>Set your LoRAs folder in Settings to auto-import.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(l => (
            <div
              key={l.id}
              onClick={() => navigate(`/loras/${l.id}`)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer"
              style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#f0f0f0' }}>{l.name}</span>
                  {l.status === 'offline' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a1a1a', color: '#888' }}>Offline</span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>default weight {l.default_weight}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ background: '#2a2a2e', color: '#7c6ff7' }}>
                {l.usage_count} uses
              </span>
              <span style={{ color: '#555' }}>→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create LoRADetail.jsx**

```jsx
// src/renderer/pages/LoRADetail.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'

export default function LoRADetail() {
  const { id } = useParams()
  const loraId = parseInt(id)
  const [lora, setLora] = useState(null)
  const [usage, setUsage] = useState([])
  const [notes, setNotes] = useState('')
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimer = useRef(null)

  const load = useCallback(async () => {
    const [l, u] = await Promise.all([
      window.forge.loras.get(loraId),
      window.forge.loras.usage({ id: loraId }),
    ])
    setLora(l)
    setUsage(u)
    setNotes(l.notes || '')
  }, [loraId])

  useEffect(() => { load() }, [load])

  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotes(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.forge.loras.update({ id: loraId, notes: val })
      showToast('Notes saved.')
    }, 500)
  }

  if (!lora) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <button onClick={() => navigate('/loras')} className="text-sm mb-4 block" style={{ color: '#555' }}>← LoRAs</button>

      {/* Stats header */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: '#f0f0f0' }}>{lora.name}</h1>
              {lora.status === 'offline' && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2a1a1a', color: '#888' }} title="File not found at last known path.">Offline</span>
              )}
            </div>
            {lora.file_path && <p className="text-xs mt-1 truncate" style={{ color: '#555', maxWidth: '400px' }}>{lora.file_path}</p>}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Iterations', value: lora.usage_count },
            { label: 'Default wt', value: lora.default_weight },
            { label: 'Avg wt used', value: lora.avg_weight ? Number(lora.avg_weight).toFixed(2) : '—' },
            { label: 'Main Gens', value: lora.main_gen_count },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#7c6ff7' }}>{value}</div>
              <div className="text-xs mt-0.5" style={{ color: '#555' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#555' }}>Notes</p>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          placeholder="Your notes on this LoRA — strengths, weaknesses, best pairings…"
          rows={5}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0' }}
        />
      </div>

      {/* Usage gallery */}
      <div>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>
          Used in — {usage.length} iteration{usage.length !== 1 ? 's' : ''}
        </p>
        {usage.length === 0 ? (
          <p className="text-sm" style={{ color: '#555' }}>Not used in any iterations yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {usage.map(iter => (
              <div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '0.85', background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <img src={`forge://${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }} />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[10px] font-medium" style={{ color: '#fff' }}>wt {iter.weight}</p>
                  <p className="text-[9px]" style={{ color: '#aaa' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/LoRAsList.jsx src/renderer/pages/LoRADetail.jsx
git commit -m "feat: LoRAsList and LoRADetail pages with usage gallery"
```

---

## Task 22: ModelsList + ModelDetail pages

**Files:**
- Rewrite: `src/renderer/pages/ModelsList.jsx`
- Create: `src/renderer/pages/ModelDetail.jsx`

- [ ] **Step 1: Rewrite ModelsList.jsx**

```jsx
// src/renderer/pages/ModelsList.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'

export default function ModelsList() {
  const [models, setModels] = useState([])
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setModels(await window.forge.models.list())
  }, [])

  useEffect(() => { load() }, [load])

  const scan = async () => {
    setScanning(true)
    const result = await window.forge.models.scan()
    await load()
    setScanning(false)
    showToast(`Scan complete: +${result.added} new, ${result.offlined} offline.`)
  }

  const filtered = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold flex-1" style={{ color: '#f0f0f0' }}>Checkpoints</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0', width: '160px' }}
        />
        <button
          onClick={scan}
          disabled={scanning}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: '#2a2a2e', color: '#888' }}
        >
          {scanning ? 'Scanning…' : '↻ Rescan'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">🧱</div>
          <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No Checkpoints found</p>
          <p className="text-xs" style={{ color: '#555' }}>Set your Checkpoints folder in Settings to auto-import.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(m => (
            <div
              key={m.id}
              onClick={() => navigate(`/models/${m.id}`)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer"
              style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#f0f0f0' }}>{m.name}</span>
                  {m.status === 'offline' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a1a1a', color: '#888' }}>Offline</span>
                  )}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ background: '#2a2a2e', color: '#4a9a6e' }}>
                {m.usage_count} uses
              </span>
              <span style={{ color: '#555' }}>→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create ModelDetail.jsx**

```jsx
// src/renderer/pages/ModelDetail.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'

export default function ModelDetail() {
  const { id } = useParams()
  const modelId = parseInt(id)
  const [model, setModel] = useState(null)
  const [usage, setUsage] = useState([])
  const [notes, setNotes] = useState('')
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimer = useRef(null)

  const load = useCallback(async () => {
    const [m, u] = await Promise.all([
      window.forge.models.get(modelId),
      window.forge.models.usage(modelId),
    ])
    setModel(m)
    setUsage(u)
    setNotes(m.notes || '')
  }, [modelId])

  useEffect(() => { load() }, [load])

  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotes(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.forge.models.update({ id: modelId, notes: val })
      showToast('Notes saved.')
    }, 500)
  }

  if (!model) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <button onClick={() => navigate('/models')} className="text-sm mb-4 block" style={{ color: '#555' }}>← Checkpoints</button>

      <div className="rounded-xl p-5 mb-6" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-xl font-semibold" style={{ color: '#f0f0f0' }}>{model.name}</h1>
          {model.status === 'offline' && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2a1a1a', color: '#888' }}>Offline</span>
          )}
        </div>
        {model.file_path && <p className="text-xs mb-3 truncate" style={{ color: '#555' }}>{model.file_path}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#4a9a6e' }}>{model.usage_count}</div>
            <div className="text-xs mt-0.5" style={{ color: '#555' }}>Iterations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#4a9a6e' }}>{model.main_gen_count}</div>
            <div className="text-xs mt-0.5" style={{ color: '#555' }}>Main Gens</div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#555' }}>Notes</p>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          placeholder="Your notes on this checkpoint…"
          rows={5}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0' }}
        />
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>
          Used in — {usage.length} iteration{usage.length !== 1 ? 's' : ''}
        </p>
        {usage.length === 0 ? (
          <p className="text-sm" style={{ color: '#555' }}>Not used in any iterations yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {usage.map(iter => (
              <div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '0.85', background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <img src={`forge://${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }} />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[9px]" style={{ color: '#aaa' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/ModelsList.jsx src/renderer/pages/ModelDetail.jsx
git commit -m "feat: ModelsList and ModelDetail pages with usage gallery"
```

---

## Task 23: Settings page updates

**Files:**
- Modify: `src/renderer/pages/Settings.jsx`

- [ ] **Step 1: Add rescan buttons and auto-scan toggle to Settings.jsx**

Add the following at the bottom of the `FOLDER_SETTINGS` array and after the folder rows section. Open `src/renderer/pages/Settings.jsx` and replace the entire file:

```jsx
// src/renderer/pages/Settings.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../context/ToastContext.jsx'

const FOLDER_SETTINGS = [
  { key: 'output_folder', label: 'ComfyUI Output Folder', description: 'Where ComfyUI saves your generated images.' },
  { key: 'checkpoints_folder', label: 'Checkpoints Folder', description: 'Folder containing your checkpoint models.' },
  { key: 'loras_folder', label: 'LoRAs Folder', description: 'Folder containing your LoRA model files.' },
]

function FolderRow({ label, description, value, onBrowse, onClear }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
      <div className="mb-3">
        <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: '#888' }}>{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly value={value || ''}
          placeholder="Not set"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none truncate"
          style={{ background: '#0e0e0f', border: '1px solid #2a2a2e', color: value ? '#f0f0f0' : '#555' }}
        />
        <button
          onClick={onBrowse}
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: '#7c6ff7', color: '#fff' }}
        >Browse…</button>
        {value && (
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: '#2a2a2e', color: '#888' }}
          >Clear</button>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const [folders, setFolders] = useState({ output_folder: null, checkpoints_folder: null, loras_folder: null })
  const [gallerySize, setGallerySize] = useState('M')
  const [autoScan, setAutoScan] = useState(true)
  const [scanning, setScanning] = useState({ loras: false, checkpoints: false })
  const showToast = useToast()

  useEffect(() => {
    window.forge.settings.getAll().then((all) => {
      setFolders(prev => ({ ...prev, ...all }))
      if (all.gallery_size) setGallerySize(all.gallery_size)
      if (all.auto_scan !== undefined) setAutoScan(all.auto_scan !== 'false')
    })
  }, [])

  const handleBrowse = useCallback(async (key) => {
    const path = await window.forge.settings.openFolderPicker()
    if (!path) return
    await window.forge.settings.set(key, path)
    setFolders(prev => ({ ...prev, [key]: path }))
    if (key === 'output_folder') window.forge.scanner.restart()
    if (key === 'loras_folder') { const r = await window.forge.loras.scan(); showToast(`LoRAs scanned: +${r.added} new.`) }
    if (key === 'checkpoints_folder') { const r = await window.forge.models.scan(); showToast(`Checkpoints scanned: +${r.added} new.`) }
    showToast('Folder saved.')
  }, [showToast])

  const handleClear = useCallback(async (key) => {
    await window.forge.settings.set(key, null)
    setFolders(prev => ({ ...prev, [key]: null }))
    showToast('Folder cleared.')
  }, [showToast])

  const rescanLoras = async () => {
    setScanning(s => ({ ...s, loras: true }))
    const r = await window.forge.loras.scan()
    setScanning(s => ({ ...s, loras: false }))
    showToast(`LoRAs: +${r.added} new, ${r.offlined} offline.`)
  }

  const rescanCheckpoints = async () => {
    setScanning(s => ({ ...s, checkpoints: true }))
    const r = await window.forge.models.scan()
    setScanning(s => ({ ...s, checkpoints: false }))
    showToast(`Checkpoints: +${r.added} new, ${r.offlined} offline.`)
  }

  const setGalleryDefault = async (size) => {
    setGallerySize(size)
    await window.forge.settings.set('gallery_size', size)
    showToast(`Default gallery size set to ${size}.`)
  }

  const toggleAutoScan = async () => {
    const next = !autoScan
    setAutoScan(next)
    await window.forge.settings.set('auto_scan', String(next))
    if (next) window.forge.scanner.restart()
    showToast(`Auto-scan ${next ? 'enabled' : 'disabled'}.`)
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0e0e0f' }}>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: '#f0f0f0' }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>Configure your folder paths. Forge never moves or copies your files.</p>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          {FOLDER_SETTINGS.map(({ key, label, description }) => (
            <FolderRow
              key={key} label={label} description={description}
              value={folders[key]}
              onBrowse={() => handleBrowse(key)}
              onClear={() => handleClear(key)}
            />
          ))}
        </div>

        {/* Rescan buttons */}
        <div className="rounded-xl p-5 mb-4" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#f0f0f0' }}>Rescan Libraries</p>
          <p className="text-xs mb-4" style={{ color: '#888' }}>Re-reads your LoRA and Checkpoint folders to pick up new or removed files.</p>
          <div className="flex gap-3">
            <button onClick={rescanLoras} disabled={scanning.loras} className="px-4 py-2 rounded-lg text-sm" style={{ background: '#2a2a2e', color: '#888' }}>
              {scanning.loras ? 'Scanning…' : '↻ Rescan LoRAs'}
            </button>
            <button onClick={rescanCheckpoints} disabled={scanning.checkpoints} className="px-4 py-2 rounded-lg text-sm" style={{ background: '#2a2a2e', color: '#888' }}>
              {scanning.checkpoints ? 'Scanning…' : '↻ Rescan Checkpoints'}
            </button>
          </div>
        </div>

        {/* Gallery size */}
        <div className="rounded-xl p-5 mb-4" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#f0f0f0' }}>Default Gallery Size</p>
          <p className="text-xs mb-4" style={{ color: '#888' }}>Default thumbnail size in the iteration gallery.</p>
          <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: '1px solid #2a2a2e' }}>
            {['S', 'M', 'L'].map(s => (
              <button key={s} onClick={() => setGalleryDefault(s)} className="px-5 py-2 text-sm font-medium" style={{ background: gallerySize === s ? '#7c6ff7' : '#1c1c1e', color: gallerySize === s ? '#fff' : '#888' }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Auto-scan toggle */}
        <div className="rounded-xl p-5" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>Auto-scan Output Folder</p>
              <p className="text-xs mt-0.5" style={{ color: '#888' }}>Automatically detect new images in your ComfyUI output folder.</p>
            </div>
            <button
              onClick={toggleAutoScan}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{ background: autoScan ? '#7c6ff7' : '#2a2a2e' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                style={{ background: '#fff', transform: autoScan ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/pages/Settings.jsx
git commit -m "feat: Settings page with rescan buttons, gallery size, auto-scan toggle"
```

---

## Task 24: Dashboard page

**Files:**
- Rewrite: `src/renderer/pages/Dashboard.jsx`

- [ ] **Step 1: Rewrite Dashboard.jsx**

```jsx
// src/renderer/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
      <div className="text-3xl font-bold mb-1" style={{ color: accent || '#7c6ff7' }}>{value}</div>
      <div className="text-xs" style={{ color: '#555' }}>{label}</div>
    </div>
  )
}

function BarChart({ items, maxCount, onClickItem, accent }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 cursor-pointer" onClick={() => onClickItem(item.id)}>
          <span className="text-xs truncate" style={{ color: '#7c6ff7', width: '120px' }}>{item.name}</span>
          <div className="flex-1 rounded-full h-1.5" style={{ background: '#2a2a2e' }}>
            <div
              className="h-full rounded-full"
              style={{ background: accent || '#7c6ff7', width: `${(item.usage_count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-xs w-6 text-right" style={{ color: '#555' }}>{item.usage_count}</span>
        </div>
      ))}
    </div>
  )
}

function getTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [topLoras, setTopLoras] = useState([])
  const [topCheckpoints, setTopCheckpoints] = useState([])
  const [pinnedMgs, setPinnedMgs] = useState([])
  const [starredIters, setStarredIters] = useState([])
  const [recentMgs, setRecentMgs] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      window.forge.dashboard.stats(),
      window.forge.dashboard.topLoras(),
      window.forge.dashboard.topCheckpoints(),
      window.forge.dashboard.pinnedMainGens(),
      window.forge.dashboard.starredIterations(),
      window.forge.dashboard.recentMainGens(),
    ]).then(([s, tl, tc, pm, si, rm]) => {
      setStats(s); setTopLoras(tl); setTopCheckpoints(tc)
      setPinnedMgs(pm); setStarredIters(si); setRecentMgs(rm)
    })
  }, [])

  if (!stats) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  const maxLora = Math.max(...topLoras.map(l => l.usage_count), 1)
  const maxCkpt = Math.max(...topCheckpoints.map(c => c.usage_count), 1)

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <h1 className="text-xl font-semibold mb-6" style={{ color: '#f0f0f0' }}>Dashboard</h1>

      {/* Stats row */}
      <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <StatCard label="Main Gens" value={stats.mainGensCount} />
        <StatCard label="Iterations" value={stats.iterationsCount} />
        <StatCard label="LoRAs" value={stats.lorasCount} />
        <StatCard label="Checkpoints" value={stats.checkpointsCount} />
        <StatCard label="⭐ Starred" value={stats.starredCount} accent="#f5a623" />
      </div>

      {/* Insights */}
      {(topLoras.length > 0 || topCheckpoints.length > 0) && (
        <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {topLoras.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
              <p className="text-xs uppercase tracking-wider mb-4" style={{ color: '#555' }}>Most Used LoRAs</p>
              <BarChart items={topLoras} maxCount={maxLora} onClickItem={(id) => navigate(`/loras/${id}`)} />
            </div>
          )}
          {topCheckpoints.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
              <p className="text-xs uppercase tracking-wider mb-4" style={{ color: '#555' }}>Most Used Checkpoints</p>
              <BarChart items={topCheckpoints} maxCount={maxCkpt} onClickItem={(id) => navigate(`/models/${id}`)} accent="#4a9a6e" />
            </div>
          )}
        </div>
      )}

      {/* Pinned Main Gens */}
      {pinnedMgs.length > 0 && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>📌 Pinned Main Gens</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {pinnedMgs.map(mg => (
              <div
                key={mg.id}
                onClick={() => navigate(`/main-gens/${mg.id}`)}
                className="flex-shrink-0 rounded-xl overflow-hidden cursor-pointer"
                style={{ width: '120px', background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <div className="h-16" style={{ background: mg.hero_image_path ? `url(forge://${mg.hero_image_path}) center/cover` : mg.hero_color }} />
                <div className="p-2">
                  <p className="text-xs font-medium truncate" style={{ color: '#f0f0f0' }}>{mg.title}</p>
                  <p className="text-[10px]" style={{ color: '#555' }}>{mg.iteration_count} iters</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Starred Iterations */}
      {starredIters.length > 0 && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>⭐ Starred Iterations</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {starredIters.map(iter => (
              <div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="flex-shrink-0 relative rounded-lg overflow-hidden cursor-pointer"
                style={{ width: '80px', aspectRatio: '0.85', background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <img src={`forge://${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.7))' }} />
                <div className="absolute bottom-1 left-1 right-1">
                  <p className="text-[9px] leading-tight" style={{ color: '#aaa' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Main Gens */}
      {recentMgs.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>Recent Main Gens</p>
          <div className="flex flex-col gap-2">
            {recentMgs.map(mg => (
              <div
                key={mg.id}
                onClick={() => navigate(`/main-gens/${mg.id}`)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: mg.hero_image_path ? `url(forge://${mg.hero_image_path}) center/cover` : mg.hero_color }} />
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>{mg.title}</p>
                  <p className="text-xs" style={{ color: '#555' }}>{mg.iteration_count} iterations · {getTimeAgo(mg.updated_at)}</p>
                </div>
                <span style={{ color: '#555' }}>→</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.mainGensCount === 0 && (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">🏠</div>
          <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>Welcome to Forge</p>
          <p className="text-xs" style={{ color: '#555' }}>Set your ComfyUI output folder in Settings, then assign images from the Inbox to get started.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/pages/Dashboard.jsx
git commit -m "feat: Dashboard page with stats, charts, pinned gens, starred iterations"
```

---

## Task 25: SearchOverlay component

**Files:**
- Create: `src/renderer/components/SearchOverlay.jsx`

- [ ] **Step 1: Create SearchOverlay.jsx**

```jsx
// src/renderer/components/SearchOverlay.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'main-gens', label: 'Main Gens' },
  { key: 'iterations', label: 'Iterations' },
  { key: 'loras', label: 'LoRAs' },
  { key: 'checkpoints', label: 'Checkpoints' },
]

function highlight(text, query) {
  if (!query || !text) return text || ''
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#7c6ff7', color: '#fff', borderRadius: '2px', padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SearchOverlay({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [starred, setStarred] = useState(false)
  const [results, setResults] = useState(null)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const searchTimer = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults(null)
      setCursor(0)
    }
  }, [isOpen])

  const search = useCallback(async (q, type, star) => {
    if (!q.trim()) { setResults(null); return }
    const types = type === 'all' ? [] : [type]
    const r = await window.forge.search.query({ query: q, filters: { types, starred: star } })
    setResults(r)
    setCursor(0)
  }, [])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => search(query, typeFilter, starred), 200)
  }, [query, typeFilter, starred, search])

  const allResults = results ? [
    ...results.mainGens.map(r => ({ ...r, _type: 'main-gen' })),
    ...results.iterations.map(r => ({ ...r, _type: 'iteration' })),
    ...results.loras.map(r => ({ ...r, _type: 'lora' })),
    ...results.checkpoints.map(r => ({ ...r, _type: 'checkpoint' })),
  ] : []

  const goTo = (result) => {
    onClose()
    if (result._type === 'main-gen') navigate(`/main-gens/${result.id}`)
    else if (result._type === 'iteration') navigate(`/main-gens/${result.main_gen_id}`)
    else if (result._type === 'lora') navigate(`/loras/${result.id}`)
    else if (result._type === 'checkpoint') navigate(`/models/${result.id}`)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, allResults.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && allResults[cursor]) goTo(allResults[cursor])
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9996] flex items-start justify-center pt-24"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <span style={{ color: '#555' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search main gens, iterations, LoRAs, checkpoints…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#f0f0f0' }}
          />
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2a2a2e', color: '#555' }}>ESC</span>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid #2a2a2e' }}>
          {TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0"
              style={{ background: typeFilter === t.key ? '#7c6ff7' : '#2a2a2e', color: typeFilter === t.key ? '#fff' : '#888' }}
            >
              {t.label}
            </button>
          ))}
          <div className="w-px mx-1 flex-shrink-0" style={{ background: '#2a2a2e' }} />
          <button
            onClick={() => setStarred(s => !s)}
            className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0"
            style={{ background: starred ? '#7c6ff7' : '#2a2a2e', color: starred ? '#fff' : '#888' }}
          >
            ⭐ Starred
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!query.trim() && (
            <div className="py-12 text-center text-sm" style={{ color: '#555' }}>Type to search…</div>
          )}
          {query.trim() && results && allResults.length === 0 && (
            <div className="py-12 text-center text-sm" style={{ color: '#555' }}>No results for "{query}"</div>
          )}
          {results && allResults.length > 0 && (() => {
            const sections = [
              { type: 'main-gen', label: 'Main Gens', items: results.mainGens },
              { type: 'iteration', label: 'Iterations', items: results.iterations },
              { type: 'lora', label: 'LoRAs', items: results.loras },
              { type: 'checkpoint', label: 'Checkpoints', items: results.checkpoints },
            ].filter(s => s.items.length > 0)

            let globalIdx = 0
            return sections.map(section => (
              <div key={section.type}>
                <div className="px-4 py-2 text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>
                  {section.label}
                </div>
                {section.items.map(item => {
                  const idx = globalIdx++
                  const isFocused = idx === cursor
                  const mapped = { ...item, _type: section.type === 'main-gen' ? 'main-gen' : section.type === 'iteration' ? 'iteration' : section.type === 'lora' ? 'lora' : 'checkpoint' }
                  return (
                    <div
                      key={item.id}
                      onClick={() => goTo(mapped)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      style={{ background: isFocused ? '#2a2a2e' : 'transparent' }}
                    >
                      {(section.type === 'main-gen' || section.type === 'iteration') && (
                        <div
                          className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden"
                          style={{ background: item.hero_color || '#2a2a2e' }}
                        >
                          {(item.hero_image_path || item.image_path) && (
                            <img src={`forge://${item.hero_image_path || item.image_path}`} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>
                          {highlight(item.title || item.name || `Iteration #${item.iteration_number}`, query)}
                        </p>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#555' }}>
                          {section.type === 'iteration' && `${item.main_gen_title} · seed ${item.seed || '—'}`}
                          {section.type === 'main-gen' && item.tags}
                          {(section.type === 'lora' || section.type === 'checkpoint') && item.status === 'offline' && 'Offline'}
                        </p>
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>
                        {section.type === 'main-gen' && 'Main Gen'}
                        {section.type === 'iteration' && 'Iteration'}
                        {section.type === 'lora' && 'LoRA'}
                        {section.type === 'checkpoint' && 'Checkpoint'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))
          })()}
        </div>

        {/* Footer */}
        <div className="flex gap-4 px-4 py-2.5" style={{ borderTop: '1px solid #2a2a2e' }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['ESC', 'close'], ['⌘K', 'toggle']].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a2a2e', color: '#888' }}>{key}</span>
              <span className="text-[10px]" style={{ color: '#555' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Test ⌘K in the app**

```bash
npm run dev
```

Press ⌘K → overlay opens. Type something → results appear. ESC → closes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SearchOverlay.jsx
git commit -m "feat: SearchOverlay with ⌘K, filter chips, keyboard nav, result highlighting"
```

---

## Task 26: Onboarding modal

**Files:**
- Create: `src/renderer/pages/OnboardingModal.jsx`
- Modify: `src/renderer/App.jsx`

- [ ] **Step 1: Create OnboardingModal.jsx**

```jsx
// src/renderer/pages/OnboardingModal.jsx
import React, { useState } from 'react'

const STEPS = [
  {
    title: 'Welcome to Forge',
    body: 'Your personal ComfyUI generation journal. Log images, track LoRAs and checkpoints, and review your creative progress — all without moving a single file.',
    icon: '⚒️',
  },
  {
    title: 'Set Your Folders',
    body: 'Tell Forge where to find your ComfyUI output and model files. It will auto-detect new images and import your LoRAs and checkpoints.',
    icon: '📁',
  },
  {
    title: "You're All Set",
    body: 'Images that appear in your output folder will land in the Inbox. Assign them to a Main Gen to start your first generation journal.',
    icon: '🚀',
  },
]

export default function OnboardingModal({ onDone, folders, onBrowse }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="rounded-2xl p-8 w-full max-w-md shadow-2xl" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
        {/* Steps indicator */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? '#7c6ff7' : '#2a2a2e' }} />
          ))}
        </div>

        <div className="text-4xl mb-4">{current.icon}</div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: '#f0f0f0' }}>{current.title}</h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: '#888' }}>{current.body}</p>

        {step === 1 && (
          <div className="flex flex-col gap-3 mb-6">
            {[
              { key: 'output_folder', label: 'Output Folder', required: true },
              { key: 'checkpoints_folder', label: 'Checkpoints Folder', required: false },
              { key: 'loras_folder', label: 'LoRAs Folder', required: false },
            ].map(({ key, label, required }) => (
              <div key={key}>
                <p className="text-xs mb-1.5" style={{ color: '#555' }}>
                  {label} {required && <span style={{ color: '#c0392b' }}>*</span>}
                </p>
                <div className="flex gap-2">
                  <div
                    className="flex-1 rounded-lg px-3 py-2 text-xs truncate"
                    style={{ background: '#0e0e0f', border: '1px solid #2a2a2e', color: folders[key] ? '#f0f0f0' : '#555' }}
                  >
                    {folders[key] || 'Not set'}
                  </div>
                  <button
                    onClick={() => onBrowse(key)}
                    className="px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: '#7c6ff7', color: '#fff' }}
                  >
                    Browse
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 rounded-lg text-sm" style={{ background: '#2a2a2e', color: '#888' }}>
              Back
            </button>
          )}
          <button
            onClick={() => isLast ? onDone() : setStep(s => s + 1)}
            disabled={step === 1 && !folders.output_folder}
            className="px-5 py-2 rounded-lg text-sm font-medium"
            style={{
              background: '#7c6ff7',
              color: '#fff',
              opacity: step === 1 && !folders.output_folder ? 0.5 : 1,
            }}
          >
            {isLast ? 'Open Forge' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add onboarding trigger to App.jsx**

In `src/renderer/App.jsx`, add the onboarding state and modal. Replace just the App function body — add at the top of `App()`:

```jsx
// Add these imports at the top of App.jsx:
import OnboardingModal from './pages/OnboardingModal.jsx'

// Inside App(), before the return, add:
const [onboarding, setOnboarding] = useState(false)
const [onboardingFolders, setOnboardingFolders] = useState({ output_folder: null, checkpoints_folder: null, loras_folder: null })

useEffect(() => {
  window.forge.settings.getAll().then((all) => {
    if (!all.output_folder && !all.onboarding_done) {
      setOnboardingFolders(f => ({ ...f, ...all }))
      setOnboarding(true)
    }
  })
}, [])

const handleOnboardingBrowse = async (key) => {
  const path = await window.forge.settings.openFolderPicker()
  if (!path) return
  await window.forge.settings.set(key, path)
  setOnboardingFolders(f => ({ ...f, [key]: path }))
  if (key === 'output_folder') window.forge.scanner.restart()
}

const finishOnboarding = async () => {
  await window.forge.settings.set('onboarding_done', 'true')
  setOnboarding(false)
}
```

And add `{onboarding && <OnboardingModal onDone={finishOnboarding} folders={onboardingFolders} onBrowse={handleOnboardingBrowse} />}` just before the closing `</InboxProvider>` tag.

The full updated `App.jsx`:

```jsx
// src/renderer/App.jsx
import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import SearchOverlay from './components/SearchOverlay.jsx'
import OnboardingModal from './pages/OnboardingModal.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inbox from './pages/Inbox.jsx'
import MainGensList from './pages/MainGensList.jsx'
import MainGenDetail from './pages/MainGenDetail.jsx'
import LoRAsList from './pages/LoRAsList.jsx'
import LoRADetail from './pages/LoRADetail.jsx'
import ModelsList from './pages/ModelsList.jsx'
import ModelDetail from './pages/ModelDetail.jsx'
import Extras from './pages/Extras.jsx'
import Settings from './pages/Settings.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { InboxProvider } from './context/InboxContext.jsx'

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [onboardingFolders, setOnboardingFolders] = useState({ output_folder: null, checkpoints_folder: null, loras_folder: null })

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    window.forge.settings.getAll().then((all) => {
      if (!all.output_folder && !all.onboarding_done) {
        setOnboardingFolders(f => ({ ...f, ...all }))
        setOnboarding(true)
      }
    })
  }, [])

  const handleOnboardingBrowse = async (key) => {
    const path = await window.forge.settings.openFolderPicker()
    if (!path) return
    await window.forge.settings.set(key, path)
    setOnboardingFolders(f => ({ ...f, [key]: path }))
    if (key === 'output_folder') window.forge.scanner.restart()
  }

  const finishOnboarding = async () => {
    await window.forge.settings.set('onboarding_done', 'true')
    setOnboarding(false)
  }

  return (
    <HashRouter>
      <ToastProvider>
        <InboxProvider>
          <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0e0e0f' }}>
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/main-gens" element={<MainGensList />} />
                <Route path="/main-gens/:id" element={<MainGenDetail />} />
                <Route path="/loras" element={<LoRAsList />} />
                <Route path="/loras/:id" element={<LoRADetail />} />
                <Route path="/models" element={<ModelsList />} />
                <Route path="/models/:id" element={<ModelDetail />} />
                <Route path="/extras" element={<Extras />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
            <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
            {onboarding && (
              <OnboardingModal
                onDone={finishOnboarding}
                folders={onboardingFolders}
                onBrowse={handleOnboardingBrowse}
              />
            )}
          </div>
        </InboxProvider>
      </ToastProvider>
    </HashRouter>
  )
}
```

- [ ] **Step 3: Test onboarding — delete onboarding_done from settings**

```bash
npm run dev
```

Open Settings → clear output_folder. Restart app → onboarding modal should appear. Set a folder, click through, click "Open Forge" → modal closes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/OnboardingModal.jsx src/renderer/App.jsx
git commit -m "feat: first-launch onboarding modal with folder setup flow"
```

---

## Task 27: Full app smoke test

- [ ] **Step 1: Run the full app end-to-end**

```bash
npm run dev
```

Walk through this checklist:

- [ ] Sidebar shows: Dashboard, Inbox (no badge), Main Gens, LoRAs, Checkpoints, Extras, Settings
- [ ] Settings → set output folder to a folder with PNGs → inbox badge appears
- [ ] Settings → set LoRAs folder → rescan → LoRAs page shows files
- [ ] Settings → set Checkpoints folder → rescan → Checkpoints page shows files
- [ ] Inbox page → images visible → select multiple → assign to new Main Gen
- [ ] Main Gens page → new main gen card visible → click it
- [ ] Main Gen Detail → iterations visible → click one → metadata panel opens
- [ ] Metadata panel → star an iteration → star icon appears on thumbnail
- [ ] Compare mode → select 2 iterations → view compare → diff highlighted
- [ ] LoRAs page → click a LoRA → detail page with usage gallery
- [ ] Checkpoints page → click one → detail page
- [ ] Dashboard → stats show real counts
- [ ] ⌘K → type a query → results appear → press enter → navigates

- [ ] **Step 2: Fix any bugs found during smoke test**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: full Forge app sessions 2-6 complete (smoke test pass)"
```

---

## Task 28: Build .dmg for macOS

- [ ] **Step 1: Verify electron-builder config**

Check `electron-builder.yml` — ensure it includes:
```yaml
appId: com.forge.app
productName: Forge
mac:
  category: public.app-category.productivity
  target:
    - dmg
    - zip
directories:
  output: dist/electron
files:
  - dist/renderer/**/*
  - src/main/**/*
  - package.json
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: `dist/electron/Forge-1.0.0.dmg` created.

- [ ] **Step 3: Test the .dmg**

Open `dist/electron/Forge-1.0.0.dmg`, drag Forge.app to Applications, open it. Verify it launches without DevTools and connects to the DB correctly.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml
git commit -m "chore: verify electron-builder config for macOS dmg"
```

---

## Task 29: Run impeccable for UI polish pass

- [ ] **Step 1: Invoke impeccable skill**

At this point all features are built. Run:

```
/impeccable
```

Follow the impeccable skill's process to enhance the UI across all screens — spacing, typography, micro-interactions, colour consistency, hover states, empty states.

- [ ] **Step 2: Commit impeccable changes**

```bash
git add -A
git commit -m "feat: impeccable UI polish pass"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Schema + Inbox + Auto-scan → Tasks 2–6, 11, 13, 14
- [x] Main Gens CRUD + pin + hero → Tasks 7, 13, 19, 20
- [x] Iteration gallery S/M/L → Task 15
- [x] Metadata panel with all sections → Task 17
- [x] Custom fields + global pin → Tasks 8, 17
- [x] Compare overlay → Tasks 18, 20
- [x] LoRA/Checkpoint folder scan + offline status → Tasks 5, 9
- [x] LoRA detail with usage gallery + notes → Task 21
- [x] Checkpoint detail with usage gallery + notes → Task 22
- [x] Dashboard with stats, charts, pinned, starred, recents → Task 24
- [x] Search ⌘K with filters and keyboard nav → Task 25
- [x] Tags on main_gens and iterations → Tasks 8, 16, 17
- [x] Settings rescan + gallery size + auto-scan toggle → Task 23
- [x] Onboarding first-launch modal → Task 26
- [x] Toast notifications → Task 12
- [x] Confirm dialogs on delete → Tasks 12, 19
- [x] Offline badge on LoRA/Checkpoint → Tasks 21, 22
- [x] Empty states on all screens → Inline in each page component
- [x] .dmg packaging → Task 28
- [x] impeccable polish pass → Task 29

**Type consistency:** All IPC handler names match preload.js exactly. All `window.forge.*` calls in renderer match the exposed API in preload.js.
