# LoRA & Checkpoint Detail — Extra Fields & Example Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `trigger_words` + `recommended_strength` to LoRA detail, `recommended_cfg` + `recommended_steps` to Checkpoint detail, and up to 4 example images per entity (sourced via paste / file picker / pick-from-gallery) — all wired into a two-column layout with a smart-resizing image grid and a click-to-zoom lightbox.

**Architecture:** Three vertical slices, each shippable on its own. Slice 1 adds the scalar columns + UI fields under the existing notes textarea (no layout restructure). Slice 2 adds the example-image backend (managed `<userData>/example-images/` directory, new tables, IPC) and a placeholder uniform grid. Slice 3 restructures the layout into the approved two-column split, introduces the smart 1/2/3/4 grid patterns, and adds the lightbox. Each slice ends with a single commit on `master`.

**Tech Stack:** Electron 33, React 18, Vite 6, better-sqlite3 11, Framer Motion 12. No test framework — verification is manual via `npm run dev`.

**Reference design spec:** `docs/superpowers/specs/2026-05-13-lora-checkpoint-detail-fields-design.md`

---

## File Map

### New files (main process)
- `src/main/examples/example-images.js` — file ops for the managed example-images directory

### Modified files (main process)
- `src/main/db/schema.sql` — add `lora_example_images` + `model_example_images` tables
- `src/main/db/database.js` — bump `user_version` 3 → 4 with idempotent `ALTER TABLE` block
- `src/main/ipc/loras.js` — extend `update` + `get`; add `add-example-image`, `remove-example-image`, `pick-example-image-file`
- `src/main/ipc/models.js` — same as loras
- `src/main/ipc/iterations.js` — add `iterations:list-all` for the "All iterations" picker toggle
- `src/main/preload.js` — expose new methods under `loras` / `models` / `iterations`

### New files (renderer)
- `src/renderer/components/ExamplesGrid.jsx` — smart 1/2/3/4 image grid + `+ add` pill
- `src/renderer/components/AddExampleMenu.jsx` — three-option dropdown attached to the add tile
- `src/renderer/components/GalleryPickerOverlay.jsx` — modal listing iterations with filter toggle
- `src/renderer/components/LightboxOverlay.jsx` — near-full-size image overlay

### Modified files (renderer)
- `src/renderer/pages/LoRADetail.jsx` — add trigger words + strength fields (slice 1), restructure layout + wire examples (slice 3)
- `src/renderer/pages/ModelDetail.jsx` — add CFG + steps fields (slice 1), restructure layout + wire examples (slice 3)

---

# Slice 1 — Scalar fields

Ships: trigger words / strength on LoRA detail, recommended CFG / steps on Checkpoint detail, paste-button + click-to-copy on every new field. No layout restructure, no example images yet.

## Task 1: Schema migration

**Files:**
- Modify: `src/main/db/schema.sql`
- Modify: `src/main/db/database.js`

- [ ] **Step 1: Add the two new example-image tables to `schema.sql`**

Append these `CREATE TABLE IF NOT EXISTS` statements to the end of `src/main/db/schema.sql` (after the `settings` table):

```sql
CREATE TABLE IF NOT EXISTS lora_example_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lora_id INTEGER NOT NULL REFERENCES loras(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paste','file','gallery')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_example_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paste','file','gallery')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Both run idempotently on every boot via `db.exec(schema)` in `database.js`; no `user_version` guard needed for table creation.

- [ ] **Step 2: Add the version-4 migration block to `database.js`**

In `src/main/db/database.js`, after the existing `if (version < 3) { ... }` block (around line 45) and before `db.pragma('user_version = 3')`, add a new block. Replace the line `db.pragma('user_version = 3')` with the following:

```js
  if (version < 4) {
    // Idempotent ALTERs — fail silently on fresh installs where the columns
    // are created from schema.sql above (note: schema.sql only has CREATE TABLE,
    // so for *existing* DBs we need ALTER; for *new* DBs the schema.sql defines
    // these columns directly — see step 3 below for the schema.sql additions).
    try { db.exec('ALTER TABLE loras  ADD COLUMN trigger_words TEXT') } catch {}
    try { db.exec('ALTER TABLE loras  ADD COLUMN recommended_strength REAL') } catch {}
    try { db.exec('ALTER TABLE models ADD COLUMN recommended_cfg REAL') } catch {}
    try { db.exec('ALTER TABLE models ADD COLUMN recommended_steps INTEGER') } catch {}
  }

  db.pragma('user_version = 4')
```

- [ ] **Step 3: Add the new columns to `schema.sql` for fresh installs**

So that brand-new databases get the columns directly (not via `ALTER`), edit `src/main/db/schema.sql`:

Change the `loras` table block to:
```sql
CREATE TABLE IF NOT EXISTS loras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  default_weight REAL DEFAULT 1.0,
  status TEXT DEFAULT 'online',
  trigger_words TEXT,
  recommended_strength REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

Change the `models` table block to:
```sql
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_path TEXT,
  description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'online',
  recommended_cfg REAL,
  recommended_steps INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```

The `CREATE TABLE IF NOT EXISTS` is a no-op for existing DBs — the `ALTER`s in `database.js` handle those.

- [ ] **Step 4: Verify the migration runs cleanly**

```bash
npm run dev
```

In a separate terminal, after the Electron window opens, inspect the DB:
```bash
sqlite3 ~/Library/Application\ Support/Forge/forge.db \
  "PRAGMA user_version; PRAGMA table_info(loras); PRAGMA table_info(models);"
```

Expected: `user_version` returns `4`. `loras` has `trigger_words` and `recommended_strength` columns. `models` has `recommended_cfg` and `recommended_steps` columns. No errors in the Electron dev-tools console.

Close the dev server before moving on.

---

## Task 2: Extend `loras:update` and `models:update` IPC handlers

**Files:**
- Modify: `src/main/ipc/loras.js:40-49`
- Modify: `src/main/ipc/models.js:36-40`

- [ ] **Step 1: Extend `loras:update` to accept the new fields**

In `src/main/ipc/loras.js`, replace the existing `loras:update` handler (lines 40-49) with:

```js
  ipcMain.handle('loras:update', (_e, { id, notes, default_weight, trigger_words, recommended_strength }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (default_weight !== undefined) { fields.push('default_weight = ?'); values.push(default_weight) }
    if (trigger_words !== undefined) { fields.push('trigger_words = ?'); values.push(trigger_words) }
    if (recommended_strength !== undefined) {
      const clamped = recommended_strength === null ? null : Math.min(2, Math.max(0, Number(recommended_strength)))
      fields.push('recommended_strength = ?'); values.push(clamped)
    }
    if (fields.length === 0) return true
    db.prepare(`UPDATE loras SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })
```

- [ ] **Step 2: Refactor `models:update` to use the dynamic-fields pattern**

In `src/main/ipc/models.js`, replace the existing `models:update` handler (lines 36-40) with:

```js
  ipcMain.handle('models:update', (_e, { id, notes, recommended_cfg, recommended_steps }) => {
    const db = getDatabase()
    const fields = []
    const values = []
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (recommended_cfg !== undefined) {
      const clamped = recommended_cfg === null ? null : Math.min(30, Math.max(1, Number(recommended_cfg)))
      fields.push('recommended_cfg = ?'); values.push(clamped)
    }
    if (recommended_steps !== undefined) {
      const clamped = recommended_steps === null ? null : Math.min(150, Math.max(1, Math.round(Number(recommended_steps))))
      fields.push('recommended_steps = ?'); values.push(clamped)
    }
    if (fields.length === 0) return true
    db.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })
```

- [ ] **Step 3: Verify via Electron dev-tools console**

Start `npm run dev`. In the Electron dev-tools console:

```js
// Find a LoRA id
await window.forge.loras.list().then(l => console.log(l[0]))
// Update its trigger_words and recommended_strength
await window.forge.loras.update({ id: <id>, trigger_words: 'test trigger', recommended_strength: 1.5 })
// Read back
await window.forge.loras.get({ id: <id> }).then(l => console.log(l.trigger_words, l.recommended_strength))
```

Expected: console logs `"test trigger"` and `1.5`. Repeat the same flow with `models` (`recommended_cfg: 7`, `recommended_steps: 30`). Stop the dev server.

---

## Task 3: LoRA detail page — scalar fields, paste buttons, click-to-copy

**Files:**
- Modify: `src/renderer/pages/LoRADetail.jsx`

- [ ] **Step 1: Add new state + handlers above the existing JSX**

In `src/renderer/pages/LoRADetail.jsx`, replace the entire file with the following. This adds `trigger_words` + `recommended_strength` fields below the existing notes textarea (still single-column layout — slice 3 will restructure):

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'

export default function LoRADetail() {
  const { id } = useParams()
  const loraId = parseInt(id)
  const [lora, setLora] = useState(null)
  const [usage, setUsage] = useState([])
  const [notes, setNotes] = useState('')
  const [triggerWords, setTriggerWords] = useState('')
  const [strength, setStrength] = useState('')
  const [focused, setFocused] = useState(null)
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimers = useRef({})

  const load = useCallback(async () => {
    const [l, u] = await Promise.all([
      window.forge.loras.get(loraId),
      window.forge.loras.usage({ id: loraId }),
    ])
    setLora(l)
    setUsage(u)
    setNotes(l.notes || '')
    setTriggerWords(l.trigger_words || '')
    setStrength(l.recommended_strength != null ? String(l.recommended_strength) : '')
  }, [loraId])

  useEffect(() => { load() }, [load])

  const queueSave = (key, value) => {
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      const payload = { id: loraId }
      if (key === 'notes') payload.notes = value
      if (key === 'trigger_words') payload.trigger_words = value
      if (key === 'recommended_strength') {
        payload.recommended_strength = value === '' ? null : Number(value)
      }
      await window.forge.loras.update(payload)
      showToast('Saved.')
    }, 500)
  }

  const handleNotesChange = (e) => { setNotes(e.target.value); queueSave('notes', e.target.value) }
  const handleTriggerChange = (e) => { setTriggerWords(e.target.value); queueSave('trigger_words', e.target.value) }
  const handleStrengthChange = (e) => {
    const v = e.target.value
    if (v === '' || /^\d*\.?\d*$/.test(v)) {
      setStrength(v)
      queueSave('recommended_strength', v)
    }
  }

  const pasteInto = async (setter, key, kind) => {
    try {
      const text = await navigator.clipboard.readText()
      if (kind === 'number') {
        const num = parseFloat(text)
        if (Number.isNaN(num)) { showToast('Clipboard has no number.'); return }
        const clamped = Math.min(2, Math.max(0, num))
        setter(String(clamped))
        queueSave(key, String(clamped))
      } else {
        setter(text)
        queueSave(key, text)
      }
      showToast('Pasted.')
    } catch {
      showToast("Couldn't read clipboard.")
    }
  }

  const copyValue = async (val) => {
    if (!val) return
    try { await navigator.clipboard.writeText(String(val)); showToast('Copied.') }
    catch { showToast("Couldn't copy.") }
  }

  if (!lora) return <div className="flex items-center justify-center h-full" style={{ color: '#635c48' }}>Loading…</div>

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0f0e0b' }}>
      <button onClick={() => navigate('/loras')} className="text-sm mb-4 block" style={{ color: '#635c48' }}>← LoRAs</button>

      {/* Stats header — unchanged */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                {lora.name}
              </h1>
              {lora.status === 'offline' && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#242118', color: '#635c48' }} title="File not found at last known path.">Offline</span>
              )}
            </div>
            {lora.file_path && <p className="text-xs mt-1 truncate" style={{ color: '#635c48', maxWidth: '400px' }}>{lora.file_path}</p>}
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
              <div className="text-2xl font-bold" style={{ color: '#7daa88', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                {value}
              </div>
              <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#635c48' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trigger words */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Trigger words</p>
          <div className="flex gap-2">
            <button onClick={() => pasteInto(setTriggerWords, 'trigger_words', 'text')}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
            <button onClick={() => copyValue(triggerWords)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
          </div>
        </div>
        <textarea
          value={triggerWords}
          onChange={handleTriggerChange}
          onFocus={() => setFocused('trigger')}
          onBlur={() => setFocused(null)}
          placeholder="Activation tokens / sample prompts, comma-separated or freeform…"
          rows={4}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
          style={{
            background: '#1a1813',
            border: focused === 'trigger' ? '1px solid #635c48' : '1px solid transparent',
            color: '#eae5dc',
          }}
        />
      </div>

      {/* Strength */}
      <div className="mb-6 max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Strength (0–2)</p>
          <div className="flex gap-2">
            <button onClick={() => pasteInto(setStrength, 'recommended_strength', 'number')}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
            <button onClick={() => copyValue(strength)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
          </div>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={strength}
          onChange={handleStrengthChange}
          onFocus={() => setFocused('strength')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. 0.85"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
          style={{
            background: '#1a1813',
            border: focused === 'strength' ? '1px solid #635c48' : '1px solid transparent',
            color: '#e8c820',
          }}
        />
      </div>

      {/* Notes — unchanged shape, just uses new queueSave */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Notes</p>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          onFocus={() => setFocused('notes')}
          onBlur={() => setFocused(null)}
          placeholder="Your notes on this LoRA — strengths, weaknesses, best pairings…"
          rows={5}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
          style={{
            background: '#1a1813',
            border: focused === 'notes' ? '1px solid #635c48' : '1px solid transparent',
            color: '#eae5dc',
          }}
        />
      </div>

      {/* Usage gallery — unchanged */}
      <div>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#635c48' }}>
          Used in — {usage.length} iteration{usage.length !== 1 ? 's' : ''}
        </p>
        {usage.length === 0 ? (
          <p className="text-sm" style={{ color: '#635c48' }}>Not used in any iterations yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {usage.map(iter => (
              <motion.div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '0.85', background: '#1a1813', border: '1px solid #302c1e' }}
                whileHover={{ scale: 1.04 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <img src={`forge://thumb${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }} />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[10px] font-medium" style={{ color: '#bfb8a8' }}>wt {iter.weight}</p>
                  <p className="text-[9px]" style={{ color: '#bfb8a8' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify the new fields**

`npm run dev`. Open a LoRA detail page from the sidebar.

Expected:
- Trigger words textarea and Strength input appear above the existing Notes textarea.
- Typing in any field shows "Saved." toast 500ms after the last keystroke.
- Refreshing (Cmd+R) preserves the values.
- Strength input rejects non-numeric input (e.g. typing "abc" doesn't appear).
- Strength input accepts decimals (e.g. "1.25").
- Setting strength to a value outside 0–2 in Electron dev-tools (`forge.loras.update({ id, recommended_strength: 5 })`) clamps to 2 on read-back.
- `📋 Paste` on Trigger words pastes clipboard text.
- `📋 Paste` on Strength with a numeric clipboard value sets it; clamps to 0–2.
- `📋 Paste` on Strength with `"abc"` clipboard shows "Clipboard has no number."
- `Copy` on each field copies the current value to clipboard.

Leave the dev server running for the next task.

---

## Task 4: Checkpoint detail page — scalar fields, paste buttons, click-to-copy

**Files:**
- Modify: `src/renderer/pages/ModelDetail.jsx`

- [ ] **Step 1: Replace the file with the extended version**

Replace the entire contents of `src/renderer/pages/ModelDetail.jsx` with:

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'

export default function ModelDetail() {
  const { id } = useParams()
  const modelId = parseInt(id)
  const [model, setModel] = useState(null)
  const [usage, setUsage] = useState([])
  const [notes, setNotes] = useState('')
  const [cfg, setCfg] = useState('')
  const [steps, setSteps] = useState('')
  const [focused, setFocused] = useState(null)
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimers = useRef({})

  const load = useCallback(async () => {
    const [m, u] = await Promise.all([
      window.forge.models.get(modelId),
      window.forge.models.usage(modelId),
    ])
    setModel(m)
    setUsage(u)
    setNotes(m.notes || '')
    setCfg(m.recommended_cfg != null ? String(m.recommended_cfg) : '')
    setSteps(m.recommended_steps != null ? String(m.recommended_steps) : '')
  }, [modelId])

  useEffect(() => { load() }, [load])

  const queueSave = (key, value) => {
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      const payload = { id: modelId }
      if (key === 'notes') payload.notes = value
      if (key === 'recommended_cfg') payload.recommended_cfg = value === '' ? null : Number(value)
      if (key === 'recommended_steps') payload.recommended_steps = value === '' ? null : Number(value)
      await window.forge.models.update(payload)
      showToast('Saved.')
    }, 500)
  }

  const handleNotesChange = (e) => { setNotes(e.target.value); queueSave('notes', e.target.value) }
  const handleCfgChange = (e) => {
    const v = e.target.value
    if (v === '' || /^\d*\.?\d*$/.test(v)) { setCfg(v); queueSave('recommended_cfg', v) }
  }
  const handleStepsChange = (e) => {
    const v = e.target.value
    if (v === '' || /^\d*$/.test(v)) { setSteps(v); queueSave('recommended_steps', v) }
  }

  const pasteNumber = async (setter, key, min, max, isInt) => {
    try {
      const text = await navigator.clipboard.readText()
      const num = isInt ? parseInt(text, 10) : parseFloat(text)
      if (Number.isNaN(num)) { showToast('Clipboard has no number.'); return }
      const clamped = Math.min(max, Math.max(min, num))
      setter(String(clamped))
      queueSave(key, String(clamped))
      showToast('Pasted.')
    } catch { showToast("Couldn't read clipboard.") }
  }

  const pasteText = async (setter, key) => {
    try {
      const text = await navigator.clipboard.readText()
      setter(text); queueSave(key, text); showToast('Pasted.')
    } catch { showToast("Couldn't read clipboard.") }
  }

  const copyValue = async (val) => {
    if (!val) return
    try { await navigator.clipboard.writeText(String(val)); showToast('Copied.') }
    catch { showToast("Couldn't copy.") }
  }

  if (!model) return <div className="flex items-center justify-center h-full" style={{ color: '#635c48' }}>Loading…</div>

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0f0e0b' }}>
      <button onClick={() => navigate('/models')} className="text-sm mb-4 block" style={{ color: '#635c48' }}>← Checkpoints</button>

      {/* Stats header — unchanged */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-xl font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            {model.name}
          </h1>
          {model.status === 'offline' && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#242118', color: '#635c48' }}>Offline</span>
          )}
        </div>
        {model.file_path && <p className="text-xs mb-3 truncate" style={{ color: '#635c48' }}>{model.file_path}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#7aa0e8', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              {model.usage_count}
            </div>
            <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#635c48' }}>Iterations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#7aa0e8', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              {model.main_gen_count}
            </div>
            <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#635c48' }}>Main Gens</div>
          </div>
        </div>
      </div>

      {/* Rec CFG */}
      <div className="mb-6 max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Recommended CFG (1–30)</p>
          <div className="flex gap-2">
            <button onClick={() => pasteNumber(setCfg, 'recommended_cfg', 1, 30, false)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
            <button onClick={() => copyValue(cfg)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
          </div>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={cfg}
          onChange={handleCfgChange}
          onFocus={() => setFocused('cfg')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. 7"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
          style={{
            background: '#1a1813',
            border: focused === 'cfg' ? '1px solid #635c48' : '1px solid transparent',
            color: '#7aa0e8',
          }}
        />
      </div>

      {/* Rec steps */}
      <div className="mb-6 max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Recommended steps (1–150)</p>
          <div className="flex gap-2">
            <button onClick={() => pasteNumber(setSteps, 'recommended_steps', 1, 150, true)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
            <button onClick={() => copyValue(steps)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
          </div>
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={steps}
          onChange={handleStepsChange}
          onFocus={() => setFocused('steps')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. 30"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
          style={{
            background: '#1a1813',
            border: focused === 'steps' ? '1px solid #635c48' : '1px solid transparent',
            color: '#7aa0e8',
          }}
        />
      </div>

      {/* Notes */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Notes</p>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          onFocus={() => setFocused('notes')}
          onBlur={() => setFocused(null)}
          placeholder="Your notes on this checkpoint…"
          rows={5}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
          style={{
            background: '#1a1813',
            border: focused === 'notes' ? '1px solid #635c48' : '1px solid transparent',
            color: '#eae5dc',
          }}
        />
      </div>

      {/* Usage gallery — unchanged */}
      <div>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#635c48' }}>
          Used in — {usage.length} iteration{usage.length !== 1 ? 's' : ''}
        </p>
        {usage.length === 0 ? (
          <p className="text-sm" style={{ color: '#635c48' }}>Not used in any iterations yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {usage.map(iter => (
              <motion.div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '0.85', background: '#1a1813', border: '1px solid #302c1e' }}
                whileHover={{ scale: 1.04 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <img src={`forge://thumb${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }} />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[9px]" style={{ color: '#bfb8a8' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify**

Open a Checkpoint detail page from the sidebar (`/models/:id`).

Expected:
- CFG + Steps inputs appear above the Notes textarea.
- Typing valid numbers shows "Saved." toast 500ms after last keystroke.
- CFG accepts decimals (`7.5`); Steps rejects decimals (only digits allowed).
- Refresh preserves values.
- `📋 Paste` works for both fields with numeric clipboard content.
- Pasting a value > max (e.g. CFG `99`) clamps to 30; steps `999` clamps to 150.
- `Copy` copies the displayed value.

Stop the dev server.

---

## Task 5: Commit slice 1

- [ ] **Step 1: Commit the changes**

```bash
git -C /Users/ibraheemfiraz/Desktop/ForgeProject add \
  src/main/db/schema.sql \
  src/main/db/database.js \
  src/main/ipc/loras.js \
  src/main/ipc/models.js \
  src/renderer/pages/LoRADetail.jsx \
  src/renderer/pages/ModelDetail.jsx
```

```bash
git -C /Users/ibraheemfiraz/Desktop/ForgeProject commit -m "$(cat <<'EOF'
feat(detail): trigger words / strength on LoRA, rec CFG / steps on checkpoint

Adds typed user-curated fields under existing Notes on both detail pages.
Each field gets a paste-from-clipboard button and a click-to-copy button.
Numeric inputs clamp to validated ranges (strength 0-2, CFG 1-30, steps 1-150).

Schema bumped to user_version 4 with idempotent ALTERs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: clean commit, no hook failures.

---

# Slice 2 — Example images backend + minimal grid

Ships: ability to add/remove example images via paste / file picker / gallery picker, files stored in a managed directory under `userData`, displayed in a placeholder uniform grid (smart-resize and lightbox come in slice 3).

## Task 6: `example-images.js` file ops module

**Files:**
- Create: `src/main/examples/example-images.js`

- [ ] **Step 1: Create the file ops module**

Create `src/main/examples/example-images.js` with:

```js
// File operations for the managed example-images directory:
//   <userData>/example-images/{loras|models}/<entity_id>/<uuid>.png
//
// Only paste/file sources land here. Gallery picks just reference the existing
// iteration image_path and don't touch this directory.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { app } = require('electron')

function getEntityDir(entityKind, entityId) {
  // entityKind: 'loras' | 'models'
  const dir = path.join(app.getPath('userData'), 'example-images', entityKind, String(entityId))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function saveBufferAsExample(entityKind, entityId, buffer, extension = '.png') {
  const dir = getEntityDir(entityKind, entityId)
  const filename = crypto.randomUUID() + extension
  const fullPath = path.join(dir, filename)
  fs.writeFileSync(fullPath, buffer)
  return fullPath
}

function copyFileAsExample(entityKind, entityId, sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase() || '.png'
  const dir = getEntityDir(entityKind, entityId)
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
```

- [ ] **Step 2: No verification yet**

This module isn't wired up until the next task. Move on.

---

## Task 7: Image IPC handlers + preload + extend `get`

**Files:**
- Modify: `src/main/ipc/loras.js`
- Modify: `src/main/ipc/models.js`
- Modify: `src/main/preload.js`

- [ ] **Step 1: Extend `loras:get` to attach `example_images`**

In `src/main/ipc/loras.js`, replace the `loras:get` handler (lines 24-38) with:

```js
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
    if (!lora) return null
    lora.example_images = db.prepare(`
      SELECT id, image_path, source, sort_order
      FROM lora_example_images
      WHERE lora_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(id)
    return lora
  })
```

- [ ] **Step 2: Add the three new LoRA image handlers**

At the top of `src/main/ipc/loras.js`, replace the existing imports with:

```js
const { ipcMain, dialog, BrowserWindow } = require('electron')
const { getDatabase } = require('../db/database')
const { scanLorasFolder } = require('../scanner/folder-scanner')
const { saveBufferAsExample, copyFileAsExample, unlinkExample } = require('../examples/example-images')
```

Inside the `registerLorasHandlers()` function, just before the closing `}`, add:

```js
  ipcMain.handle('loras:add-example-image', (_e, payload) => {
    const db = getDatabase()
    const { source, entityId } = payload
    let imagePath

    if (source === 'paste') {
      const buf = Buffer.from(payload.pngBuffer)
      imagePath = saveBufferAsExample('loras', entityId, buf, '.png')
    } else if (source === 'file') {
      imagePath = copyFileAsExample('loras', entityId, payload.sourcePath)
    } else if (source === 'gallery') {
      const iter = db.prepare('SELECT image_path FROM iterations WHERE id = ?').get(payload.iterationId)
      if (!iter) throw new Error('iteration not found')
      imagePath = iter.image_path
    } else {
      throw new Error('unknown source: ' + source)
    }

    const maxRow = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as max FROM lora_example_images WHERE lora_id = ?'
    ).get(entityId)
    const sortOrder = maxRow.max + 1

    const result = db.prepare(
      'INSERT INTO lora_example_images (lora_id, image_path, source, sort_order) VALUES (?, ?, ?, ?)'
    ).run(entityId, imagePath, source, sortOrder)

    return { id: result.lastInsertRowid, image_path: imagePath, source, sort_order: sortOrder }
  })

  ipcMain.handle('loras:remove-example-image', (_e, { exampleId }) => {
    const db = getDatabase()
    const row = db.prepare('SELECT image_path, source FROM lora_example_images WHERE id = ?').get(exampleId)
    if (!row) return false
    db.prepare('DELETE FROM lora_example_images WHERE id = ?').run(exampleId)
    if (row.source === 'paste' || row.source === 'file') unlinkExample(row.image_path)
    return true
  })

  ipcMain.handle('loras:pick-example-image-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Pick an example image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
```

- [ ] **Step 3: Mirror for models**

In `src/main/ipc/models.js`, replace the imports at the top with:

```js
const { ipcMain, dialog, BrowserWindow } = require('electron')
const { getDatabase } = require('../db/database')
const { scanCheckpointsFolder } = require('../scanner/folder-scanner')
const { saveBufferAsExample, copyFileAsExample, unlinkExample } = require('../examples/example-images')
```

Replace the `models:get` handler (lines 24-34) with:

```js
  ipcMain.handle('models:get', (_e, { id }) => {
    const db = getDatabase()
    const model = db.prepare(`
      SELECT m.*, COUNT(i.id) as usage_count,
        COUNT(DISTINCT i.main_gen_id) as main_gen_count
      FROM models m
      LEFT JOIN iterations i ON i.checkpoint_id = m.id
      WHERE m.id = ?
      GROUP BY m.id
    `).get(id)
    if (!model) return null
    model.example_images = db.prepare(`
      SELECT id, image_path, source, sort_order
      FROM model_example_images
      WHERE model_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(id)
    return model
  })
```

Inside `registerModelsHandlers()`, just before the closing `}`, add:

```js
  ipcMain.handle('models:add-example-image', (_e, payload) => {
    const db = getDatabase()
    const { source, entityId } = payload
    let imagePath

    if (source === 'paste') {
      const buf = Buffer.from(payload.pngBuffer)
      imagePath = saveBufferAsExample('models', entityId, buf, '.png')
    } else if (source === 'file') {
      imagePath = copyFileAsExample('models', entityId, payload.sourcePath)
    } else if (source === 'gallery') {
      const iter = db.prepare('SELECT image_path FROM iterations WHERE id = ?').get(payload.iterationId)
      if (!iter) throw new Error('iteration not found')
      imagePath = iter.image_path
    } else {
      throw new Error('unknown source: ' + source)
    }

    const maxRow = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as max FROM model_example_images WHERE model_id = ?'
    ).get(entityId)
    const sortOrder = maxRow.max + 1

    const result = db.prepare(
      'INSERT INTO model_example_images (model_id, image_path, source, sort_order) VALUES (?, ?, ?, ?)'
    ).run(entityId, imagePath, source, sortOrder)

    return { id: result.lastInsertRowid, image_path: imagePath, source, sort_order: sortOrder }
  })

  ipcMain.handle('models:remove-example-image', (_e, { exampleId }) => {
    const db = getDatabase()
    const row = db.prepare('SELECT image_path, source FROM model_example_images WHERE id = ?').get(exampleId)
    if (!row) return false
    db.prepare('DELETE FROM model_example_images WHERE id = ?').run(exampleId)
    if (row.source === 'paste' || row.source === 'file') unlinkExample(row.image_path)
    return true
  })

  ipcMain.handle('models:pick-example-image-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Pick an example image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
```

- [ ] **Step 4: Expose new methods in preload**

In `src/main/preload.js`, replace the `loras` block with:

```js
  loras: {
    scan: () => ipcRenderer.invoke('loras:scan'),
    list: () => ipcRenderer.invoke('loras:list'),
    get: (id) => ipcRenderer.invoke('loras:get', { id }),
    update: (args) => ipcRenderer.invoke('loras:update', args),
    usage: (args) => ipcRenderer.invoke('loras:usage', args),
    create: (args) => ipcRenderer.invoke('loras:create', args),
    merge: (args) => ipcRenderer.invoke('loras:merge', args),
    addExampleImage: (args) => ipcRenderer.invoke('loras:add-example-image', args),
    removeExampleImage: (exampleId) => ipcRenderer.invoke('loras:remove-example-image', { exampleId }),
    pickExampleImageFile: () => ipcRenderer.invoke('loras:pick-example-image-file'),
  },
```

And replace the `models` block with:

```js
  models: {
    scan: () => ipcRenderer.invoke('models:scan'),
    list: () => ipcRenderer.invoke('models:list'),
    get: (id) => ipcRenderer.invoke('models:get', { id }),
    update: (args) => ipcRenderer.invoke('models:update', args),
    usage: (id) => ipcRenderer.invoke('models:usage', { id }),
    create: (args) => ipcRenderer.invoke('models:create', args),
    merge: (args) => ipcRenderer.invoke('models:merge', args),
    addExampleImage: (args) => ipcRenderer.invoke('models:add-example-image', args),
    removeExampleImage: (exampleId) => ipcRenderer.invoke('models:remove-example-image', { exampleId }),
    pickExampleImageFile: () => ipcRenderer.invoke('models:pick-example-image-file'),
  },
```

- [ ] **Step 5: Verify the IPC end-to-end from dev-tools**

`npm run dev`. In the Electron dev-tools console (on any LoRA detail page):

```js
// Find a LoRA
const lora = (await window.forge.loras.list())[0]

// Paste-source: synthesize a 1×1 transparent PNG
const pngBytes = new Uint8Array([
  0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, 0x00,0x00,0x00,0x0D,
  0x49,0x48,0x44,0x52, 0x00,0x00,0x00,0x01, 0x00,0x00,0x00,0x01,
  0x08,0x06,0x00,0x00,0x00, 0x1F,0x15,0xC4,0x89,
  0x00,0x00,0x00,0x0D, 0x49,0x44,0x41,0x54, 0x78,0x9C,0x62,0x00,
  0x01,0x00,0x00,0x05,0x00,0x01, 0x0D,0x0A,0x2D,0xB4,
  0x00,0x00,0x00,0x00, 0x49,0x45,0x4E,0x44, 0xAE,0x42,0x60,0x82
])
const added = await window.forge.loras.addExampleImage({
  source: 'paste', entityId: lora.id, pngBuffer: pngBytes
})
console.log('added paste:', added)

// File-picker source
const picked = await window.forge.loras.pickExampleImageFile()
if (picked) {
  await window.forge.loras.addExampleImage({ source: 'file', entityId: lora.id, sourcePath: picked })
}

// Gallery source — grab any iteration id
const iter = (await window.forge.mainGens.list())[0]
const fullMg = await window.forge.mainGens.get(iter.id)
const someIter = (await window.forge.iterations.list(fullMg.id))[0]
await window.forge.loras.addExampleImage({ source: 'gallery', entityId: lora.id, iterationId: someIter.id })

// Read back
const updated = await window.forge.loras.get(lora.id)
console.log('example_images:', updated.example_images)

// Delete one (the paste one)
await window.forge.loras.removeExampleImage(added.id)
const after = await window.forge.loras.get(lora.id)
console.log('after delete:', after.example_images)
```

Expected:
- `added` shows `{ id, image_path: <absolute path under userData/example-images/loras/<lora.id>/>, source: 'paste', sort_order: 0 }`.
- File picker opens a native dialog; if you pick a PNG, a second row appears with `source: 'file'` and a path under the managed dir.
- Gallery source returns a row with `image_path` matching the iteration's path (anywhere in your output folder).
- `updated.example_images` shows all three rows in `sort_order ASC` order.
- After delete, the paste row is gone and the managed file no longer exists on disk (`ls "$HOME/Library/Application Support/Forge/example-images/loras/<id>/"`).
- Gallery row's file is **not** touched on delete (test by deleting it, then verifying the iteration's image still exists).

Repeat once for a checkpoint via `window.forge.models.*` to confirm the mirror works. Stop the dev server.

---

## Task 8: `iterations:list-all` + `GalleryPickerOverlay` component

**Files:**
- Modify: `src/main/ipc/iterations.js`
- Modify: `src/main/preload.js`
- Create: `src/renderer/components/GalleryPickerOverlay.jsx`

- [ ] **Step 1: Add `iterations:list-all` handler**

In `src/main/ipc/iterations.js`, inside `registerIterationsHandlers()`, after the existing `iterations:list` handler, add:

```js
  ipcMain.handle('iterations:list-all', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT i.id, i.image_path, i.iteration_number, i.main_gen_id,
        mg.title as main_gen_title
      FROM iterations i
      JOIN main_gens mg ON mg.id = i.main_gen_id
      ORDER BY i.created_at DESC
    `).all()
  })
```

- [ ] **Step 2: Expose it in preload**

In `src/main/preload.js`, replace the `iterations` block to add `listAll`:

```js
  iterations: {
    list: (mainGenId) => ipcRenderer.invoke('iterations:list', { mainGenId }),
    listAll: () => ipcRenderer.invoke('iterations:list-all'),
    get: (id) => ipcRenderer.invoke('iterations:get', { id }),
    create: (args) => ipcRenderer.invoke('iterations:create', args),
    update: (args) => ipcRenderer.invoke('iterations:update', args),
    delete: (id) => ipcRenderer.invoke('iterations:delete', { id }),
    setLoras: (id, loras) => ipcRenderer.invoke('iterations:set-loras', { id, loras }),
    setCustomFields: (id, fields) => ipcRenderer.invoke('iterations:set-custom-fields', { id, fields }),
  },
```

- [ ] **Step 3: Create `GalleryPickerOverlay.jsx`**

Create `src/renderer/components/GalleryPickerOverlay.jsx`:

```jsx
import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { overlayBg, scaleIn } from '../lib/motion.js'

// Picks an iteration to use as an example image.
// Default-filtered to iterations using the given entity; toggle for all.
//
// Props:
//   isOpen: boolean
//   entityKind: 'lora' | 'checkpoint'
//   entityId: number
//   entityName: string
//   onPick: (iterationId) => void
//   onClose: () => void
export default function GalleryPickerOverlay({ isOpen, entityKind, entityId, entityName, onPick, onClose }) {
  const [showAll, setShowAll] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    const fetch = async () => {
      let rows
      if (showAll) {
        rows = await window.forge.iterations.listAll()
      } else if (entityKind === 'lora') {
        rows = await window.forge.loras.usage({ id: entityId })
      } else {
        rows = await window.forge.models.usage(entityId)
      }
      if (!cancelled) { setItems(rows); setLoading(false) }
    }
    fetch()
    return () => { cancelled = true }
  }, [isOpen, showAll, entityKind, entityId])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          variants={overlayBg} initial="hidden" animate="visible" exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: '#1a1813', border: '1px solid #302c1e', width: 'min(960px, 90vw)', height: 'min(720px, 85vh)' }}
            variants={scaleIn} initial="hidden" animate="visible"
            onClick={e => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #302c1e' }}>
              <div>
                <h2 style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 18 }}>
                  Pick an example for {entityName}
                </h2>
                <p className="text-xs mt-1" style={{ color: '#635c48' }}>
                  Click any iteration to use its image as an example.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: '#242118' }}>
                <button
                  onClick={() => setShowAll(false)}
                  className="text-xs px-3 py-1 rounded-md"
                  style={{
                    background: !showAll ? '#e8c820' : 'transparent',
                    color: !showAll ? '#0f0e0b' : '#bfb8a8',
                    fontWeight: !showAll ? 600 : 400,
                  }}
                >Only this {entityKind === 'lora' ? 'LoRA' : 'checkpoint'}</button>
                <button
                  onClick={() => setShowAll(true)}
                  className="text-xs px-3 py-1 rounded-md"
                  style={{
                    background: showAll ? '#e8c820' : 'transparent',
                    color: showAll ? '#0f0e0b' : '#bfb8a8',
                    fontWeight: showAll ? 600 : 400,
                  }}
                >All iterations</button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
              {loading && <p className="text-sm" style={{ color: '#635c48' }}>Loading…</p>}
              {!loading && items.length === 0 && (
                <p className="text-sm" style={{ color: '#635c48' }}>
                  {showAll
                    ? 'No iterations yet — assign some from the Inbox first.'
                    : `No iterations use this ${entityKind === 'lora' ? 'LoRA' : 'checkpoint'} yet — try "All iterations".`}
                </p>
              )}
              {!loading && items.length > 0 && (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                  {items.map(iter => (
                    <motion.div
                      key={iter.id}
                      onClick={() => { onPick(iter.id); onClose() }}
                      className="relative cursor-pointer rounded-lg overflow-hidden"
                      style={{ aspectRatio: '0.85', background: '#0f0e0b', border: '1px solid #302c1e' }}
                      whileHover={{ scale: 1.04, borderColor: '#e8c820' }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      <img src={`forge://thumb${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 60%, rgba(0,0,0,0.85))' }} />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-[10px]" style={{ color: '#bfb8a8' }}>
                          {iter.main_gen_title} · #{iter.iteration_number}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Verify via dev-tools**

`npm run dev`. In the dev-tools console:

```js
const all = await window.forge.iterations.listAll()
console.log('total iterations:', all.length, 'sample:', all[0])
```

Expected: array of objects with `id`, `image_path`, `iteration_number`, `main_gen_id`, `main_gen_title`. Stop the dev server.

---

## Task 9: `AddExampleMenu` component

**Files:**
- Create: `src/renderer/components/AddExampleMenu.jsx`

- [ ] **Step 1: Create the dropdown menu**

Create `src/renderer/components/AddExampleMenu.jsx`:

```jsx
import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Three-option dropdown attached to the "+ Add example" tile.
//
// Props:
//   isOpen: boolean
//   anchor: 'right' | 'left'  — which side of the trigger to align to
//   onPaste: () => void
//   onPickFile: () => void
//   onPickGallery: () => void
//   onClose: () => void
export default function AddExampleMenu({ isOpen, anchor = 'right', onPaste, onPickFile, onPickGallery, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const escHandler = (e) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [isOpen, onClose])

  const items = [
    { label: 'Paste screenshot', desc: 'From clipboard', action: onPaste },
    { label: 'Choose file…',     desc: 'PNG, JPG, WEBP', action: onPickFile },
    { label: 'Pick from gallery',desc: 'An existing iteration', action: onPickGallery },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          className="absolute z-30 rounded-xl overflow-hidden"
          style={{
            background: '#242118',
            border: '1px solid #302c1e',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            top: 'calc(100% + 6px)',
            [anchor]: 0,
            minWidth: 220,
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.16,1,0.3,1] } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
        >
          {items.map(it => (
            <button
              key={it.label}
              onClick={() => { it.action(); onClose() }}
              className="block w-full text-left px-4 py-2.5 hover:bg-[#302c1e] transition-colors"
            >
              <div className="text-sm" style={{ color: '#eae5dc' }}>{it.label}</div>
              <div className="text-[10px] mt-0.5" style={{ color: '#635c48' }}>{it.desc}</div>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: No standalone verification**

This component is only used inside `ExamplesGrid` (next task). Move on.

---

## Task 10: Minimal `ExamplesGrid` + wire into both detail pages

**Files:**
- Create: `src/renderer/components/ExamplesGrid.jsx`
- Modify: `src/renderer/pages/LoRADetail.jsx`
- Modify: `src/renderer/pages/ModelDetail.jsx`

- [ ] **Step 1: Create the placeholder uniform grid**

Create `src/renderer/components/ExamplesGrid.jsx`. This is the *slice-2* version — uniform grid only, smart resizing comes in slice 3:

```jsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import AddExampleMenu from './AddExampleMenu.jsx'
import GalleryPickerOverlay from './GalleryPickerOverlay.jsx'

// Props:
//   images: Array<{ id, image_path, source, sort_order }>
//   entityKind: 'lora' | 'checkpoint'
//   entityId: number
//   entityName: string
//   onChanged: () => void   // called after add/remove to refresh parent state
//
// Slice 2 version: uniform 2-col grid + simple + add pill below.
// Slice 3 will replace this with the smart 1/2/3/4 pattern + lightbox.
export default function ExamplesGrid({ images, entityKind, entityId, entityName, onChanged }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const showToast = useToast()
  const max = 4
  const namespace = entityKind === 'lora' ? 'loras' : 'models'

  const addPaste = async () => {
    try {
      const items = await navigator.clipboard.read()
      let blob = null
      for (const item of items) {
        const pngType = item.types.find(t => t === 'image/png')
        if (pngType) { blob = await item.getType(pngType); break }
      }
      if (!blob) { showToast('No image in clipboard.'); return }
      const buf = new Uint8Array(await blob.arrayBuffer())
      await window.forge[namespace].addExampleImage({ source: 'paste', entityId, pngBuffer: buf })
      showToast('Pasted.')
      onChanged()
    } catch (err) {
      showToast("Couldn't paste — clipboard access denied?")
    }
  }

  const addFile = async () => {
    const sourcePath = await window.forge[namespace].pickExampleImageFile()
    if (!sourcePath) return
    try {
      await window.forge[namespace].addExampleImage({ source: 'file', entityId, sourcePath })
      showToast('Added.')
      onChanged()
    } catch {
      showToast("Couldn't save image.")
    }
  }

  const addGallery = (iterationId) => {
    window.forge[namespace].addExampleImage({ source: 'gallery', entityId, iterationId }).then(() => {
      showToast('Added.')
      onChanged()
    })
  }

  const remove = async (exampleId) => {
    await window.forge[namespace].removeExampleImage(exampleId)
    onChanged()
  }

  return (
    <div className="relative">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <AnimatePresence>
          {images.map(img => (
            <motion.div
              key={img.id}
              className="relative rounded-lg overflow-hidden group"
              style={{ aspectRatio: '1', background: '#0f0e0b', border: '1px solid #302c1e' }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.16,1,0.3,1] } }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
            >
              <img src={`forge://thumb${img.image_path}`} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => remove(img.id)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                style={{ background: 'rgba(15,14,11,0.85)', color: '#e87068', border: '1px solid #302c1e' }}
                title="Remove"
              >×</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {images.length < max && (
        <div className="relative mt-3">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-full py-3 rounded-lg text-sm"
            style={{
              background: 'transparent',
              border: '1px dashed #302c1e',
              color: '#635c48',
            }}
          >
            + Add example{images.length === 0 ? ' — Paste · Choose file · Pick from gallery' : ''}
          </button>
          <AddExampleMenu
            isOpen={menuOpen}
            anchor="left"
            onClose={() => setMenuOpen(false)}
            onPaste={addPaste}
            onPickFile={addFile}
            onPickGallery={() => setPickerOpen(true)}
          />
        </div>
      )}

      <GalleryPickerOverlay
        isOpen={pickerOpen}
        entityKind={entityKind}
        entityId={entityId}
        entityName={entityName}
        onPick={addGallery}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Wire into `LoRADetail.jsx`**

In `src/renderer/pages/LoRADetail.jsx`, add the import near the top with the other component imports:

```jsx
import ExamplesGrid from '../components/ExamplesGrid.jsx'
```

Inside the component, insert the examples block between the stats header and the Trigger words block (i.e. after the `</div>` that closes the stats card, before `{/* Trigger words */}`):

```jsx
      {/* Examples */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Examples</p>
        <ExamplesGrid
          images={lora.example_images || []}
          entityKind="lora"
          entityId={loraId}
          entityName={lora.name}
          onChanged={load}
        />
      </div>
```

- [ ] **Step 3: Wire into `ModelDetail.jsx`**

In `src/renderer/pages/ModelDetail.jsx`, add the import:

```jsx
import ExamplesGrid from '../components/ExamplesGrid.jsx'
```

Insert the examples block between the stats card and the Recommended CFG block:

```jsx
      {/* Examples */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Examples</p>
        <ExamplesGrid
          images={model.example_images || []}
          entityKind="checkpoint"
          entityId={modelId}
          entityName={model.name}
          onChanged={load}
        />
      </div>
```

- [ ] **Step 4: Verify end-to-end UI**

`npm run dev`. Open a LoRA detail page.

Expected:
- Empty state shows the full-width dashed pill: `+ Add example — Paste · Choose file · Pick from gallery`.
- Click the pill → dropdown with three options appears.
- **Paste screenshot**: copy a screenshot (Cmd+Shift+4 then Ctrl-click), click "Paste screenshot" → image appears in the grid. Toast "Pasted."
- **Choose file…**: a native file dialog opens. Pick a PNG → image appears.
- **Pick from gallery**: modal opens defaulted to "Only this LoRA" iterations. Toggle "All iterations" → all iterations show. Click one → modal closes, image appears in grid. Toast "Added."
- Hover an image tile → `×` button appears in top-right. Click → image disappears (fade-out animation), `onChanged` reloads.
- After 4 images, the `+ Add example` pill disappears.
- Refresh (Cmd+R) → all images persist (read back from DB).
- Repeat once on a Checkpoint detail page.

Stop the dev server.

---

## Task 11: Commit slice 2

- [ ] **Step 1: Commit the changes**

```bash
git -C /Users/ibraheemfiraz/Desktop/ForgeProject add \
  src/main/examples/example-images.js \
  src/main/ipc/loras.js \
  src/main/ipc/models.js \
  src/main/ipc/iterations.js \
  src/main/preload.js \
  src/renderer/components/ExamplesGrid.jsx \
  src/renderer/components/AddExampleMenu.jsx \
  src/renderer/components/GalleryPickerOverlay.jsx \
  src/renderer/pages/LoRADetail.jsx \
  src/renderer/pages/ModelDetail.jsx
```

```bash
git -C /Users/ibraheemfiraz/Desktop/ForgeProject commit -m "$(cat <<'EOF'
feat(detail): example images on LoRA and Checkpoint pages — paste/file/gallery

Adds lora_example_images and model_example_images tables with paste-screenshot,
file-picker, and pick-from-gallery sources. Paste/file go into the managed
<userData>/example-images/ directory and get unlinked on row delete; gallery
picks just reference the iteration's existing path.

UI is a placeholder uniform 2-col grid with a + add dashed pill — smart
resizing and lightbox come in slice 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Slice 3 — Two-column layout + smart grid + lightbox

Ships: the approved two-column split (examples ~60% left, fields stack right), smart 1/2/3/4 image grid patterns, click-to-zoom lightbox.

## Task 12: Two-column layout restructure for both detail pages

**Files:**
- Modify: `src/renderer/pages/LoRADetail.jsx`
- Modify: `src/renderer/pages/ModelDetail.jsx`

- [ ] **Step 1: Restructure LoRADetail body**

In `src/renderer/pages/LoRADetail.jsx`, replace everything from the closing `</div>` of the stats header through the closing tag of the Notes block (i.e. the Examples, Trigger words, Strength, and Notes sections) with this single two-column block. Keep the usage gallery at the end unchanged.

The new structure:

```jsx
      {/* Two-column body: examples left ~60%, fields stacked right */}
      <div className="mb-6 grid gap-6 detail-split" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        {/* Left column: examples */}
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Examples</p>
          <ExamplesGrid
            images={lora.example_images || []}
            entityKind="lora"
            entityId={loraId}
            entityName={lora.name}
            onChanged={load}
          />
        </div>

        {/* Right column: trigger words / strength / notes */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Trigger words</p>
              <div className="flex gap-2">
                <button onClick={() => pasteInto(setTriggerWords, 'trigger_words', 'text')}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
                <button onClick={() => copyValue(triggerWords)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
              </div>
            </div>
            <textarea
              value={triggerWords}
              onChange={handleTriggerChange}
              onFocus={() => setFocused('trigger')}
              onBlur={() => setFocused(null)}
              placeholder="Activation tokens / sample prompts…"
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
              style={{
                background: '#1a1813',
                border: focused === 'trigger' ? '1px solid #635c48' : '1px solid transparent',
                color: '#eae5dc',
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Strength (0–2)</p>
              <div className="flex gap-2">
                <button onClick={() => pasteInto(setStrength, 'recommended_strength', 'number')}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
                <button onClick={() => copyValue(strength)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
              </div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={strength}
              onChange={handleStrengthChange}
              onFocus={() => setFocused('strength')}
              onBlur={() => setFocused(null)}
              placeholder="e.g. 0.85"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
              style={{
                background: '#1a1813',
                border: focused === 'strength' ? '1px solid #635c48' : '1px solid transparent',
                color: '#e8c820',
              }}
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Notes</p>
            <textarea
              value={notes}
              onChange={handleNotesChange}
              onFocus={() => setFocused('notes')}
              onBlur={() => setFocused(null)}
              placeholder="Your notes on this LoRA…"
              rows={5}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
              style={{
                background: '#1a1813',
                border: focused === 'notes' ? '1px solid #635c48' : '1px solid transparent',
                color: '#eae5dc',
              }}
            />
          </div>
        </div>
      </div>
```

Also add this `<style>` block right before the closing `</div>` of the page root (just after the usage-gallery `</div>`) so the layout stacks on narrow widths:

```jsx
      <style>{`
        @media (max-width: 900px) {
          .detail-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
```

- [ ] **Step 2: Restructure ModelDetail body**

In `src/renderer/pages/ModelDetail.jsx`, do the equivalent restructure. Replace the Examples, Rec CFG, Rec Steps, and Notes sections with:

```jsx
      {/* Two-column body */}
      <div className="mb-6 grid gap-6 detail-split" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Examples</p>
          <ExamplesGrid
            images={model.example_images || []}
            entityKind="checkpoint"
            entityId={modelId}
            entityName={model.name}
            onChanged={load}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Recommended CFG (1–30)</p>
              <div className="flex gap-2">
                <button onClick={() => pasteNumber(setCfg, 'recommended_cfg', 1, 30, false)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
                <button onClick={() => copyValue(cfg)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
              </div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={cfg}
              onChange={handleCfgChange}
              onFocus={() => setFocused('cfg')}
              onBlur={() => setFocused(null)}
              placeholder="e.g. 7"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
              style={{
                background: '#1a1813',
                border: focused === 'cfg' ? '1px solid #635c48' : '1px solid transparent',
                color: '#7aa0e8',
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Recommended steps (1–150)</p>
              <div className="flex gap-2">
                <button onClick={() => pasteNumber(setSteps, 'recommended_steps', 1, 150, true)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
                <button onClick={() => copyValue(steps)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
              </div>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={steps}
              onChange={handleStepsChange}
              onFocus={() => setFocused('steps')}
              onBlur={() => setFocused(null)}
              placeholder="e.g. 30"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
              style={{
                background: '#1a1813',
                border: focused === 'steps' ? '1px solid #635c48' : '1px solid transparent',
                color: '#7aa0e8',
              }}
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Notes</p>
            <textarea
              value={notes}
              onChange={handleNotesChange}
              onFocus={() => setFocused('notes')}
              onBlur={() => setFocused(null)}
              placeholder="Your notes on this checkpoint…"
              rows={5}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
              style={{
                background: '#1a1813',
                border: focused === 'notes' ? '1px solid #635c48' : '1px solid transparent',
                color: '#eae5dc',
              }}
            />
          </div>
        </div>
      </div>
```

Add the same `<style>` block before the usage gallery's closing `</div>`:

```jsx
      <style>{`
        @media (max-width: 900px) {
          .detail-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
```

- [ ] **Step 3: Verify the layout**

`npm run dev`. Open a LoRA detail page and a Checkpoint detail page.

Expected:
- Stats card at top, two-column body below (examples left ~60%, fields stack right), usage gallery at bottom.
- Both pages match the same proportions.
- Dragging the Electron window narrower than 900px causes the columns to stack vertically (single column).
- All field interactions from slices 1-2 still work.

Leave the server running.

---

## Task 13: Smart 1/2/3/4 grid patterns in `ExamplesGrid`

**Files:**
- Modify: `src/renderer/components/ExamplesGrid.jsx`

- [ ] **Step 1: Replace the grid block with the smart layout**

In `src/renderer/components/ExamplesGrid.jsx`, replace the existing uniform-grid `<div className="grid gap-3" ...>` block with the following count-based renderer. Keep everything else in the file (state, handlers, the `+ Add example` pill, the menus) unchanged. The full updated file:

```jsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import AddExampleMenu from './AddExampleMenu.jsx'
import GalleryPickerOverlay from './GalleryPickerOverlay.jsx'
import LightboxOverlay from './LightboxOverlay.jsx'

export default function ExamplesGrid({ images, entityKind, entityId, entityName, onChanged }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lightboxPath, setLightboxPath] = useState(null)
  const showToast = useToast()
  const max = 4
  const namespace = entityKind === 'lora' ? 'loras' : 'models'

  const addPaste = async () => {
    try {
      const items = await navigator.clipboard.read()
      let blob = null
      for (const item of items) {
        const pngType = item.types.find(t => t === 'image/png')
        if (pngType) { blob = await item.getType(pngType); break }
      }
      if (!blob) { showToast('No image in clipboard.'); return }
      const buf = new Uint8Array(await blob.arrayBuffer())
      await window.forge[namespace].addExampleImage({ source: 'paste', entityId, pngBuffer: buf })
      showToast('Pasted.')
      onChanged()
    } catch {
      showToast("Couldn't paste — clipboard access denied?")
    }
  }

  const addFile = async () => {
    const sourcePath = await window.forge[namespace].pickExampleImageFile()
    if (!sourcePath) return
    try {
      await window.forge[namespace].addExampleImage({ source: 'file', entityId, sourcePath })
      showToast('Added.')
      onChanged()
    } catch { showToast("Couldn't save image.") }
  }

  const addGallery = (iterationId) => {
    window.forge[namespace].addExampleImage({ source: 'gallery', entityId, iterationId }).then(() => {
      showToast('Added.')
      onChanged()
    })
  }

  const remove = async (exampleId, e) => {
    e.stopPropagation()
    await window.forge[namespace].removeExampleImage(exampleId)
    onChanged()
  }

  const renderTile = (img, extraStyle = {}) => (
    <motion.div
      key={img.id}
      className="relative rounded-lg overflow-hidden group cursor-pointer"
      style={{ background: '#0f0e0b', border: '1px solid #302c1e', ...extraStyle }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.16,1,0.3,1] } }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      onClick={() => setLightboxPath(img.image_path)}
    >
      <img src={`forge://thumb${img.image_path}`} alt="" className="w-full h-full object-cover" />
      <button
        onClick={(e) => remove(img.id, e)}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        style={{ background: 'rgba(15,14,11,0.85)', color: '#e87068', border: '1px solid #302c1e' }}
        title="Remove"
      >×</button>
    </motion.div>
  )

  const count = images.length

  return (
    <div className="relative">
      <AnimatePresence>
        {count === 1 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
            {renderTile(images[0], { aspectRatio: '16 / 10' })}
          </div>
        )}

        {count === 2 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {images.map(img => renderTile(img, { aspectRatio: '1' }))}
          </div>
        )}

        {count === 3 && (
          <div className="flex flex-col gap-3">
            {renderTile(images[0], { aspectRatio: '2 / 1' })}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {renderTile(images[1], { aspectRatio: '1' })}
              {renderTile(images[2], { aspectRatio: '1' })}
            </div>
          </div>
        )}

        {count === 4 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {images.map(img => renderTile(img, { aspectRatio: '1' }))}
          </div>
        )}
      </AnimatePresence>

      {count < max && (
        <div className="relative" style={{ marginTop: count === 0 ? 0 : 12 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-full py-4 rounded-lg text-sm transition-colors hover:border-[#635c48]"
            style={{
              background: 'transparent',
              border: '1px dashed #302c1e',
              color: '#635c48',
              minHeight: count === 0 ? 200 : 'auto',
            }}
          >
            + Add example{count === 0 ? ' — Paste · Choose file · Pick from gallery' : ''}
          </button>
          <AddExampleMenu
            isOpen={menuOpen}
            anchor="left"
            onClose={() => setMenuOpen(false)}
            onPaste={addPaste}
            onPickFile={addFile}
            onPickGallery={() => setPickerOpen(true)}
          />
        </div>
      )}

      <GalleryPickerOverlay
        isOpen={pickerOpen}
        entityKind={entityKind}
        entityId={entityId}
        entityName={entityName}
        onPick={addGallery}
        onClose={() => setPickerOpen(false)}
      />

      <LightboxOverlay
        isOpen={lightboxPath !== null}
        imagePath={lightboxPath}
        onClose={() => setLightboxPath(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Don't verify yet**

Verification waits until the next task creates `LightboxOverlay`. Move on.

---

## Task 14: `LightboxOverlay` + final verification

**Files:**
- Create: `src/renderer/components/LightboxOverlay.jsx`

- [ ] **Step 1: Create the lightbox component**

Create `src/renderer/components/LightboxOverlay.jsx`:

```jsx
import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { overlayBg, scaleIn } from '../lib/motion.js'

// Near-full-size image overlay. Click backdrop or press Esc to close.
//
// Props:
//   isOpen: boolean
//   imagePath: string | null   — absolute path; served via forge:///<path>
//   onClose: () => void
export default function LightboxOverlay({ isOpen, imagePath, onClose }) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && imagePath && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-8 cursor-zoom-out"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          variants={overlayBg} initial="hidden" animate="visible" exit="exit"
          onClick={onClose}
        >
          <motion.img
            src={`forge://${imagePath}`}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
            variants={scaleIn} initial="hidden" animate="visible"
            onClick={e => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

Note: the lightbox uses `forge://<absolute path>` (full resolution, served by `protocol.js`'s passthrough route), NOT `forge://thumb...` — the thumbnail route is for the grid tiles only.

- [ ] **Step 2: Manually verify the full slice 3 behaviour**

`npm run dev`. Open a LoRA detail page. Add and remove images one at a time, observing the grid morph:

Expected:
- **0 images**: large dashed empty-state pill spanning full width of the examples column.
- **1 image**: single tile, `aspect-ratio: 16/10` (wider than tall), filling the full column width. `+ Add example` pill below.
- **2 images**: two square tiles side-by-side. Add pill below.
- **3 images**: row 1 is a wide hero (`aspect-ratio: 2/1`); row 2 has two square tiles. Add pill below.
- **4 images**: 2×2 grid of squares. No add pill.
- Removing any image → grid smoothly morphs to the new count (Framer Motion AnimatePresence).
- Click any image tile → lightbox opens with the full-resolution image, centred, max 90vw × 90vh.
- Click the lightbox backdrop or press `Esc` → lightbox closes.
- Click the image inside the lightbox → does NOT close (event-stopped).
- Click `×` on a tile hover → does NOT open the lightbox (event-stopped).
- Repeat once on a Checkpoint detail page to confirm parity.

Stop the dev server.

---

## Task 15: Commit slice 3

- [ ] **Step 1: Commit the changes**

```bash
git -C /Users/ibraheemfiraz/Desktop/ForgeProject add \
  src/renderer/pages/LoRADetail.jsx \
  src/renderer/pages/ModelDetail.jsx \
  src/renderer/components/ExamplesGrid.jsx \
  src/renderer/components/LightboxOverlay.jsx
```

```bash
git -C /Users/ibraheemfiraz/Desktop/ForgeProject commit -m "$(cat <<'EOF'
feat(detail): two-column layout + smart examples grid + lightbox

Restructures LoRA and Checkpoint detail pages into the approved split:
examples on the left (~60%), trigger words / strength / notes (or CFG /
steps / notes) stacked on the right. Stacks to one column under 900px.

ExamplesGrid now adapts to image count: 1 = wide hero, 2 = pair, 3 = hero
plus pair, 4 = 2x2 (cap). Click any tile to open a near-full-size lightbox.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

After all three slices are committed, do a holistic walkthrough:

- [ ] Fresh `npm run dev`. Verify no console errors on either detail page.
- [ ] Database inspection: `sqlite3 ~/Library/Application\ Support/Forge/forge.db "PRAGMA user_version;"` → `4`.
- [ ] Filesystem inspection: `ls ~/Library/Application\ Support/Forge/example-images/` → contains `loras/` and `models/` subdirectories with managed image files for any pastes/file-picks you did.
- [ ] Git log: three commits on master matching the three slices, each with the `Co-Authored-By` trailer.
