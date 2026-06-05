# Manual Prompt Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No test framework exists in this repo** (see CLAUDE.md). "Verify" steps run `npx vite build` (renderer compile — catches JSX/import/syntax) and `node --check` (main-process files), plus a final manual QA checklist. Do **not** invent a test runner.

**Goal:** Add a manual, tag-pill prompt builder (live Danbooru autocomplete + colored category pills + bulk relevancy suggestions) alongside the existing AI prompt builder, as a mode toggle on the Prompt Builder page.

**Architecture:** Reuse the existing 3-column Prompt Builder shell. A header segmented control `✨ AI ｜ ✍️ Manual` swaps only the center column: AI mode keeps `ChatTranscript + InputDock`; Manual mode renders a new `ManualPromptComposer` (positive + negative `TagPillInput` editors + a `RelevancyStrip`). The autocomplete and relevancy are powered by the **already-built** `tags/search.js` (FTS5 + MiniLM cosine) — only two thin backend functions are added. Left Tag Library and right LoRA Picker feed the composer; LoRA selection auto-adds trigger-word pills. Manual prompts save through the existing `saved_prompts` presets path.

**Tech Stack:** Electron (main/renderer split via `window.forge.*` preload bridge), React, better-sqlite3, MiniLM embeddings (`@huggingface/transformers`, already wired), Framer Motion, Tailwind + inline styles, warm-dark theme.

**Locked design decisions (confirmed with user):**
1. **Placement:** Mode toggle inside `PromptBuilder.jsx` (not a new page).
2. **Negative tags:** Include a separate negative-prompt pill editor (positive + negative).
3. **LoRA triggers:** Selecting LoRAs in the right panel auto-adds their trigger words as removable LoRA-colored pills.

---

## Key codebase facts (verified — trust these)

- **Autocomplete backend (exists):** `window.forge.prompt.searchTags(query, { limit, category })` → `Promise<[{ id, name, category, post_count, aliases }]>`. `category` is the **Danbooru numeric code**: `0` general, `1` artist, `3` copyright, `4` character, `5` meta. Handler: `src/main/ipc/prompt-library.js:14`; engine: `src/main/tags/search.js:99`.
- **Relevancy primitives (exist) in `src/main/tags/search.js`:** module-level `embeddingMatrix` (Float32Array), `embeddingIds` (Int32Array, parallel to matrix rows), `EMBEDDING_DIM = 384`, `loadEmbeddingCache()`, `cosineRankAll(queryVec, limit)`, and `embedTexts` imported from `./embedder`. Tag embeddings are pre-stored in `danbooru_tags.embedding`.
- **Pill colors:** `src/renderer/lib/prompt-tag-categories.js` exports `COLORS`, `CATEGORY_TO_COLOR`, `colorsFor(tagItem, isNegativeBlock)`. The AI's `TagChip` lives in `src/renderer/components/prompt/AssistantMessage.jsx` and uses `colorsFor`. AI tag items shape: `{ tag, type?, category }` where `category` is a **string** bucket. Manual tags will use a **numeric** Danbooru category (or `null` for freeform).
- **Existing search UI reference:** `src/renderer/components/prompt/TagLibraryPanel.jsx` — debounced `searchTags` + clickable pills.
- **Page shell:** `src/renderer/pages/PromptBuilder.jsx`. Center column is `ChatTranscript` + `InputDock`. Left panel `TagLibraryPanel` calls `onInsertTag`. Right panel `LoRAPicker` toggles `selectedLoraIds` (a `Set`); `loraNamesById` is a `Map<id, row>` from `window.forge.loras.list()` and each row includes `name`, `file_path`, `trigger_words` (LoRA rows are `SELECT l.*`). `insertTagRef` is a ref whose `.current` is the active inserter.
- **Save preset path:** `window.forge.prompt.presets.save({ name, sourceMessageId, userDescription, positiveText, negativeText, positiveStructured, negativeStructured, modelFamily, checkpointId, temperature, loras })`. `positive_structured`/`negative_structured` are NOT NULL — always pass JSON strings. `loras` is `[{ lora_id, filename, trigger_words }]`.
- **Settings:** `window.forge.settings.get(key)` → string|null; `window.forge.settings.set(key, value)`.
- **Preload prompt namespace** lives in `src/main/preload.js` under `prompt: { ... }` (around lines 77–101).

---

## File Structure

**Create:**
- `src/renderer/components/prompt/TagPillInput.jsx` — token editor: pills + trailing input + autocomplete dropdown. Reused for positive & negative.
- `src/renderer/components/prompt/RelevancyStrip.jsx` — bulk relevancy suggestions, refreshes on tag change.
- `src/renderer/components/prompt/ManualPromptComposer.jsx` — composes the strip + positive/negative editors + footer (copy / save preset), handles LoRA trigger reconciliation.

**Modify:**
- `src/main/tags/search.js` — add `relatedTags()` and `resolveTags()`; export them.
- `src/main/ipc/prompt-library.js` — add `prompt:related-tags` and `prompt:resolve-tags` handlers.
- `src/main/preload.js` — expose `prompt.relatedTags` and `prompt.resolveTags`.
- `src/renderer/lib/prompt-tag-categories.js` — add Danbooru numeric-category → color map and `colorsForDanbooru()`.
- `src/renderer/pages/PromptBuilder.jsx` — header mode toggle, render `ManualPromptComposer` in Manual mode, persist mode, route `insertTagRef` + LoRAs to the composer.

---

## Task 1: Backend — relatedTags + resolveTags (engine + IPC + preload)

**Files:**
- Modify: `src/main/tags/search.js`
- Modify: `src/main/ipc/prompt-library.js`
- Modify: `src/main/preload.js`

- [ ] **Step 1: Add `relatedTags` and `resolveTags` to `src/main/tags/search.js`**

Insert these two functions just above the existing `module.exports` line (they rely on the module-level `embeddingMatrix`, `embeddingIds`, `EMBEDDING_DIM`, `loadEmbeddingCache`, `cosineRankAll`, `embedTexts`, and `getDatabase` already in this file):

```js
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
```

Then update the export line at the bottom of the file from:

```js
module.exports = { searchTags, loadEmbeddingCache, unloadEmbeddingCache }
```

to:

```js
module.exports = { searchTags, relatedTags, resolveTags, loadEmbeddingCache, unloadEmbeddingCache }
```

- [ ] **Step 2: Register IPC handlers in `src/main/ipc/prompt-library.js`**

Change the require at the top from:

```js
const { searchTags, unloadEmbeddingCache } = require('../tags/search')
```

to:

```js
const { searchTags, relatedTags, resolveTags, unloadEmbeddingCache } = require('../tags/search')
```

Then, immediately after the existing `prompt:search-tags` handler (the block at `ipcMain.handle('prompt:search-tags', ...)`), add:

```js
  ipcMain.handle('prompt:related-tags', async (_e, { tags, options }) => {
    return relatedTags(tags || [], options || {})
  })

  ipcMain.handle('prompt:resolve-tags', (_e, { names }) => {
    return resolveTags(names || [])
  })
```

- [ ] **Step 3: Expose in `src/main/preload.js`**

In the `prompt: { ... }` object, immediately after the `searchTags:` line (around line 78), add:

```js
    relatedTags: (tags, options) => ipcRenderer.invoke('prompt:related-tags', { tags, options }),
    resolveTags: (names) => ipcRenderer.invoke('prompt:resolve-tags', { names }),
```

- [ ] **Step 4: Verify main-process syntax**

Run:
```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject
node --check src/main/tags/search.js && node --check src/main/ipc/prompt-library.js && node --check src/main/preload.js && echo ALL_OK
```
Expected: `ALL_OK`

- [ ] **Step 5: Commit**

```bash
git add src/main/tags/search.js src/main/ipc/prompt-library.js src/main/preload.js
git commit -m "feat(prompt): backend for manual builder — relatedTags + resolveTags IPC

- relatedTags: averages the current prompt's tag embeddings (reusing stored
  vectors) and returns nearest library tags via existing cosineRankAll.
- resolveTags: exact name->category lookup to color freeform tags.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Danbooru category → pill color helper

**Files:**
- Modify: `src/renderer/lib/prompt-tag-categories.js`

- [ ] **Step 1: Add the numeric-category map and helper**

Append to the end of `src/renderer/lib/prompt-tag-categories.js`:

```js
// Danbooru numeric categories → display color group (manual builder pills).
// 0 general · 1 artist · 3 copyright · 4 character · 5 meta.
export const DANBOORU_CATEGORY_TO_COLOR = {
  0: 'subject',   // general  → blue
  1: 'style',     // artist   → yellow
  3: 'quality',   // copyright→ purple
  4: 'scene',     // character→ orange
  5: 'neutral',   // meta     → grey
}

// Color for a manual tag pill. `category` is a Danbooru numeric code, or null/undefined
// for a freeform (non-library) tag — which intentionally gets the neutral grey pill.
export function colorsForDanbooru(category) {
  if (category === null || category === undefined) return COLORS.neutral
  const group = DANBOORU_CATEGORY_TO_COLOR[category] || 'neutral'
  return COLORS[group]
}
```

- [ ] **Step 2: Verify renderer compiles**

Run:
```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject && npx vite build 2>&1 | tail -n 3
```
Expected: ends with `✓ built in …` (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/prompt-tag-categories.js
git commit -m "feat(prompt): danbooru numeric-category pill colors helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: TagPillInput — the token editor (pills + autocomplete)

**Files:**
- Create: `src/renderer/components/prompt/TagPillInput.jsx`

**Behavior contract:**
- Renders committed pills (each with a `×` remove) followed by a trailing text input.
- Tag item shape: `{ tag: string, category: number|null, type?: 'lora_trigger', lora_id?: number }`.
- Typing queries `searchTags(word, { limit: 8 })` (debounced 180ms) → dropdown; top item highlighted.
- Keys: **Tab/Enter** accept highlighted suggestion (or commit freeform if no suggestions); **comma** commits freeform; **↑/↓** move highlight; **Backspace** on empty input removes last pill; **Escape** closes dropdown.
- Clicking a suggestion commits it. Clicking a pill's `×` removes it.
- Duplicate tags (case-insensitive) are ignored. Freeform commits resolve category via `resolveTags`.
- Pills colored via `colorsForDanbooru(item.category)`; `lora_trigger` pills use `COLORS.lora`.
- Exposes an imperative inserter through `inserterRef` (so the Tag Library panel can inject a tag): `inserterRef.current = (name) => commitFreeform(name)`.

- [ ] **Step 1: Create the component**

Create `src/renderer/components/prompt/TagPillInput.jsx` with exactly:

```jsx
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { colorsForDanbooru, COLORS } from '../../lib/prompt-tag-categories.js'

function pillColors(item) {
  if (item.type === 'lora_trigger') return COLORS.lora
  return colorsForDanbooru(item.category)
}

export default function TagPillInput({
  tags,
  onChange,
  placeholder = 'Type a tag…',
  inserterRef,
}) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [open, setOpen] = useState(false)
  const inputEl = useRef(null)
  const debounceRef = useRef(null)

  const hasTag = useCallback(
    (name) => tags.some(t => t.tag.toLowerCase() === name.toLowerCase()),
    [tags],
  )

  const commit = useCallback((item) => {
    if (!item.tag || !item.tag.trim()) return
    if (hasTag(item.tag)) { setInput(''); setSuggestions([]); setOpen(false); return }
    onChange([...tags, { tag: item.tag.trim(), category: item.category ?? null }])
    setInput('')
    setSuggestions([])
    setOpen(false)
    setActiveIdx(0)
  }, [tags, onChange, hasTag])

  const commitFreeform = useCallback(async (raw) => {
    const name = (raw || '').trim().replace(/,+$/, '').trim()
    if (!name) return
    if (hasTag(name)) { setInput(''); setSuggestions([]); setOpen(false); return }
    let category = null
    try {
      const map = await window.forge.prompt.resolveTags([name])
      if (map && Object.prototype.hasOwnProperty.call(map, name.toLowerCase())) {
        category = map[name.toLowerCase()]
      }
    } catch {}
    commit({ tag: name, category })
  }, [hasTag, commit])

  // Let the parent (Tag Library / LoRA panel) inject tags imperatively.
  useEffect(() => {
    if (inserterRef) inserterRef.current = (name) => commitFreeform(name)
    return () => { if (inserterRef) inserterRef.current = null }
  }, [inserterRef, commitFreeform])

  // Debounced autocomplete.
  useEffect(() => {
    clearTimeout(debounceRef.current)
    const q = input.trim()
    if (!q) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await window.forge.prompt.searchTags(q, { limit: 8 })
        setSuggestions(r || [])
        setActiveIdx(0)
        setOpen((r || []).length > 0)
      } catch {
        setSuggestions([]); setOpen(false)
      }
    }, 180)
    return () => clearTimeout(debounceRef.current)
  }, [input])

  const removeAt = (idx) => onChange(tags.filter((_, i) => i !== idx))

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (open && suggestions[activeIdx]) {
        e.preventDefault()
        const s = suggestions[activeIdx]
        commit({ tag: s.name, category: s.category })
      } else if (input.trim()) {
        e.preventDefault()
        commitFreeform(input)
      }
      return
    }
    if (e.key === ',') { e.preventDefault(); commitFreeform(input); return }
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      e.preventDefault(); removeAt(tags.length - 1); return
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => inputEl.current && inputEl.current.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
          minHeight: 96, padding: 8, borderRadius: 10,
          background: '#1a1813', border: '1px solid #302c1e',
          cursor: 'text', alignContent: 'flex-start',
        }}
      >
        {tags.map((item, i) => {
          const c = pillColors(item)
          return (
            <span key={`${item.tag}-${i}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: c.bg, color: c.fg,
              padding: '3px 6px 3px 8px', fontSize: 11, borderRadius: 4,
              fontFamily: "'JetBrains Mono', monospace",
              border: c.border ? `1px dashed ${c.border}` : '1px solid transparent',
              fontWeight: item.type === 'lora_trigger' ? 600 : 400,
            }}>
              {item.type === 'lora_trigger' && <span style={{ fontSize: 9 }}>🎛</span>}
              <span>{item.tag}</span>
              <span
                onClick={(e) => { e.stopPropagation(); removeAt(i) }}
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12, lineHeight: 1 }}
                title="Remove"
              >×</span>
            </span>
          )
        })}
        <input
          ref={inputEl}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={tags.length === 0 ? placeholder : ''}
          style={{
            flex: 1, minWidth: 80, background: 'transparent', border: 0, outline: 'none',
            color: '#eae5dc', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            padding: '3px 2px',
          }}
        />
      </div>

      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 30,
          background: '#13110c', border: '1px solid #302c1e', borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => {
            const c = colorsForDanbooru(s.category)
            return (
              <div
                key={s.id}
                onMouseDown={(e) => { e.preventDefault(); commit({ tag: s.name, category: s.category }) }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '6px 10px', cursor: 'pointer',
                  background: i === activeIdx ? 'rgba(232,200,32,0.10)' : 'transparent',
                }}
              >
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: c.fg,
                }}>{s.name}</span>
                <span style={{ fontSize: 9, color: '#635c48' }}>{(s.post_count || 0).toLocaleString()}</span>
              </div>
            )
          })}
          <div style={{ padding: '4px 10px', fontSize: 9, color: '#635c48', borderTop: '1px solid #302c1e' }}>
            Tab / Enter to add · , to add freeform
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify renderer compiles**

Run:
```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject && npx vite build 2>&1 | tail -n 3
```
Expected: `✓ built in …`, no errors. (The component isn't mounted yet; this only checks it compiles.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/prompt/TagPillInput.jsx
git commit -m "feat(prompt): TagPillInput token editor with danbooru autocomplete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: RelevancyStrip — bulk suggestions

**Files:**
- Create: `src/renderer/components/prompt/RelevancyStrip.jsx`

**Behavior contract:**
- Props: `{ tags, onAdd }`. `tags` is the positive tag array. `onAdd(item)` adds `{ tag, category }`.
- On `tags` change (debounced 400ms) calls `window.forge.prompt.relatedTags(tags.map(t => t.tag), { limit: 20 })`.
- Renders a horizontal, wrapping strip of clickable pills colored by category. Hidden when there are no tags or no suggestions. Shows a subtle "Finding related tags…" while loading.

- [ ] **Step 1: Create the component**

Create `src/renderer/components/prompt/RelevancyStrip.jsx`:

```jsx
import React, { useState, useEffect, useRef } from 'react'
import { colorsForDanbooru } from '../../lib/prompt-tag-categories.js'

export default function RelevancyStrip({ tags, onAdd }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const names = tags.map(t => t.tag).join('|') // stable dependency key

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (tags.length === 0) { setSuggestions([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await window.forge.prompt.relatedTags(tags.map(t => t.tag), { limit: 20 })
        setSuggestions(r || [])
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names])

  if (tags.length === 0) return null

  return (
    <div style={{
      padding: '8px 10px', borderRadius: 10,
      background: 'rgba(232,200,32,0.04)', border: '1px solid #242118', marginBottom: 10,
    }}>
      <div style={{
        fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px',
        color: '#8a8268', fontWeight: 600, marginBottom: 6,
      }}>
        Related tags {loading ? '· finding…' : ''}
      </div>
      {suggestions.length === 0 && !loading ? (
        <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic' }}>No related tags yet — add a few more.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {suggestions.map((s) => {
            const c = colorsForDanbooru(s.category)
            return (
              <span
                key={s.id}
                onClick={() => onAdd({ tag: s.name, category: s.category })}
                title={`${(s.post_count || 0).toLocaleString()} posts · click to add`}
                style={{
                  padding: '3px 7px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  background: c.bg, color: c.fg,
                  border: '1px solid transparent',
                }}
              >+ {s.name}</span>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify renderer compiles**

Run:
```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject && npx vite build 2>&1 | tail -n 3
```
Expected: `✓ built in …`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/prompt/RelevancyStrip.jsx
git commit -m "feat(prompt): RelevancyStrip — bulk related-tag suggestions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: ManualPromptComposer — compose editors + LoRA triggers + save/copy

**Files:**
- Create: `src/renderer/components/prompt/ManualPromptComposer.jsx`

**Behavior contract:**
- Props: `{ selectedLoras, onRemoveLora, insertTagRef, onSavedPreset }`.
  - `selectedLoras`: array of LoRA rows (`{ id, name, file_path, trigger_words }`) currently selected in the right panel.
  - `insertTagRef`: ref the parent passes to the active editor (positive) so the Tag Library panel can inject tags.
  - `onSavedPreset()`: optional callback after a successful save (e.g. toast already shown internally).
- State: `positive` and `negative` tag arrays.
- **LoRA reconciliation:** a `useEffect` on `selectedLoras` keeps exactly one `lora_trigger` pill per selected LoRA inside `positive` (tag = its `trigger_words` or its `name` if blank), preserving all non-LoRA pills and their order. Deselecting a LoRA removes its pill.
- Footer: tag counts, **Copy positive**, **Copy negative**, **Save preset**, **Clear**.
- Save builds the `saved_prompts` payload from the structured pills (LoRA pills → `loras` snapshot).

- [ ] **Step 1: Create the component**

Create `src/renderer/components/prompt/ManualPromptComposer.jsx`:

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import TagPillInput from './TagPillInput.jsx'
import RelevancyStrip from './RelevancyStrip.jsx'

export default function ManualPromptComposer({ selectedLoras, onRemoveLora, insertTagRef, onSavedPreset }) {
  const [positive, setPositive] = useState([])
  const [negative, setNegative] = useState([])
  const showToast = useToast()
  const prevLoraIds = useRef('')

  // Keep LoRA-trigger pills in `positive` in sync with the right-panel selection.
  useEffect(() => {
    const idsKey = selectedLoras.map(l => l.id).join(',')
    if (idsKey === prevLoraIds.current) return
    prevLoraIds.current = idsKey
    setPositive(prev => {
      const nonLora = prev.filter(t => t.type !== 'lora_trigger')
      const loraPills = selectedLoras.map(l => ({
        tag: (l.trigger_words && l.trigger_words.trim()) ? l.trigger_words.trim() : l.name,
        category: null,
        type: 'lora_trigger',
        lora_id: l.id,
      }))
      return [...nonLora, ...loraPills]
    })
  }, [selectedLoras])

  const copy = useCallback(async (arr, label) => {
    const text = arr.map(t => t.tag).join(', ')
    if (!text) { showToast(`Nothing in the ${label} prompt.`); return }
    try { await navigator.clipboard.writeText(text); showToast(`Copied ${label} prompt.`) }
    catch { showToast("Couldn't copy.") }
  }, [showToast])

  const clearAll = () => {
    setPositive([])
    setNegative([])
    // Drop LoRA selection too so pills don't get re-added.
    selectedLoras.forEach(l => onRemoveLora(l.id))
    prevLoraIds.current = ''
  }

  const savePreset = useCallback(async () => {
    if (positive.length === 0 && negative.length === 0) { showToast('Add some tags first.'); return }
    const loraPills = positive.filter(t => t.type === 'lora_trigger')
    const lorasSnapshot = loraPills.map(t => {
      const row = selectedLoras.find(l => l.id === t.lora_id)
      return {
        lora_id: t.lora_id,
        filename: row ? (row.file_path ? row.file_path.split('/').pop() : row.name) : '(unknown)',
        trigger_words: t.tag,
      }
    })
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const autoName = `Manual ${ts}`
    try {
      const r = await window.forge.prompt.presets.save({
        name: autoName,
        sourceMessageId: null,
        userDescription: null,
        positiveText: positive.map(t => t.tag).join(', '),
        negativeText: negative.map(t => t.tag).join(', '),
        positiveStructured: JSON.stringify(positive),
        negativeStructured: JSON.stringify(negative),
        modelFamily: null,
        checkpointId: null,
        temperature: null,
        loras: lorasSnapshot,
      })
      if (r && r.ok) { showToast(`Saved as "${autoName}" — rename in the Saved drawer.`); onSavedPreset && onSavedPreset() }
      else showToast(`Save failed: ${(r && r.reason) || 'unknown'}`)
    } catch (err) {
      showToast(`Save error: ${err.message || err}`)
    }
  }, [positive, negative, selectedLoras, showToast, onSavedPreset])

  const btn = {
    padding: '6px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
    background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: 16, gap: 14 }}>
      <RelevancyStrip tags={positive} onAdd={(item) => setPositive(prev =>
        prev.some(t => t.tag.toLowerCase() === item.tag.toLowerCase()) ? prev : [...prev, item])} />

      <div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e8c820', fontWeight: 600, marginBottom: 6 }}>
          + Positive · {positive.length} tag{positive.length !== 1 ? 's' : ''}
        </div>
        <TagPillInput tags={positive} onChange={setPositive} inserterRef={insertTagRef} placeholder="Type a tag — e.g. 1girl, absurdres…" />
      </div>

      <div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e06c75', fontWeight: 600, marginBottom: 6 }}>
          − Negative · {negative.length} tag{negative.length !== 1 ? 's' : ''}
        </div>
        <TagPillInput tags={negative} onChange={setNegative} placeholder="Negative tags — e.g. lowres, bad anatomy…" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #302c1e' }}>
        <button style={btn} onClick={() => copy(positive, 'positive')}>⧉ Copy positive</button>
        <button style={btn} onClick={() => copy(negative, 'negative')}>⧉ Copy negative</button>
        <button style={{ ...btn, color: '#e8c820' }} onClick={savePreset}>★ Save preset</button>
        <button style={{ ...btn, marginLeft: 'auto', color: '#e06c75' }} onClick={clearAll}>Clear</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify renderer compiles**

Run:
```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject && npx vite build 2>&1 | tail -n 3
```
Expected: `✓ built in …`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/prompt/ManualPromptComposer.jsx
git commit -m "feat(prompt): ManualPromptComposer — positive/negative editors, LoRA triggers, save

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire the mode toggle into PromptBuilder

**Files:**
- Modify: `src/renderer/pages/PromptBuilder.jsx`

- [ ] **Step 1: Import the composer**

Add to the import block at the top of `src/renderer/pages/PromptBuilder.jsx`, after the existing prompt-component imports:

```jsx
import ManualPromptComposer from '../components/prompt/ManualPromptComposer.jsx'
```

- [ ] **Step 2: Add mode state + persistence**

Inside `PromptBuilder()`, add alongside the other `useState` hooks:

```jsx
  const [mode, setMode] = useState('ai') // 'ai' | 'manual'
```

Add this effect next to the other `useEffect` hooks (loads the persisted mode once):

```jsx
  useEffect(() => {
    window.forge.settings.get('prompt_builder_mode').then((v) => {
      if (v === 'manual' || v === 'ai') setMode(v)
    }).catch(() => {})
  }, [])
```

Add a setter that also persists:

```jsx
  const changeMode = (m) => {
    setMode(m)
    window.forge.settings.set('prompt_builder_mode', m)
  }
```

- [ ] **Step 3: Add the segmented toggle to the header**

In the header's right-side `<div className="flex gap-2">` (the one holding "↺ New chat" and "⎘ Saved"), add this segmented control as the **first** child of that div:

```jsx
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #302c1e' }}>
            {[['ai', '✨ AI'], ['manual', '✍️ Manual']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  background: mode === m ? '#e8c820' : '#242118',
                  color: mode === m ? '#0f0e0b' : '#bfb8a8',
                }}
              >
                {label}
              </button>
            ))}
          </div>
```

- [ ] **Step 4: Swap the center column by mode**

In the center column `<div className="flex flex-col flex-1 min-w-0" style={{ background: '#0f0e0b' }}>`, replace its children (currently `<ChatTranscript ... />` and `<InputDock ... />`) with a conditional:

```jsx
              {mode === 'ai' ? (
                <>
                  <ChatTranscript
                    sessionId={activeSessionId}
                    inFlight={inFlight}
                    recentToolCall={recentToolCall}
                    refreshTick={transcriptTick}
                    onSavePreset={handleSavePreset}
                  />
                  <InputDock
                    selectedLoras={selectedLorasArray}
                    onRemoveLora={removeLora}
                    onSend={handleSend}
                    inFlight={inFlight}
                    defaultTemp={defaultTemp}
                    insertTagRef={insertTagRef}
                  />
                </>
              ) : (
                <ManualPromptComposer
                  selectedLoras={selectedLorasArray}
                  onRemoveLora={removeLora}
                  insertTagRef={insertTagRef}
                />
              )}
```

(`selectedLorasArray`, `removeLora`, `insertTagRef`, and the AI props already exist in the component — do not redefine them.)

- [ ] **Step 5: Verify renderer compiles**

Run:
```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject && npx vite build 2>&1 | tail -n 4
```
Expected: `✓ built in …`, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/PromptBuilder.jsx
git commit -m "feat(prompt): AI/Manual mode toggle on Prompt Builder

Persists last mode; Manual mode renders ManualPromptComposer in the center
column while reusing the Tag Library, LoRA picker, and Saved presets.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Manual QA (run the app and verify behavior)

**Files:** none (verification only).

> The renderer hot-reloads, but **Task 1 changed the main process** (`search.js`, `prompt-library.js`, `preload.js`). The app MUST be fully restarted (quit + `npm run dev`) for the new IPC to load. Requires the Danbooru tag library to be downloaded/indexed (Settings → Refresh tag library) — `relatedTags`/`searchTags` return empty without it.

- [ ] **Step 1: Launch**

```bash
cd /Users/ibraheemfiraz/Desktop/ForgeProject && npm run dev
```

- [ ] **Step 2: Walk the checklist** (Prompt page → toggle to **✍️ Manual**)
  - Type `absur` in the positive editor → dropdown shows `absurdres` → press **Tab** → it becomes a colored pill; input clears.
  - Type `1girl,` (with comma) → commits as a pill; verify it's colored (general → blue).
  - Type a nonsense word like `zzqq` + comma → commits as a **neutral grey** pill (non-Danbooru).
  - With a few tags present, the **Related tags** strip populates; click a suggestion → it's added; strip refreshes.
  - **Backspace** on empty input removes the last pill; each pill's `×` removes it.
  - Select a LoRA in the right panel → its trigger words appear as a red 🎛 `lora_trigger` pill in positive; deselect → pill disappears.
  - Click a Tag Library tag (left panel) → it lands in the positive editor.
  - Add negative tags in the negative editor.
  - **Copy positive** / **Copy negative** put comma-joined text on the clipboard.
  - **Save preset** → success toast → open **⎘ Saved** drawer → the preset is listed.
  - Toggle back to **✨ AI** → chat UI returns intact. Reload the app → it reopens in the last-used mode.

- [ ] **Step 3: If all pass, no commit needed.** If a bug is found, fix in the relevant task's file, re-run `npx vite build`, re-verify, and commit the fix with a `fix(prompt): …` message.

---

## Self-Review notes (author check)

- **Spec coverage:** autocomplete on type + Tab-to-accept (Task 3); per-tag colored pills, non-Danbooru = no color (Tasks 2–3); bulk relevancy from averaging the library, refreshing as you type (Tasks 1 & 4); integrated into existing AI page (Task 6); negative editor + LoRA triggers (locked decisions, Task 5). All covered.
- **Type consistency:** tag item shape `{ tag, category:number|null, type?, lora_id? }` is identical across `TagPillInput`, `RelevancyStrip` (emits `{tag,category}`), and `ManualPromptComposer`. `relatedTags`/`searchTags`/`resolveTags` return shapes match their consumers. `colorsForDanbooru(category)` accepts the numeric category used everywhere.
- **No placeholders:** every code step is complete and ready to paste.
- **Verification:** adapted from TDD to `vite build` + `node --check` + manual QA because the repo has no test framework (documented in CLAUDE.md).
```
