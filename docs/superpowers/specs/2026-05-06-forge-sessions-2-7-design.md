# Forge — Sessions 2–7 Design Spec

**Date:** 2026-05-06  
**Scope:** Complete the Forge app from scaffold (Session 1 done) through packaging (Session 7)  
**Implementation order:** Vertical feature slices — each slice is fully usable when done  
**Polish pass:** Run `impeccable` skill at end of Session 7 for full UI enhancement

---

## What Forge Is

A personal macOS desktop app for logging, organising, and reviewing ComfyUI AI image generations. Think of it as a glorified database and dashboard — structured log entries with full metadata, personal notes, LoRA and checkpoint tracking, and a visual iteration journal. Forge never moves or copies files; it only reads paths.

---

## Core Concepts

### Main Gen
A named "project" — the top-level grouping unit. Equivalent to starting a new creative brief. Has a **hero image** (manually pinned from any of its iterations) or a **random hex colour** as a fallback thumbnail. Main Gens are renameable, pinnable to dashboard, and searchable.

### Iteration
A single image generation logged inside a Main Gen. Numbered sequentially (#1, #2, …). Has all ComfyUI metadata auto-extracted from the PNG, plus user notes, custom fields, and a star. Iterations are renameable and searchable.

### Inbox
New images detected in the ComfyUI output folder land here automatically. The user multi-selects and batch-assigns them to a new or existing Main Gen. No manual metadata entry needed — it's all extracted from the PNG.

---

## Implementation Slices (in order)

1. **Schema + Inbox + Auto-scan** — new DB, file watcher, detect images, batch assign UI
2. **Main Gens** — browse, create, rename, pin, hero image, hex fallback
3. **Iteration View** — gallery S/M/L, metadata panel, notes, custom fields, compare mode
4. **LoRA & Checkpoint Pages** — auto-scan folders, detail pages with notes + usage gallery
5. **Dashboard** — stats, pinned Main Gens, pinned iterations, recents
6. **Search & Tags** — ⌘K overlay, filter chips, tag system
7. **Polish + Packaging** — `impeccable` UI pass, app icon, onboarding, .dmg build

---

## Database Schema

### New / Replaced Tables

```sql
-- Replaces the old `generations` table
CREATE TABLE main_gens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  hero_image_path TEXT,           -- manually pinned iteration image path
  hero_color TEXT,                -- hex fallback e.g. '#7c3f5e'
  pinned INTEGER DEFAULT 0,
  notes TEXT,
  tags TEXT,                      -- comma-separated
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Children of main_gens
CREATE TABLE iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  main_gen_id INTEGER NOT NULL REFERENCES main_gens(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,
  title TEXT,                     -- optional rename, defaults to "Iteration #N"
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
  starred_at TEXT,                -- set when starred, null when unstarred
  notes TEXT,
  tags TEXT,                      -- comma-separated
  created_at TEXT DEFAULT (datetime('now'))
);

-- Replaces generation_loras
CREATE TABLE iteration_loras (
  iteration_id INTEGER REFERENCES iterations(id) ON DELETE CASCADE,
  lora_id INTEGER REFERENCES loras(id),
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (iteration_id, lora_id)
);

-- Per-iteration custom key-value fields
CREATE TABLE iteration_custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iteration_id INTEGER NOT NULL REFERENCES iterations(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT
);

-- Globally pinned field keys (appear as pre-filled on all new iterations)
CREATE TABLE global_field_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Unassigned images detected from output folder
CREATE TABLE inbox_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL UNIQUE,
  extracted_metadata TEXT,        -- JSON blob: prompt, seed, steps, cfg, sampler, scheduler, loras, checkpoint filename
  detected_at TEXT DEFAULT (datetime('now'))
);
```

### Modified Tables

```sql
-- Add status column to models and loras
ALTER TABLE models ADD COLUMN status TEXT DEFAULT 'online'; -- 'online' | 'offline'
ALTER TABLE loras  ADD COLUMN status TEXT DEFAULT 'online';
```

### Unchanged Tables
`extras`, `settings` — no changes needed.

---

## Slice 1 — Schema + Inbox + Auto-scan

### Auto-scan (main process)
- **Library:** `chokidar` watches the `output_folder` path from settings
- On new `.png` detected: read embedded ComfyUI workflow JSON from PNG `tEXt` chunk (`workflow` or `prompt` key)
- Parse and extract: prompt, negative_prompt, seed, steps, cfg, sampler, scheduler, checkpoint filename, LoRA filenames + weights
- Insert into `inbox_items` with extracted metadata as JSON
- Send IPC event `inbox:new-item` to renderer → sidebar badge increments

### Inbox UI
- Sidebar icon: `📥 Inbox` with red badge showing unassigned count
- Grid layout: images shown as thumbnails with seed + steps overlay at the bottom
- Checkbox on each thumbnail — click thumbnail to toggle select
- **Select All** button top-right
- **Assign Selected (N)** button activates once ≥1 selected
- Assign panel slides up when items are selected:
  - **"+ New Main Gen"** button → prompts for title → assigns all selected as iterations #1, #2, … in order
  - Existing Main Gens listed as chips (name + iteration count) → click to assign as next iterations
- After assignment, items removed from inbox, badge decrements

### IPC Handlers — Inbox
- `inbox:list` → all unassigned inbox_items
- `inbox:assign` → `{ itemIds, mainGenId }` or `{ itemIds, newTitle }` → creates iterations in existing or new Main Gen, removes from inbox
- `inbox:dismiss` → remove without assigning

---

## Slice 2 — Main Gens

### Main Gens List Page
- Top bar: title "Main Gens", search input (filters by title), `+ New` button
- **Pinned section** shown first if any exist (pinned = 1)
- **All section** below — grid of cards, 3–4 columns
- Each card: hero image or solid hex colour as thumbnail, title, iteration count, last-edited time
- Right-click or hover menu: Rename, Pin/Unpin, Set Hero Image, Delete
- Dashed empty card at end: `+ New Main Gen`
- `+ New` button → modal: enter title → creates main_gen, navigates into it

### Main Gen Detail Page
- Header: hero thumbnail/color swatch, title (click to rename inline), pin toggle, iteration count
- Gallery of iterations (see Slice 3)
- `+ Add iteration` button → opens file picker (for manual add outside inbox flow)

### IPC Handlers — Main Gens
- `main-gens:list`
- `main-gens:get` → single with iteration count
- `main-gens:create` → `{ title }`
- `main-gens:update` → `{ id, title?, hero_image_path?, hero_color?, pinned?, notes?, tags? }`
- `main-gens:delete` → cascades to iterations
- `main-gens:set-hero` → `{ id, iterationId }` → copies image_path to hero_image_path

---

## Slice 3 — Iteration View

### Gallery
- **Size toggle:** S (6 cols) / M (4 cols) / L (2 cols) — persisted to settings
- Each thumbnail shows: iteration number badge top-left, star top-right (click to toggle), image
- Click thumbnail → opens metadata panel (side panel, doesn't navigate away)
- **Compare button** in header → activates compare mode: thumbnails get checkboxes, select exactly 2 → compare overlay

### Metadata Panel (right side)
Sections in order:
1. **Header:** "Iteration #N" title (click to rename), star toggle, created date
2. **Extracted** — read-only block: seed, steps, CFG, sampler, scheduler, size, checkpoint (clickable → goes to checkpoint detail)
3. **LoRAs** — each as `name (weight)`, name is clickable → LoRA detail page
4. **Prompt** — expandable text block
5. **Negative Prompt** — expandable text block (collapsed by default)
6. **Notes** — editable textarea, auto-saved on blur
7. **Custom Fields** — list of key/value pairs; each row has:
   - Editable key and value inputs
   - Pin icon: filled = globally pinned, outline = local only; click to toggle
   - Delete row button
   - `+ Add field` link at bottom
   - Globally pinned fields (from `global_field_templates`) auto-appear on every new iteration pre-filled empty
8. **Tags** — tag chips, click to add/remove

### Compare Mode
- Overlay (full-screen modal, dark bg)
- Two columns side by side: image + metadata each
- Metadata rows aligned: identical values in white, differing values highlighted red with ↑↓ arrows
- Fields compared: seed, steps, CFG, sampler, LoRAs + weights, checkpoint, custom fields
- Close button top-right, ESC to dismiss

### IPC Handlers — Iterations
- `iterations:list` → `{ mainGenId }` → ordered by iteration_number
- `iterations:get` → single with loras + custom fields
- `iterations:create` → `{ mainGenId, imagePath, extractedMetadata? }`
- `iterations:update` → `{ id, title?, starred?, notes?, tags? }`
- `iterations:delete`
- `iterations:set-loras` → `{ id, loras: [{loraId, weight}] }`
- `iterations:set-custom-fields` → `{ id, fields: [{key, value}] }`
- `global-fields:list`
- `global-fields:pin` → `{ key }`
- `global-fields:unpin` → `{ key }`

---

## Slice 4 — LoRA & Checkpoint Pages

### Folder Auto-scan
- Settings already stores `loras_folder` and `checkpoints_folder`
- On app start and on folder-set: scan folder for `.safetensors`, `.ckpt`, `.pt` files
- For each file: upsert by **filename without extension** as stable key
  - New file → insert record (name = filename, file_path = full path, status = 'online')
  - Existing record + file found → update file_path, set status = 'online'
  - Existing record + file not found → set status = 'offline' (record kept permanently)
- Runs on: app start, settings folder change, manual "Rescan" button

### LoRAs List Page
- List view (not grid): name, usage count badge, default weight, offline indicator if status = 'offline'
- Search input filters by name
- `+ Add LoRA` button → manual entry (name + optional file path) for edge cases
- Click row → LoRA detail page

### LoRA Detail Page
- **Stats header:** name, file path, status badge (offline = greyed out warning), stats row: iterations used, default weight, average weight used, Main Gens count
- **Notes** — editable textarea, auto-saved
- **Usage gallery** — grid of iteration thumbnails that used this LoRA
  - Weight label overlaid on each thumbnail
  - Filter bar: weight range slider, checkpoint filter dropdown
  - Click thumbnail → navigates to that iteration inside its Main Gen

### Checkpoint Detail Page
- Identical structure to LoRA detail but no weight stats (checkpoints don't have a weight)
- Usage gallery shows all iterations that used this checkpoint

### IPC Handlers — Models & LoRAs
- `models:scan` → rescans checkpoints_folder, upserts
- `models:list`
- `models:get` → with usage count
- `models:update` → `{ id, notes? }`
- `loras:scan` → rescans loras_folder, upserts
- `loras:list`
- `loras:get` → with usage gallery data
- `loras:update` → `{ id, notes?, default_weight? }`
- `loras:usage` → `{ loraId, filters? }` → iterations list

---

## Slice 5 — Dashboard

Layout (top to bottom):

### Stats Row
Five stat cards in a row: Main Gens, Iterations, LoRAs, Checkpoints, Starred

### Insights Row (two columns)
- **Most Used LoRAs** — horizontal bar chart, top 5, click → LoRA detail
- **Most Used Checkpoints** — horizontal bar chart, top 5, click → Checkpoint detail

### Pinned Main Gens
Horizontal scroll strip of Main Gen cards (hero image / hex colour, title, iteration count). Only shown if any are pinned.

### Starred Iterations
Horizontal scroll strip of starred iteration thumbnails with "MainGen #N" label. Only shown if any are starred.

### Recent Main Gens
Activity list: thumbnail + name + last action description + time ago. Click → navigates to Main Gen.

### IPC Handlers — Dashboard
- `dashboard:stats` → `{ mainGensCount, iterationsCount, lorasCount, checkpointsCount, starredCount }`
- `dashboard:top-loras` → top 5 by iteration usage count
- `dashboard:top-checkpoints` → top 5 by iteration usage count
- `dashboard:pinned-main-gens`
- `dashboard:starred-iterations` → starred iterations ordered by starred_at DESC, limit 10
- `dashboard:recent-main-gens` → last 5 by updated_at

---

## Slice 6 — Search & Tags

### Global Search (⌘K)
- Keyboard shortcut `Cmd+K` from anywhere in the app opens overlay
- Full-screen dark overlay, ESC or click outside to dismiss
- Search input auto-focused

**Filter chips:**
- Type: All / Main Gens / Iterations / LoRAs / Checkpoints
- Starred only toggle
- Has tags toggle

**Search targets:**
- Main Gens: title, notes, tags
- Iterations: title, prompt, negative_prompt, notes, tags, seed (exact)
- LoRAs: name, notes
- Checkpoints: name, notes

**Results:**
- Grouped by type with section headers
- Match term highlighted inline
- Each result shows: thumbnail (iterations/main gens), name, subtitle (relevant metadata snippet)
- Keyboard navigation: ↑↓ to move, ↵ to open, ESC to close
- Click result → navigates directly to that item

### Tags
- Tags stored as comma-separated text on main_gens and iterations
- Rendered as chip pills in the UI (edit inline, type and press Enter to add, click × to remove)
- Tags are free-form strings, no global tag registry needed
- Search `#tagname` in ⌘K to filter by specific tag

### IPC Handlers — Search
- `search:query` → `{ query, filters: { types[], starred, hasTags } }` → grouped results

---

## Slice 7 — Polish, Packaging & Impeccable Pass

### UI Polish Pass
- Invoke `impeccable` skill for a full UI enhancement sweep across all screens
- Focus areas: spacing consistency, typography, micro-interactions, empty states, loading states, error states

### Empty States
Every screen needs a thoughtful empty state:
- Inbox (empty): "No new images detected. ComfyUI output folder is being watched."
- Main Gens (empty): "Start your first Main Gen by dropping images into the Inbox."
- LoRAs / Checkpoints (empty): "Set your LoRAs folder in Settings to auto-import."

### Onboarding
- First-launch flow: 3-step modal
  1. Welcome — what Forge does
  2. Set output folder (required), checkpoints folder (optional), LoRAs folder (optional)
  3. Done — takes user to Inbox or Dashboard

### App Icon
- Design and export icon set (.icns) for macOS

### Packaging
- `electron-builder` .dmg for macOS
- Sign and notarize if Apple Developer account available
- Test on both Intel and Apple Silicon

---

## Key UI Patterns (shared across all screens)

### Gallery Grid
- Reused in: Main Gen iteration view, LoRA usage gallery, Checkpoint usage gallery
- S/M/L size toggle stored in settings per-context
- Hover shows action icons (star, open, etc.)

### Metadata Panel
- Slides in from right, doesn't navigate away
- All text fields auto-save on blur (no explicit save button)

### Toast Notifications
- Bottom-centre, 2 second auto-dismiss
- Used for: saved, assigned, folder set, scan complete, etc.

### Offline Badge
- Small grey pill "Offline" shown on LoRA/Checkpoint cards and detail pages when status = 'offline'
- Tooltip: "File not found at last known path. Reconnect your drive or update the folder in Settings."

### Confirm Dialogs
- Destructive actions (delete Main Gen, delete iteration) require a confirm dialog
- Text: "Delete [Name]? This cannot be undone." with Cancel / Delete buttons

---

## Settings Page (additions to existing)

Current settings page has folder pickers for output_folder, checkpoints_folder, loras_folder. Add:

- **Rescan LoRAs** button → triggers `loras:scan`
- **Rescan Checkpoints** button → triggers `models:scan`
- **Gallery default size** selector: S / M / L
- **Auto-scan** toggle: enable/disable the output folder file watcher

---

## Navigation (final sidebar)

```
Forge
Generation Manager
─────────────────
🏠  Dashboard
📥  Inbox          [badge]
🗂  Main Gens
🎛  LoRAs
🧱  Checkpoints
📝  Extras
─────────────────
⚙️  Settings
```

⌘K global search accessible from anywhere.

---

## Tech Notes

- **File watcher:** `chokidar` (already common in Electron apps, handles macOS FSEvents)
- **PNG metadata extraction:** Read `tEXt` PNG chunk with key `workflow` or `prompt` — ComfyUI embeds full workflow JSON here. Use `pngjs` or `sharp` for chunk reading.
- **Hex colour generation:** On Main Gen create, generate a random pleasant hex using HSL with fixed saturation/lightness range so colours are always dark-mode friendly.
- **Auto-save:** Debounce 500ms on all textarea/input fields in metadata panels.
- **IPC pattern:** Follow existing `settings:*` handler pattern — one file per domain in `src/main/ipc/`.
- **Renderer state:** Use React context or simple prop drilling — no Redux/Zustand needed at this scale.
