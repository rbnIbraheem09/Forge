# Prompt Builder — Plan 1: Model Family Classification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `family` field to checkpoint records so each checkpoint can be classified by its prompt-style family (Pony XL, Illustrious / NoobAI, Animagine XL, SDXL Realistic, SDXL Anime, SD 1.5 Anime, SD 1.5 Realistic, Other). This is the prerequisite that lets later plans tailor AI-generated prompts to the active checkpoint.

**Architecture:** Schema migration adds a nullable `family TEXT` column to `models`. The IPC `models:update` handler accepts the new field with enum validation. The `ModelDetail.jsx` page gets a dropdown that saves on change (matching the existing debounced-save pattern). The `ModelsList.jsx` page shows a small badge for classified models and a yellow "?" badge for unclassified ones.

**Tech Stack:** SQLite (better-sqlite3), Electron IPC, React, Tailwind, Forge's existing IPC/migration patterns.

**Reference spec:** [docs/superpowers/specs/2026-05-13-prompt-builder-design.md](../specs/2026-05-13-prompt-builder-design.md)

---

## File Structure

**Files to modify:**
- `src/main/db/schema.sql` — add `family TEXT` column to the `CREATE TABLE models` statement so fresh installs include it.
- `src/main/db/database.js` — add a `if (version < 5)` migration block that ALTERs existing DBs; bump `user_version = 5`.
- `src/main/ipc/models.js` — accept `family` in the `models:update` handler with enum validation against the family list.
- `src/renderer/pages/ModelDetail.jsx` — add a "Model family" labeled dropdown in the right column alongside CFG/Steps; save on change via the existing `queueSave` pattern.
- `src/renderer/pages/ModelsList.jsx` — add a family badge (or yellow "?" for unclassified) on each row.
- `CLAUDE.md` — document the family enum values and the migration step.

**Files to create:**
- `src/renderer/lib/model-families.js` — single source of truth for the family enum: stored value, display label, accent color. Imported by both list and detail pages and by the future prompt-builder pane.

---

## Task 1: Define the model-family enum module

**Files:**
- Create: `src/renderer/lib/model-families.js`

This module is the source of truth for family values. Both `ModelDetail.jsx` and `ModelsList.jsx` import from here. The IPC handler in the main process has its own copy (we don't share modules across the process boundary in Forge — see preload.js comment in CLAUDE.md), but the strings must stay in sync.

- [ ] **Step 1: Create the module**

```javascript
// src/renderer/lib/model-families.js
//
// Source of truth for checkpoint model families used by the Prompt Builder
// to tailor AI-generated prompts. Stored values are snake_case strings;
// keep these in sync with src/main/ipc/models.js MODEL_FAMILIES.

export const MODEL_FAMILIES = [
  { value: 'pony_xl',        label: 'Pony Diffusion XL' },
  { value: 'illustrious',    label: 'Illustrious / NoobAI' },
  { value: 'animagine_xl',   label: 'Animagine XL' },
  { value: 'sdxl_realistic', label: 'SDXL — Realistic' },
  { value: 'sdxl_anime',     label: 'SDXL — Anime / Generic' },
  { value: 'sd15_anime',     label: 'SD 1.5 — Anime' },
  { value: 'sd15_realistic', label: 'SD 1.5 — Realistic' },
  { value: 'other',          label: 'Other / Generic' },
]

export const MODEL_FAMILY_VALUES = MODEL_FAMILIES.map(f => f.value)

export function familyLabel(value) {
  if (!value) return 'Unclassified'
  const found = MODEL_FAMILIES.find(f => f.value === value)
  return found ? found.label : value
}
```

- [ ] **Step 2: Verify the file is syntactically valid by importing it**

Run: `node -e "import('./src/renderer/lib/model-families.js').then(m => console.log(m.MODEL_FAMILY_VALUES))"`
Expected output:

```
[
  'pony_xl', 'illustrious', 'animagine_xl', 'sdxl_realistic',
  'sdxl_anime', 'sd15_anime', 'sd15_realistic', 'other'
]
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/model-families.js
git commit -m "feat(prompt): add model-family enum module"
```

---

## Task 2: Schema migration — add `family` column

**Files:**
- Modify: `src/main/db/schema.sql`
- Modify: `src/main/db/database.js`

The migration follows Forge's idempotent pattern from `user_version 4`:
- Add the column to the `CREATE TABLE models` block in `schema.sql` (no-op for existing DBs because `CREATE TABLE IF NOT EXISTS` doesn't re-create).
- Add an `ALTER TABLE` wrapped in try/catch in `database.js` for existing installs.
- Bump `user_version` to 5.

- [ ] **Step 1: Update `schema.sql` — add `family` column to models table**

Open `src/main/db/schema.sql` (lines 1–11 currently define the `models` table). Replace the `CREATE TABLE models` block with the version including `family`:

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
  family TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Update `database.js` — add the version-5 migration block**

Open `src/main/db/database.js`. Find the existing `if (version < 4) { ... }` block (lines ~47–53). After it, before `db.pragma('user_version = 4')`, insert:

```javascript
  if (version < 5) {
    try { db.exec('ALTER TABLE models ADD COLUMN family TEXT') } catch {}
  }
```

Then change the final pragma line from `db.pragma('user_version = 4')` to `db.pragma('user_version = 5')`.

The final relevant section should read:

```javascript
  if (version < 4) {
    try { db.exec('ALTER TABLE loras  ADD COLUMN trigger_words TEXT') } catch {}
    try { db.exec('ALTER TABLE loras  ADD COLUMN recommended_strength REAL') } catch {}
    try { db.exec('ALTER TABLE models ADD COLUMN recommended_cfg REAL') } catch {}
    try { db.exec('ALTER TABLE models ADD COLUMN recommended_steps INTEGER') } catch {}
  }

  if (version < 5) {
    try { db.exec('ALTER TABLE models ADD COLUMN family TEXT') } catch {}
  }

  db.pragma('user_version = 5')
```

- [ ] **Step 3: Verify the migration runs cleanly**

Run the app once to trigger migration:

```bash
npm run dev
```

Wait for the Electron window to open. Then in a separate terminal, inspect the database:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "PRAGMA user_version; PRAGMA table_info(models);"
```

Expected output:
- `user_version` line shows `5`.
- `table_info(models)` includes a row for `family` with type `TEXT` and `notnull = 0`.

Stop the dev server (Ctrl+C) before proceeding.

- [ ] **Step 4: Verify NULL is the default for existing rows**

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT name, family FROM models LIMIT 5;"
```

Expected: each row shows `name | <empty>` (the empty value after the pipe is NULL).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.sql src/main/db/database.js
git commit -m "feat(db): add models.family column (user_version 5)"
```

---

## Task 3: IPC `models:update` accepts `family` with validation

**Files:**
- Modify: `src/main/ipc/models.js`

The handler validates `family` against the enum. Invalid values (anything not in the enum and not null) are rejected silently (no update). `null` and `undefined` are accepted — `null` clears the classification, `undefined` means the field wasn't sent.

- [ ] **Step 1: Add `MODEL_FAMILIES` constant at the top of the file**

Open `src/main/ipc/models.js`. After the existing `require(...)` lines (around line 5), add:

```javascript
// Must match src/renderer/lib/model-families.js MODEL_FAMILIES.
const MODEL_FAMILY_VALUES = new Set([
  'pony_xl', 'illustrious', 'animagine_xl',
  'sdxl_realistic', 'sdxl_anime',
  'sd15_anime', 'sd15_realistic',
  'other',
])
```

- [ ] **Step 2: Extend the `models:update` handler signature and validation**

Find `ipcMain.handle('models:update', ...)` (lines ~45–61). Replace it with:

```javascript
  ipcMain.handle('models:update', (_e, { id, notes, recommended_cfg, recommended_steps, family }) => {
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
    if (family !== undefined) {
      // null clears the classification; any string must be in the enum.
      if (family !== null && !MODEL_FAMILY_VALUES.has(family)) {
        return false  // reject invalid enum value silently
      }
      fields.push('family = ?'); values.push(family)
    }
    if (fields.length === 0) return true
    db.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    return true
  })
```

- [ ] **Step 3: Verify the IPC update accepts a valid family**

Start the dev server: `npm run dev`. Open DevTools in the Electron window (View → Toggle Developer Tools, or ⌘⌥I). In the renderer console, run:

```javascript
const models = await window.forge.models.list()
console.log(models[0])
await window.forge.models.update({ id: models[0].id, family: 'illustrious' })
const updated = await window.forge.models.get(models[0].id)
console.log('family is now:', updated.family)
```

Expected console output:
- The first `console.log` shows the existing model row.
- Last line prints `family is now: illustrious`.

- [ ] **Step 4: Verify the IPC rejects an invalid family**

In the same renderer console:

```javascript
const result = await window.forge.models.update({ id: models[0].id, family: 'bogus_family' })
console.log('rejected?', result === false)
const stillTheSame = await window.forge.models.get(models[0].id)
console.log('family unchanged:', stillTheSame.family)
```

Expected:
- `rejected? true`
- `family unchanged: illustrious`

Stop the dev server before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/models.js
git commit -m "feat(ipc): accept family field in models:update with enum validation"
```

---

## Task 4: Family dropdown on `ModelDetail.jsx`

**Files:**
- Modify: `src/renderer/pages/ModelDetail.jsx`

Add a labeled `<select>` styled to match the existing CFG / Steps inputs. Place it as the first item in the right column (above CFG). Save on change via the existing `queueSave` pattern but with zero debounce (dropdown changes are deliberate single events, not key-by-key like the text inputs).

- [ ] **Step 1: Import the family enum**

Open `src/renderer/pages/ModelDetail.jsx`. After the existing imports (lines 1–6), add:

```javascript
import { MODEL_FAMILIES } from '../lib/model-families.js'
```

- [ ] **Step 2: Add `family` state and wire it to load**

Find the state declarations (lines 13–17). After `const [steps, setSteps] = useState('')`, add:

```javascript
  const [family, setFamily] = useState('')
```

Then find the `load` callback (lines 22–32). Add inside it, after `setSteps(...)`:

```javascript
    setFamily(m.family || '')
```

The full load function should now be:

```javascript
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
    setFamily(m.family || '')
  }, [modelId])
```

- [ ] **Step 3: Add an immediate-save handler for the dropdown**

Find the `queueSave` function (lines 36–46). It debounces by 500 ms — for a `<select>` we want immediate save. Below `queueSave`, add:

```javascript
  const handleFamilyChange = async (e) => {
    const value = e.target.value
    setFamily(value)
    await window.forge.models.update({
      id: modelId,
      family: value === '' ? null : value,
    })
    showToast('Saved.')
  }
```

- [ ] **Step 4: Insert the dropdown in the right column above CFG**

Find the right column `<div className="flex flex-col gap-5">` (line ~122). Insert as the FIRST child (before the CFG block):

```jsx
          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Model family</p>
            <div className="relative">
              <select
                value={family}
                onChange={handleFamilyChange}
                onFocus={() => setFocused('family')}
                onBlur={() => setFocused(null)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors appearance-none cursor-pointer"
                style={{
                  background: '#1a1813',
                  border: focused === 'family' ? '1px solid #635c48' : '1px solid transparent',
                  color: family ? '#eae5dc' : '#635c48',
                  fontFamily: 'Figtree, sans-serif',
                }}
              >
                <option value="" style={{ background: '#1a1813', color: '#635c48' }}>Not classified — pick one</option>
                {MODEL_FAMILIES.map(f => (
                  <option key={f.value} value={f.value} style={{ background: '#1a1813', color: '#eae5dc' }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-xs"
                style={{ color: '#635c48' }}
              >
                ▾
              </span>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: '#635c48' }}>
              Used by the Prompt Builder to pick the right quality / negative tags for this checkpoint.
            </p>
          </div>
```

- [ ] **Step 5: Verify the dropdown works in the UI**

Start the dev server: `npm run dev`. Navigate to any checkpoint detail page (`/models/:id`). Confirm:
- A "Model family" dropdown appears at the top of the right column.
- Default value reads "Not classified — pick one" (in dim text).
- Selecting "Illustrious / NoobAI" triggers a "Saved." toast.
- The selected value persists across page navigations: leave the page, come back, the same value is shown.
- Selecting "Not classified — pick one" again clears the classification (verify in SQLite: family becomes NULL).

Verify in SQL:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT id, name, family FROM models WHERE family IS NOT NULL;"
```

Expected: shows your classified checkpoint with its `family` value.

Stop the dev server before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/ModelDetail.jsx
git commit -m "feat(checkpoint): add model family dropdown on detail page"
```

---

## Task 5: Family badge / "needs classification" indicator on `ModelsList.jsx`

**Files:**
- Modify: `src/renderer/pages/ModelsList.jsx`

Each row gets a small pill:
- If `family` is set: a soft sage-green pill with the family label.
- If `family` is NULL: a small yellow `?` pill to flag "needs classification" at a glance.

- [ ] **Step 1: Import the family helper**

Open `src/renderer/pages/ModelsList.jsx`. After the existing imports (lines 1–4), add:

```javascript
import { familyLabel } from '../lib/model-families.js'
```

- [ ] **Step 2: Render the badge inside each row**

Find the row content (lines ~133–143). Inside the `<div className="flex-1">` that contains the name + offline badge, AFTER the offline-badge span, insert a new sibling line for the family badge. Replace the entire `<div className="flex-1">` block with:

```jsx
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: '#eae5dc' }}>{m.name}</span>
                    {m.status === 'offline' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#242118', color: '#635c48' }}>Offline</span>
                    )}
                    {m.family ? (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(125, 170, 136, 0.14)', color: '#7daa88' }}
                        title="Model family"
                      >
                        {familyLabel(m.family)}
                      </span>
                    ) : (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'rgba(232, 200, 32, 0.14)', color: '#e8c820' }}
                        title="Needs classification — set a model family on the detail page"
                      >
                        ?
                      </span>
                    )}
                  </div>
                </div>
```

- [ ] **Step 3: Verify the badges render**

Start the dev server: `npm run dev`. Open `/models` (the checkpoints list).

Expected:
- The checkpoint you classified in Task 4 shows a sage-green badge with the family label (e.g. "Illustrious / NoobAI").
- All other (unclassified) checkpoints show a yellow `?` badge.
- Hovering the `?` shows the tooltip "Needs classification — set a model family on the detail page".

Stop the dev server before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/ModelsList.jsx
git commit -m "feat(checkpoints): family badge on list rows (yellow ? when unclassified)"
```

---

## Task 6: Update `CLAUDE.md` to document the family enum

**Files:**
- Modify: `CLAUDE.md`

The model-family enum should appear in CLAUDE.md so future contributors / future Claude sessions know about it without reading the spec.

- [ ] **Step 1: Find the architecture section and add a "Model families" subsection**

Open `CLAUDE.md`. Locate the section under `### Main process` that describes `db/schema.sql`. After the paragraph about schema versioning (around the line ending "current version: 3"), update the version reference:

Replace:

```markdown
- `db/database.js` — singleton `better-sqlite3` connection at `userData/forge.db` with `journal_mode=WAL`, `foreign_keys=ON`. Schema versioning uses `PRAGMA user_version`; bumping the version requires both updating `schema.sql` and adding an `ALTER`/backfill block before the new `user_version` is set (current version: 3).
```

With:

```markdown
- `db/database.js` — singleton `better-sqlite3` connection at `userData/forge.db` with `journal_mode=WAL`, `foreign_keys=ON`. Schema versioning uses `PRAGMA user_version`; bumping the version requires both updating `schema.sql` and adding an `ALTER`/backfill block before the new `user_version` is set (current version: 5).
```

- [ ] **Step 2: Add a "Model families" line under the schema description**

In the same paragraph that lists the core tables, replace:

```markdown
- `db/schema.sql` — full DDL (idempotent `CREATE TABLE IF NOT EXISTS`). Core tables: `main_gens`, `iterations`, `iteration_loras`, `iteration_custom_fields`, `loras`, `models` (checkpoints), `inbox_items`, `global_field_templates`, `settings`.
```

With:

```markdown
- `db/schema.sql` — full DDL (idempotent `CREATE TABLE IF NOT EXISTS`). Core tables: `main_gens`, `iterations`, `iteration_loras`, `iteration_custom_fields`, `loras`, `models` (checkpoints), `inbox_items`, `global_field_templates`, `settings`. `models.family` is a nullable enum classifying each checkpoint by prompt-style family: `pony_xl`, `illustrious`, `animagine_xl`, `sdxl_realistic`, `sdxl_anime`, `sd15_anime`, `sd15_realistic`, `other`. The enum is mirrored in `src/renderer/lib/model-families.js` and `src/main/ipc/models.js` — keep them in sync.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document models.family enum and bump schema version note to 5"
```

---

## Task 7: End-to-end verification

**Files:** (none — verification only)

Sanity-check the whole flow once before declaring Plan 1 done.

- [ ] **Step 1: Fresh boot, classify a model, restart, verify persistence**

```bash
npm run dev
```

Steps:
1. Open `/models` — verify all rows render with either a sage-green family badge or a yellow `?`.
2. Click into an unclassified model.
3. Set its family from the dropdown.
4. Observe the "Saved." toast.
5. Close the Electron app (⌘Q).
6. Re-run `npm run dev`.
7. Open `/models` — verify the model you classified now has its sage-green badge.
8. Click into it — verify the dropdown shows the value you set.

- [ ] **Step 2: Inspect the DB once more to confirm the value persisted**

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT id, name, family FROM models WHERE family IS NOT NULL ORDER BY id;"
```

Expected: at least one row with `family` set to a valid enum value.

- [ ] **Step 3: Try every family value in the dropdown**

For one test model, cycle through each option in the dropdown. After each selection:
- Verify the "Saved." toast appears.
- Verify the badge on `/models` updates accordingly.
- Verify the SQL value matches.

This is the easiest way to confirm nothing in the enum is misspelled.

- [ ] **Step 4: Final commit (if any small fixes were needed during verification)**

If the verification surfaced any tiny issues, fix them and commit. Otherwise this step is a no-op.

```bash
git status  # should be clean
```

---

## Self-Review checklist

Before considering Plan 1 done:

- **Spec coverage:** The spec's "Schema migration" section requires the `models.family` column — Task 2 implements it. The spec's "Model family enum" section enumerates 8 family values — Task 1 and Task 3 mirror them. The spec mentions "Checkpoint detail page gets a dropdown" — Task 4 implements it. The spec mentions surfacing unclassified state — Task 5's yellow `?` badge satisfies it.
- **Placeholder scan:** No "TBD" / "TODO" / "implement later" remains in the plan; every step has the exact code or command.
- **Type consistency:** `MODEL_FAMILIES` array is defined identically in `src/renderer/lib/model-families.js` (Task 1) and as a `Set` of the same string values in `src/main/ipc/models.js` (Task 3). Both must stay in sync — CLAUDE.md (Task 6) explicitly says so.

## Out-of-scope for Plan 1

The following intentionally wait for later plans:

- The Prompt Builder pane itself (Plan 4) — it will read `models.family` but doesn't need to be built yet.
- The Danbooru tag library, embedder, and AI integration (Plans 2 + 3).
- Any auto-detection of family from filename — the spec explicitly rules this out per user direction.
- Pre-populating `family` for existing checkpoints based on naming heuristics — user wants manual classification only.
