# LoRA & Checkpoint Detail — Extra Fields & Example Images

**Status:** Design
**Date:** 2026-05-13

## Summary

Extend the LoRA detail (`/loras/:id`) and Checkpoint detail (`/models/:id`) pages so each model entry can carry user-curated metadata beyond a freeform notes box. Adds typed fields (trigger words, recommended strength / CFG / steps) and up to four user-provided example images per entry, sourced from clipboard paste, filesystem, or the user's existing gallery.

Goal: make these pages a useful personal reference for each model — the kind of thing you copy-paste together from wherever you originally found the model.

## Goals & non-goals

**Goals**
- Add typed, copy/paste-friendly fields to LoRA and Checkpoint detail pages.
- Let users attach example images by paste, file picker, or pick-from-gallery.
- Keep the existing Notes textarea + stats header + usage gallery intact.
- Preserve existing IPC contract style (channels, dynamic `update`).
- Idempotent schema migration with `PRAGMA user_version` bump.

**Non-goals**
- Drag-to-reorder example images (DB column reserved; UI deferred).
- More than four example images per entry.
- Editing trigger words / numerics on the list pages (`LoRAsList`, `ModelsList`) — detail only.
- Exposing the new fields to PNG-metadata extraction or auto-population.

## User stories

- *As a user*, when I find a LoRA online, I copy its trigger words and recommended strength from the source page. On the LoRA detail page I click `📋 Paste` next to each field and the value lands without me retyping.
- *As a user*, I take a screenshot of an example output the LoRA author posted. On the detail page I click `+ add → Paste screenshot` and the screenshot becomes an example tile.
- *As a user*, I want my detail page to show off what *my* iterations of this LoRA look like — when I click `+ add → Pick from gallery`, the picker defaults to iterations that already use this LoRA.
- *As a user*, I want to click a small thumbnail and see it near-full-size to actually appreciate it.

## Data model

### Schema migration (user_version 3 → 4)

```sql
-- Idempotent ALTERs run inside `if (version < 4)` block in database.js
ALTER TABLE loras  ADD COLUMN trigger_words TEXT;
ALTER TABLE loras  ADD COLUMN recommended_strength REAL;
ALTER TABLE models ADD COLUMN recommended_cfg REAL;
ALTER TABLE models ADD COLUMN recommended_steps INTEGER;

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

The two `ALTER`s are wrapped in `try/catch` (same idempotency pattern already used for `inbox_items.file_mtime` in `database.js`). The two `CREATE TABLE IF NOT EXISTS` statements live in `schema.sql` alongside the existing tables and run on every boot — safe.

After applying: `db.pragma('user_version = 4')`.

### Validation rules (enforced in IPC handlers, not DB)

| Field | Type | Range / format |
|---|---|---|
| `trigger_words` | text | unrestricted, up to ~4KB |
| `recommended_strength` | real | clamp 0.0 ≤ x ≤ 2.0 (null allowed) |
| `recommended_cfg` | real | clamp 1.0 ≤ x ≤ 30.0 (null allowed) |
| `recommended_steps` | integer | clamp 1 ≤ x ≤ 150 (null allowed) |
| `example_images` count | — | UI enforces ≤ 4; DB has no constraint |

## File storage

Managed directory under Electron `userData`:

```
<userData>/example-images/
├── loras/<lora_id>/<uuid>.png
└── models/<model_id>/<uuid>.png
```

Directories created lazily on first write. UUIDs use `crypto.randomUUID()`.

Per-source behaviour:

| Source | Action | Stored `image_path` | On row delete |
|---|---|---|---|
| `paste` | Decode clipboard PNG → write to managed dir | managed absolute path | `fs.unlink` |
| `file` | Copy chosen file → managed dir, preserving the user's extension | managed absolute path | `fs.unlink` |
| `gallery` | No copy — reference iteration's `image_path` | iteration's absolute path | leave the file alone |

The renderer reads images via the existing `forge://` protocol (`forge://thumb/<path>` for grid thumbnails, `forge:///<path>` for the lightbox).

## IPC surface

### Existing handlers — reused
- `loras:get(id)` and `models:get(id)` — extended to attach `example_images: [{ id, image_path, source, sort_order }]` (ordered by `sort_order ASC, id ASC`).
- `loras:update(args)` and `models:update(args)` — already dynamically build the UPDATE from passed keys. Adding `trigger_words`, `recommended_strength` (LoRA) / `recommended_cfg`, `recommended_steps` (Model) needs the handler to accept them in the `fields`/`values` build-up. No new channels.

### New handlers
```
loras:add-example-image       { source, ...payload }    → { id, image_path }
loras:remove-example-image    { exampleId }             → true
loras:pick-example-image-file ()                        → string | null
models:add-example-image      { source, ...payload }    → { id, image_path }
models:remove-example-image   { exampleId }             → true
models:pick-example-image-file()                        → string | null
```

`addExampleImage` payload variants:

| `source` | Required payload | Behaviour |
|---|---|---|
| `'paste'` | `{ source, entityId, pngBuffer: Uint8Array }` | write buffer to managed dir |
| `'file'` | `{ source, entityId, sourcePath: string }` | copy file to managed dir |
| `'gallery'` | `{ source, entityId, iterationId: number }` | look up iteration's `image_path`, store reference |

`pickExampleImageFile` opens `dialog.showOpenDialog` filtered to PNG/JPG/JPEG/WEBP and returns the absolute path (or `null` if cancelled). Doesn't copy — the renderer follows up with `add-example-image` using that path.

`removeExampleImage`: looks up the row, if `source IN ('paste','file')` calls `fs.unlink` on `image_path` (best-effort, ignores ENOENT), then deletes the row.

All writes wrapped in `db.transaction(...)()` where multi-statement.

### Preload bridge
`src/main/preload.js` adds these methods under `window.forge.loras.*` and `window.forge.models.*`. The renderer never touches filesystem directly.

## UI

### Layout — two-column split

Both `LoRADetail.jsx` and `ModelDetail.jsx` restructure the body below the stats header into a two-column grid:

```
┌───────────────────────────────────────────────────┐
│  Stats header (existing card — unchanged)         │
├───────────────────────────┬───────────────────────┤
│  Examples           ~60%  │  Trigger words   📋   │
│  ┌─────────────────────┐  │  [textarea, 4 rows]   │
│  │  smart grid by      │  │                       │
│  │  count (1/2/3/4)    │  │  Strength        📋   │
│  │                     │  │  [0.85]               │
│  │  hover: ×           │  │                       │
│  │  click: lightbox    │  │  Notes (existing)     │
│  │                     │  │  [textarea, 5 rows]   │
│  └─────────────────────┘  │                       │
├───────────────────────────┴───────────────────────┤
│  Used in — N iterations (existing — unchanged)    │
└───────────────────────────────────────────────────┘
```

`ModelDetail.jsx` shows `Recommended CFG` and `Recommended steps` in place of `Trigger words` and `Strength`.

CSS grid columns: `grid-template-columns: 1.4fr 1fr; gap: 20px;`. Stacks to one column on narrow widths via a single media query (≤ 900px).

### Smart examples grid

`ExamplesGrid` renders different patterns based on `images.length`:

| Count | Image pattern |
|---|---|
| 0 | (no image grid — empty state takes over the whole examples area) |
| 1 | single full-width tile, `aspect-ratio: 16 / 10` |
| 2 | 2×1 grid, each square |
| 3 | row 1: one hero (full width, `aspect-ratio: 2 / 1`); row 2: two half-width squares |
| 4 | 2×2 grid, each square (no `+ add` — cap reached) |

The `+ add` tile is a **separate element below the image grid**, not embedded in it — shown whenever `count < 4`. At `count == 0` the add tile becomes the empty state: a single full-width dashed band reading `+ Add example — Paste · Choose file · Pick from gallery`. At `count > 0`, it's a smaller dashed pill below the grid reading just `+ Add example`. Both trigger the same `AddExampleMenu` dropdown on click.

### `+ add` interaction

Click the `+ add` tile → small dropdown menu (positioned over the tile, dismisses on outside click):

- **Paste screenshot** — calls `navigator.clipboard.read()`, finds the first `image/png` blob, sends bytes via `add-example-image` with `source: 'paste'`. Toast `"Pasted."` on success, error toast if clipboard has no image.
- **Choose file…** — calls `pickExampleImageFile()`, if path returned calls `add-example-image` with `source: 'file', sourcePath`.
- **Pick from gallery** — opens `GalleryPickerOverlay`. On pick, calls `add-example-image` with `source: 'gallery', iterationId`.

### Image tile interactions

- **Hover** — small `×` button appears top-right. Click `×` → calls `removeExampleImage`, optimistic update + fade-out. No confirm.
- **Click image** — opens `LightboxOverlay` with the full-resolution image (`forge:///<path>`), centred, max 90vw × 90vh, backdrop fade + scale-in (`overlayBg` + `scaleIn` from `lib/motion.js`). Backdrop click or `Esc` closes.

### `GalleryPickerOverlay`

Modal overlay (uses `overlayBg` + `scaleIn`). Header shows the LoRA/checkpoint name and a toggle `[ Only this LoRA · All iterations ]` (default: only this LoRA / checkpoint). Body shows a thumbnail grid of iterations (`iter.image_path` via `forge://thumb/...`), reuses the same query the existing `loras:usage` / `models:usage` handlers run when toggled to "only this". Click a thumbnail → confirms the pick and closes.

For "only this LoRA / checkpoint" reuse the existing `loras:usage` / `models:usage` handlers. For "All iterations" add one new lightweight handler `iterations:list-all` that returns `{ id, image_path, main_gen_id, main_gen_title, iteration_number }` ordered by `iterations.created_at DESC`. No pagination in v1 — single-user desktop app, typical row count is hundreds.

### Paste buttons & click-to-copy on text/number fields

Every field label row has a small `📋` button on the right. Click reads `navigator.clipboard.readText()` and assigns it to the field state (numeric fields parse `Number(x)` and clamp).

Clicking the *value* element of trigger words / strength / cfg / steps copies it via `navigator.clipboard.writeText()`. Toast `"Copied"`. The textarea for trigger words can't be click-to-copy (it conflicts with selection) — instead a `📋` button on the right of the label copies the textarea contents. Distinct from the paste button (different icon / position).

### Save semantics

Same debounced-500ms pattern as the existing notes textarea: edits update local state immediately, `saveTimer` resets per keystroke, on timer fire calls `loras.update({ id, ...fields })` (single call, only the changed keys) and shows the `Notes saved` toast (renamed to `Saved` since it's not just notes anymore).

## Components

| File | Purpose |
|---|---|
| `src/renderer/components/ExamplesGrid.jsx` (new) | Smart 1/2/3/4 grid, hover-×, click-lightbox, embedded `+ add` tile |
| `src/renderer/components/LightboxOverlay.jsx` (new) | Full-image overlay, Esc/backdrop close |
| `src/renderer/components/GalleryPickerOverlay.jsx` (new) | Filtered/all iteration picker modal |
| `src/renderer/components/AddExampleMenu.jsx` (new) | Three-option dropdown attached to `+ add` tile |
| `src/main/examples/example-images.js` (new) | File ops: `saveBufferAsExample`, `copyFileAsExample`, `unlinkExample`, `ensureDir` |

## Files changed (summary)

**New**
- `src/main/examples/example-images.js`
- `src/renderer/components/ExamplesGrid.jsx`
- `src/renderer/components/LightboxOverlay.jsx`
- `src/renderer/components/GalleryPickerOverlay.jsx`
- `src/renderer/components/AddExampleMenu.jsx`

**Modified**
- `src/main/db/database.js` — version bump + ALTERs
- `src/main/db/schema.sql` — add two new tables
- `src/main/ipc/loras.js` — extend `update`, `get`; add `add/remove-example-image`, `pick-example-image-file`
- `src/main/ipc/models.js` — same as loras
- `src/main/ipc/iterations.js` — add `iterations:list-all` for the "All iterations" toggle (lightweight projection)
- `src/main/preload.js` — expose new methods + new event channels are not needed
- `src/renderer/pages/LoRADetail.jsx` — restructure layout, wire new fields + ExamplesGrid
- `src/renderer/pages/ModelDetail.jsx` — same as LoRADetail with CFG/Steps instead

## Error handling

- **Clipboard paste with no image** → toast `"No image in clipboard"`. No state change.
- **File picker cancelled** → no-op. No toast.
- **File copy fails (ENOENT, EACCES)** → toast `"Couldn't save example image"`. Row not inserted.
- **Numeric out of range** (from paste or direct input) → clamp silently, no error.
- **`removeExampleImage` `unlink` fails with ENOENT** → ignore, still delete the DB row (the file is already gone).
- **Gallery picker with zero iterations using this LoRA** → empty state in the modal `"No iterations use this LoRA yet — try 'All iterations'"`.

## Implementation slicing

Three slices, each ships a usable app:

### Slice 1 — Scalar fields (data + UI)
Schema migration: bump `user_version` to 4 with the four `ALTER TABLE` statements in `database.js` (idempotent via `try/catch`, matching the existing pattern). The new `CREATE TABLE` statements for example images go into `schema.sql` in the same change but won't be exercised until slice 2 — they're `CREATE IF NOT EXISTS` so they run idempotently on every boot regardless of `user_version`. Extend `loras:update` / `models:update` to accept the new keys. Add `trigger_words` + `strength` (LoRA) and `cfg` + `steps` (Model) input fields under the existing notes section in each detail page (no layout restructure yet). Add `📋 Paste` buttons and click-to-copy. Verify debounced save + clamping + clipboard read.

### Slice 2 — Example images backend + minimal grid
Create the two new tables. Build `src/main/examples/example-images.js`. Add three IPC handlers per namespace (`add-example-image`, `remove-example-image`, `pick-example-image-file`) + extend `get` to attach `example_images`. Add `iterations:list-all`. Wire a placeholder `ExamplesGrid` (uniform grid, no smart counts) + `AddExampleMenu` + `GalleryPickerOverlay`. Verify all three add-sources work and delete unlinks managed files. Still in single-column layout.

### Slice 3 — Layout restructure + smart grid + lightbox
Restructure both detail pages into the two-column split. Implement smart 1/2/3/4 grid patterns in `ExamplesGrid`. Add `LightboxOverlay`. Polish: hover ×, fade-out on delete, dropdown styling, motion variants. Final visual pass against `.impeccable.md` (warm dark, yellow accents, Bricolage / Figtree).

## Testing approach

No automated test framework is configured in this project. Verification is manual via `npm run dev`. Each slice gets a manual test checklist in the implementation plan:

- **Slice 1**: paste numbers / text / clamping / debounced save / refresh persists.
- **Slice 2**: each of three sources works → file appears in `userData/example-images/` (paste + file) or path references existing iteration (gallery) → delete unlinks the managed file but not the gallery file.
- **Slice 3**: grid morphs correctly between counts 0/1/2/3/4 → lightbox opens and closes → gallery picker filter toggle works → narrow window stacks layout.

## Deferred for later

Not in scope for v1; intentionally deferred:
- Drag-to-reorder example images (DB `sort_order` column reserved so future ordering doesn't need another migration).
- Drag-and-drop onto the empty examples area as a fourth input source.
- Pagination for `iterations:list-all` — re-evaluate only if real-world row counts exceed a few thousand.
