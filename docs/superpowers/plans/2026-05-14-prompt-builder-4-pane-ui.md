# Prompt Builder — Plan 4: Pane UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Prompt Builder pane that connects all the plumbing from Plans 1-3 into a usable interface. Three-column layout: tag library (left), chat transcript + input dock (center), LoRA picker (right). Generated prompts can be saved as presets. The pane replaces the placeholder "Extras" route. By the end of this plan, the user can type "moody redhead portrait at sunset", press send, watch tool-call progress, see a copyable Danbooru-style prompt with LoRA trigger words in red, and save it as a preset.

**Architecture:** A new top-level page `PromptBuilder.jsx` orchestrates three child components (`TagLibraryPanel`, `ChatPane`, `LoRAPicker`) via a local context. Chat messages stream via `prompt:tool-call` events and resolve via the `prompt:send` IPC. The saved-presets feature is a schema migration v7 → v8 with a drawer UI accessible from the pane's top bar. First-launch nag modal blocks the pane when the tag library isn't downloaded yet (Plan 2's library is the AI's grounding source).

**Tech Stack:** React, Tailwind, Framer Motion, the existing IPC surface from Plans 1-3. No new dependencies.

**Reference spec:** [docs/superpowers/specs/2026-05-13-prompt-builder-design.md](../specs/2026-05-13-prompt-builder-design.md) sections "User experience", "Layout", "Chat transcript", "Tag color palette in output", "Input dock", "First-launch download flow", "Settings page additions", "Error handling".

**Reference mockups (already produced during brainstorming):** `.superpowers/brainstorm/83317-1778672587/content/layout-with-loras.html` shows the final visual target.

---

## File Structure

**Files to create (renderer):**
- `src/renderer/pages/PromptBuilder.jsx` — top-level pane: layout shell, session state, orchestrates children.
- `src/renderer/components/prompt/TagLibraryPanel.jsx` — left column: searchable browse view of popular Danbooru tags + categories. Click a tag drops it into the textarea.
- `src/renderer/components/prompt/LoRAPicker.jsx` — right column: searchable selectable list of the user's LoRAs.
- `src/renderer/components/prompt/ChatTranscript.jsx` — center column: scrollable list of user + assistant messages, with the AI's response rendered as colored tag chips.
- `src/renderer/components/prompt/AssistantMessage.jsx` — one assistant message: positive + negative tag arrays, Copy/Save buttons, LoRA addendum.
- `src/renderer/components/prompt/InputDock.jsx` — bottom of center column: textarea + selected LoRA pills + temperature slider + send button.
- `src/renderer/components/prompt/SavedPresetsDrawer.jsx` — modal/drawer listing saved presets with Load/Delete.
- `src/renderer/components/prompt/LibraryDownloadModal.jsx` — blocking nag when no tag library exists.
- `src/renderer/lib/prompt-tag-categories.js` — the AI's 12 emit-categories → 5 display-color group mapping (per design system).

**Files to modify (renderer):**
- `src/renderer/App.jsx` — replace `<Route path="/extras">` with `<Route path="/prompt">`.
- `src/renderer/components/Sidebar.jsx` — rename "Extras" → "Prompt", update icon and route.
- `src/renderer/index.css` — add new CSS tokens for LoRA-red and category-cyan/purple/orange if not already present.
- `tailwind.config.js` — mirror new tokens.
- `CLAUDE.md` — schema version note (8) + reference Prompt Builder pane.

**Files to delete (renderer):**
- `src/renderer/pages/Extras.jsx` — placeholder, no longer referenced.

**Files to create (main):**
- `src/main/ipc/prompt-presets.js` — IPC handlers for `prompt:presets:list`, `:save`, `:delete`, `:rename`.

**Files to modify (main):**
- `src/main/db/schema.sql` — add `saved_prompts` and `saved_prompt_loras` tables.
- `src/main/db/database.js` — bump `user_version` from 7 → 8.
- `src/main/preload.js` — expose `window.forge.prompt.presets.*`.
- `src/main/index.js` — register `registerPromptPresetsHandlers`.

---

## Task 1: Schema migration v7 → v8 — saved presets

**Files:**
- Modify: `src/main/db/schema.sql`
- Modify: `src/main/db/database.js`

Saved presets snapshot the LoRA trigger words at save time, so renaming a LoRA's triggers later doesn't corrupt old presets.

- [ ] **Step 1: Append the two tables to `schema.sql`**

Open `src/main/db/schema.sql`. After the `CREATE INDEX IF NOT EXISTS idx_prompt_chat_messages_session` line (from Plan 3 Task 1), append:

```sql

CREATE TABLE IF NOT EXISTS saved_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source_message_id INTEGER REFERENCES prompt_chat_messages(id) ON DELETE SET NULL,
  user_description TEXT,
  positive_text TEXT NOT NULL,
  negative_text TEXT NOT NULL,
  positive_structured TEXT NOT NULL,
  negative_structured TEXT NOT NULL,
  model_family TEXT,
  checkpoint_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  temperature REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_prompts_created_at ON saved_prompts(created_at DESC);

CREATE TABLE IF NOT EXISTS saved_prompt_loras (
  saved_prompt_id INTEGER NOT NULL REFERENCES saved_prompts(id) ON DELETE CASCADE,
  lora_id INTEGER REFERENCES loras(id) ON DELETE SET NULL,
  lora_filename_snapshot TEXT NOT NULL,
  trigger_words_snapshot TEXT NOT NULL,
  PRIMARY KEY (saved_prompt_id, lora_id)
);
```

- [ ] **Step 2: Bump `user_version` in `database.js`**

Open `src/main/db/database.js`. Find the existing `if (version < 7)` block. Add immediately after it:

```javascript
  if (version < 8) {
    // saved_prompts and saved_prompt_loras are created idempotently by schema.sql.
  }
```

Change the final pragma to `db.pragma('user_version = 8')`.

- [ ] **Step 3: Verify migration**

```bash
npm run dev
```

Wait ~15 seconds. In separate terminal:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "PRAGMA user_version; SELECT name FROM sqlite_master WHERE name LIKE 'saved_prompt%' OR name LIKE 'idx_saved_prompt%' ORDER BY name;"
```

Expected: version 8. Three names listed: `idx_saved_prompts_created_at`, `saved_prompt_loras`, `saved_prompts`.

Stop dev server.

- [ ] **Step 4: Test ON DELETE CASCADE**

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "INSERT INTO saved_prompts (name, positive_text, negative_text, positive_structured, negative_structured) VALUES ('test', 'p', 'n', '[]', '[]'); INSERT INTO saved_prompt_loras (saved_prompt_id, lora_id, lora_filename_snapshot, trigger_words_snapshot) VALUES (last_insert_rowid(), NULL, 'test.safetensors', 'triggerA'); SELECT COUNT(*) FROM saved_prompt_loras; DELETE FROM saved_prompts WHERE name = 'test'; SELECT COUNT(*) FROM saved_prompt_loras;"
```

Expected: `1` then `0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.sql src/main/db/database.js
git commit -m "feat(db): saved_prompts + saved_prompt_loras (user_version 8)"
```

---

## Task 2: IPC handlers for saved presets

**Files:**
- Create: `src/main/ipc/prompt-presets.js`
- Modify: `src/main/index.js`
- Modify: `src/main/preload.js`

Four handlers: `prompt:presets:list`, `:save`, `:delete`, `:rename`.

- [ ] **Step 1: Create the handler module**

```javascript
// src/main/ipc/prompt-presets.js
//
// IPC handlers for the Prompt Builder's saved presets.

const { ipcMain } = require('electron')
const { getDatabase } = require('../db/database')

function registerPromptPresetsHandlers() {
  ipcMain.handle('prompt:presets:list', () => {
    const db = getDatabase()
    const presets = db.prepare(`
      SELECT id, name, user_description, positive_text, negative_text,
             positive_structured, negative_structured, model_family,
             checkpoint_id, temperature, created_at
      FROM saved_prompts
      ORDER BY created_at DESC
    `).all()

    if (presets.length === 0) return []

    // Hydrate with applied LoRAs per preset.
    const loraStmt = db.prepare(`
      SELECT lora_id, lora_filename_snapshot, trigger_words_snapshot
      FROM saved_prompt_loras
      WHERE saved_prompt_id = ?
    `)
    for (const p of presets) {
      p.loras = loraStmt.all(p.id)
    }
    return presets
  })

  ipcMain.handle('prompt:presets:save', (_e, args) => {
    const {
      name, sourceMessageId, userDescription,
      positiveText, negativeText, positiveStructured, negativeStructured,
      modelFamily, checkpointId, temperature, loras,
    } = args

    const db = getDatabase()
    return db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO saved_prompts (
          name, source_message_id, user_description,
          positive_text, negative_text, positive_structured, negative_structured,
          model_family, checkpoint_id, temperature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name,
        sourceMessageId || null,
        userDescription || null,
        positiveText,
        negativeText,
        positiveStructured,
        negativeStructured,
        modelFamily || null,
        checkpointId || null,
        typeof temperature === 'number' ? temperature : null
      )

      const presetId = result.lastInsertRowid

      if (Array.isArray(loras) && loras.length > 0) {
        const loraInsert = db.prepare(`
          INSERT INTO saved_prompt_loras (
            saved_prompt_id, lora_id, lora_filename_snapshot, trigger_words_snapshot
          ) VALUES (?, ?, ?, ?)
        `)
        for (const l of loras) {
          loraInsert.run(presetId, l.lora_id || null, l.filename || '(unknown)', l.trigger_words || '')
        }
      }

      return { ok: true, id: presetId }
    })()
  })

  ipcMain.handle('prompt:presets:delete', (_e, { id }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM saved_prompts WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('prompt:presets:rename', (_e, { id, name }) => {
    const db = getDatabase()
    db.prepare('UPDATE saved_prompts SET name = ? WHERE id = ?').run(name, id)
    return true
  })
}

module.exports = { registerPromptPresetsHandlers }
```

- [ ] **Step 2: Register in `index.js`**

After `registerPromptChatHandlers()`, add:

```javascript
const { registerPromptPresetsHandlers } = require('./ipc/prompt-presets')
// ...
  registerPromptPresetsHandlers()
```

(The `require` goes near the other prompt requires at the top, the call near the other registrations inside `whenReady`.)

- [ ] **Step 3: Expose in preload**

Open `src/main/preload.js`. Add a `presets` sub-namespace inside `prompt`:

```javascript
    presets: {
      list: () => ipcRenderer.invoke('prompt:presets:list'),
      save: (args) => ipcRenderer.invoke('prompt:presets:save', args),
      delete: (id) => ipcRenderer.invoke('prompt:presets:delete', { id }),
      rename: (id, name) => ipcRenderer.invoke('prompt:presets:rename', { id, name }),
    },
```

Insert it after the existing `messages` sub-namespace.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

DevTools:

```javascript
await window.forge.prompt.presets.list()       // → []
const r = await window.forge.prompt.presets.save({
  name: 'Test preset',
  positiveText: 'masterpiece, 1girl',
  negativeText: 'low quality',
  positiveStructured: '[]',
  negativeStructured: '[]',
  loras: [],
})
console.log(r)                                  // → { ok: true, id: 1 }
await window.forge.prompt.presets.list()       // → [{ id: 1, name: 'Test preset', ..., loras: [] }]
await window.forge.prompt.presets.delete(r.id)
await window.forge.prompt.presets.list()       // → []
```

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/prompt-presets.js src/main/index.js src/main/preload.js
git commit -m "feat(prompt): IPC for saved-presets list/save/delete/rename"
```

---

## Task 3: Replace Extras route with PromptBuilder route

**Files:**
- Create: `src/renderer/pages/PromptBuilder.jsx` (skeleton only — full shell in Task 4)
- Modify: `src/renderer/App.jsx`
- Modify: `src/renderer/components/Sidebar.jsx`
- Delete: `src/renderer/pages/Extras.jsx`

This task only swaps the routing. The pane is just a stub that says "Prompt Builder pane coming up." — the actual layout is Task 4.

- [ ] **Step 1: Create the stub `PromptBuilder.jsx`**

```javascript
// src/renderer/pages/PromptBuilder.jsx
import React from 'react'

export default function PromptBuilder() {
  return (
    <div className="flex items-center justify-center h-full" style={{ color: '#635c48' }}>
      <p className="text-sm">Prompt Builder — wiring up.</p>
    </div>
  )
}
```

- [ ] **Step 2: Update `App.jsx`**

Open `src/renderer/App.jsx`. Find:

```javascript
import Extras from './pages/Extras.jsx'
```

Replace with:

```javascript
import PromptBuilder from './pages/PromptBuilder.jsx'
```

Then find:

```jsx
<Route path="/extras" element={<Extras />} />
```

Replace with:

```jsx
<Route path="/prompt" element={<PromptBuilder />} />
```

- [ ] **Step 3: Update `Sidebar.jsx`**

Open `src/renderer/components/Sidebar.jsx`. Find:

```javascript
  { icon: '📝',  label: 'Extras',    to: '/extras' },
```

Replace with:

```javascript
  { icon: '✨',  label: 'Prompt',    to: '/prompt' },
```

- [ ] **Step 4: Delete the old Extras page**

```bash
rm src/renderer/pages/Extras.jsx
```

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Sidebar should now show "✨ Prompt" where "📝 Extras" used to be. Clicking it should navigate to `/prompt` and show "Prompt Builder — wiring up." in the empty pane.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer/pages/PromptBuilder.jsx src/renderer/App.jsx src/renderer/components/Sidebar.jsx src/renderer/pages/Extras.jsx
git commit -m "feat(prompt): replace Extras route with PromptBuilder pane (stub)"
```

---

## Task 4: Pane shell with three-column layout

**Files:**
- Modify: `src/renderer/pages/PromptBuilder.jsx`

Build the structural shell: three columns (220px / flex / 270px), top bar with title and `Saved`/`New chat` buttons, no child component logic yet. The child components in subsequent tasks will be placeholders for now.

- [ ] **Step 1: Rewrite `PromptBuilder.jsx` with the shell**

```javascript
// src/renderer/pages/PromptBuilder.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../context/ToastContext.jsx'

export default function PromptBuilder() {
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const showToast = useToast()

  const reloadSessions = useCallback(async () => {
    const list = await window.forge.prompt.sessions.list()
    setSessions(list)
    if (!activeSessionId && list.length > 0) {
      setActiveSessionId(list[0].id)
    }
  }, [activeSessionId])

  useEffect(() => { reloadSessions() }, [reloadSessions])

  const newChat = async () => {
    const s = await window.forge.prompt.sessions.new()
    await reloadSessions()
    setActiveSessionId(s.id)
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0f0e0b' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between flex-shrink-0 px-5 py-3" style={{ borderBottom: '1px solid #302c1e' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Prompt Builder
          </h1>
          <p className="text-[10px]" style={{ color: '#635c48' }}>DeepSeek · Danbooru tag style</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={newChat}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ↺ New chat
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ⎘ Saved
          </button>
        </div>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Tag Library */}
        <div className="flex flex-col flex-shrink-0" style={{ width: '220px', background: '#0f0e0b', borderRight: '1px solid #302c1e' }}>
          <div className="p-4 text-xs" style={{ color: '#635c48' }}>Tag Library</div>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ color: '#635c48' }}>(placeholder)</div>
        </div>

        {/* Center: Chat */}
        <div className="flex flex-col flex-1 min-w-0" style={{ background: '#0f0e0b' }}>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ color: '#635c48' }}>
            {activeSessionId ? `Chat session ${activeSessionId} (placeholder transcript)` : 'No session — click "New chat" to start.'}
          </div>
          <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: '#302c1e' }}>
            <div className="text-xs" style={{ color: '#635c48' }}>Input dock (placeholder)</div>
          </div>
        </div>

        {/* Right: LoRA Picker */}
        <div className="flex flex-col flex-shrink-0" style={{ width: '270px', background: '#0f0e0b', borderLeft: '1px solid #302c1e' }}>
          <div className="p-4 text-xs" style={{ color: '#635c48' }}>LoRAs</div>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ color: '#635c48' }}>(placeholder)</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Open `/prompt` (sidebar → ✨ Prompt). Confirm:
- Three columns visible (220/flex/270 widths).
- Top bar shows title + "↺ New chat" + "⎘ Saved" buttons.
- Click "New chat" — should create a session and the center column should say "Chat session N (placeholder transcript)".
- The columns are independently scrollable (placeholders for now).

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/PromptBuilder.jsx
git commit -m "feat(prompt): three-column pane shell with top bar and session state"
```

---

## Task 5: Tag category color mapping

**Files:**
- Create: `src/renderer/lib/prompt-tag-categories.js`

The AI emits 12 categories; we collapse them to 5 display colors. This is a small constants module.

- [ ] **Step 1: Create the module**

```javascript
// src/renderer/lib/prompt-tag-categories.js
//
// The AI's structured response emits one of 12 categories per tag.
// The renderer collapses them onto a smaller set of display colors.

// Each color group: { fg (text color), bg (background), border? (optional, for LoRA dash) }
const COLORS = {
  quality:  { fg: '#c678dd', bg: 'rgba(198, 120, 221, 0.18)' },           // purple
  subject:  { fg: '#7aa0e8', bg: 'rgba(122, 160, 232, 0.18)' },           // blue
  style:    { fg: '#e8c820', bg: 'rgba(232, 200, 32, 0.15)' },             // yellow
  camera:   { fg: '#56b6c2', bg: 'rgba(86, 182, 194, 0.18)' },             // cyan
  scene:    { fg: '#d19a66', bg: 'rgba(209, 154, 102, 0.18)' },           // orange
  neutral:  { fg: '#bfb8a8', bg: '#242118' },                              // grey fallback
  negative: { fg: '#e06c75', bg: 'rgba(224, 108, 117, 0.18)' },           // red-coral (negative block)
  lora:     { fg: '#ff6b6b', bg: 'rgba(232, 80, 80, 0.18)', border: 'rgba(232, 80, 80, 0.4)' }, // LoRA red
}

// AI category → color group
const CATEGORY_TO_COLOR = {
  quality:     'quality',
  subject:     'subject',
  anatomy:     'subject',
  expression:  'subject',
  clothing:    'subject',
  style:       'style',
  lighting:    'style',
  camera:      'camera',
  composition: 'camera',
  scene:       'scene',
  pose:        'scene',
  other:       'neutral',
}

// Look up colors for a tag object: { tag, type, category, lora_id? }
function colorsFor(tagItem, isNegativeBlock = false) {
  if (tagItem.type === 'lora_trigger') return COLORS.lora
  if (isNegativeBlock) return COLORS.negative
  const group = CATEGORY_TO_COLOR[tagItem.category] || 'neutral'
  return COLORS[group]
}

module.exports = { COLORS, CATEGORY_TO_COLOR, colorsFor }
```

- [ ] **Step 2: Quick verify**

```bash
node -e "const m = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/renderer/lib/prompt-tag-categories'); console.log(m.colorsFor({tag:'1girl',type:'danbooru',category:'subject'}))"
```

Expected: prints the blue color object.

```bash
node -e "const m = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/renderer/lib/prompt-tag-categories'); console.log(m.colorsFor({tag:'cinematicMood',type:'lora_trigger'}))"
```

Expected: prints the LoRA red color object with a border.

Note: this file uses `module.exports` (CommonJS) but is in `src/renderer/`. Vite handles both syntaxes — if you prefer ESM, you can use `export { COLORS, CATEGORY_TO_COLOR, colorsFor }` instead. Match the rest of `src/renderer/lib/` (the `model-families.js` and `motion.js` modules use ESM).

**Use ESM:** rewrite the module exports as:

```javascript
export const COLORS = {/*...*/}
export const CATEGORY_TO_COLOR = {/*...*/}
export function colorsFor(tagItem, isNegativeBlock = false) {/*...*/}
```

Verify via Vite-compatible import:

```bash
node --input-type=module -e "
const { colorsFor } = await import('/Users/ibraheemfiraz/Desktop/ForgeProject/src/renderer/lib/prompt-tag-categories.js')
console.log(colorsFor({tag:'1girl', type:'danbooru', category:'subject'}))
console.log(colorsFor({tag:'cinematicMood', type:'lora_trigger'}))
"
```

Both color objects should print.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/prompt-tag-categories.js
git commit -m "feat(prompt): tag category → display color mapping module"
```

---

## Task 6: AssistantMessage component (renders one AI response)

**Files:**
- Create: `src/renderer/components/prompt/AssistantMessage.jsx`

Renders a single assistant message: header with "+ Positive · latest" label + Copy/Save ghost buttons, then the positive tag chips, then "− Negative" header + Copy, then negative chips, then the LoRA addendum if any.

This is a pure presentational component — it receives a parsed message object and renders it. The actual Copy/Save handler logic lives in the parent (ChatTranscript).

- [ ] **Step 1: Create directory**

```bash
mkdir -p src/renderer/components/prompt
```

- [ ] **Step 2: Create the component**

```javascript
// src/renderer/components/prompt/AssistantMessage.jsx
import React from 'react'
import { colorsFor } from '../../lib/prompt-tag-categories.js'

function TagChip({ item, isNegative = false }) {
  const c = colorsFor(item, isNegative)
  const style = {
    background: c.bg,
    color: c.fg,
    padding: '3px 7px',
    fontSize: '10px',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    margin: '2px',
    display: 'inline-block',
    border: c.border ? `1px dashed ${c.border}` : '1px solid transparent',
    fontWeight: item.type === 'lora_trigger' ? 600 : 400,
  }
  return <span style={style}>{item.tag}</span>
}

function GhostButton({ icon, label, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 transition-colors"
      style={{
        background: 'transparent',
        border: 0,
        color: '#8a8268',
        padding: '4px 6px',
        borderRadius: '6px',
        fontSize: '11px',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(232,200,32,0.08)'; e.currentTarget.style.color = '#e8c820' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8a8268' }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
)

const SaveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
  </svg>
)

export default function AssistantMessage({
  message,         // the raw message row from prompt:messages:list
  isLatest,
  onCopy,          // (text) => void — parent does the clipboard write + toast
  onSave,          // () => void — parent opens the save flow
}) {
  let structured = null
  try {
    structured = JSON.parse(message.structured_response || 'null')
  } catch {}

  if (!structured) {
    // Error or malformed — show raw content.
    return (
      <div style={{ background: '#1a1813', border: '1px solid #302c1e', borderRadius: '12px 12px 12px 4px', padding: 14, maxWidth: '88%' }}>
        <p style={{ fontSize: 12, color: '#e87068' }}>{message.content || 'Empty response'}</p>
      </div>
    )
  }

  const positive = structured.positive || []
  const negative = structured.negative || []
  const appliedLoras = positive.filter(t => t.type === 'lora_trigger')

  const positiveText = positive.map(t => t.tag).join(', ')
  const negativeText = negative.map(t => t.tag).join(', ')

  const highlightStyle = isLatest
    ? { borderColor: 'rgba(232,200,32,0.4)', boxShadow: '0 0 0 1px rgba(232,200,32,0.15)' }
    : {}

  return (
    <div
      style={{
        background: '#1a1813',
        border: '1px solid #302c1e',
        borderRadius: '12px 12px 12px 4px',
        padding: 14,
        maxWidth: '88%',
        ...highlightStyle,
      }}
    >
      {/* Positive header + Copy/Save */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e8c820', fontWeight: 600 }}>
          + Positive{isLatest ? ' · latest' : ''}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <GhostButton icon={<CopyIcon />} label="Copy" onClick={() => onCopy(positiveText)} title="Copy positive prompt" />
          <GhostButton icon={<SaveIcon />} label="Save" onClick={onSave} title="Save as preset" />
        </div>
      </div>

      {/* Positive tags */}
      <div style={{ marginBottom: 10 }}>
        {positive.map((item, i) => (
          <TagChip key={i} item={item} isNegative={false} />
        ))}
      </div>

      {/* Negative header + Copy */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e06c75', fontWeight: 600 }}>
          − Negative
        </span>
        <GhostButton icon={<CopyIcon />} label="Copy" onClick={() => onCopy(negativeText)} title="Copy negative prompt" />
      </div>

      {/* Negative tags */}
      <div>
        {negative.map((item, i) => (
          <TagChip key={i} item={item} isNegative={true} />
        ))}
      </div>

      {/* LoRA addendum (only when LoRAs applied) */}
      {appliedLoras.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #302c1e', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#635c48', fontWeight: 600 }}>
            LoRAs applied:
          </span>
          {appliedLoras.map((t, i) => (
            <span
              key={i}
              style={{
                fontSize: 10, color: '#8a8268', fontFamily: "'JetBrains Mono', monospace",
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <span>🎛</span>
              <span>{t.tag}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Smoke test (component-level)**

The component is pure — no end-to-end test needed at this stage. The render will be exercised by Task 7's transcript.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/prompt/AssistantMessage.jsx
git commit -m "feat(prompt): AssistantMessage component with categorized tag chips + LoRA addendum"
```

---

## Task 7: ChatTranscript component

**Files:**
- Create: `src/renderer/components/prompt/ChatTranscript.jsx`

Loads messages for the active session, renders user messages on the right (simple bubbles) and assistant messages on the left (via `AssistantMessage`). Shows a "searching tags…" indicator while a send is in flight.

- [ ] **Step 1: Create the component**

```javascript
// src/renderer/components/prompt/ChatTranscript.jsx
import React, { useEffect, useRef, useState } from 'react'
import AssistantMessage from './AssistantMessage.jsx'
import { useToast } from '../../context/ToastContext.jsx'

function UserBubble({ content }) {
  return (
    <div
      style={{
        background: '#242118',
        borderRadius: '12px 12px 4px 12px',
        padding: '10px 14px',
        maxWidth: '70%',
        alignSelf: 'flex-end',
        fontSize: 13,
        lineHeight: 1.5,
        color: '#eae5dc',
      }}
    >
      {content}
    </div>
  )
}

function ToolCallIndicator({ recentToolCall }) {
  if (!recentToolCall) return null
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        background: '#1a1813',
        border: '1px dashed #302c1e',
        borderRadius: '12px 12px 12px 4px',
        padding: '8px 12px',
        fontSize: 11,
        color: '#8a8268',
        maxWidth: '88%',
      }}
    >
      <span style={{ color: '#e8c820' }}>⌕</span> Searching tags for <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#e8c820' }}>{recentToolCall.query}</span>… ({recentToolCall.results_count} matches)
    </div>
  )
}

export default function ChatTranscript({ sessionId, inFlight, recentToolCall, onSavePreset, refreshTick }) {
  const [messages, setMessages] = useState([])
  const showToast = useToast()
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!sessionId) { setMessages([]); return }
    let cancelled = false
    window.forge.prompt.messages.list(sessionId).then((rows) => {
      if (!cancelled) setMessages(rows)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [sessionId, refreshTick])

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, inFlight])

  const copyToClipboard = async (text) => {
    if (!text) { showToast('Nothing to copy.'); return }
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied.')
    } catch {
      showToast("Couldn't copy.")
    }
  }

  const assistantMessages = messages.filter(m => m.role === 'assistant')
  const latestAssistantId = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].id : null

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#0f0e0b',
      }}
    >
      {messages.length === 0 && !inFlight && (
        <div style={{ alignSelf: 'center', marginTop: 60, textAlign: 'center', color: '#635c48' }}>
          <p style={{ fontSize: 13 }}>Describe an image below to generate a prompt.</p>
        </div>
      )}

      {messages.map((m) => {
        if (m.role === 'user') return <UserBubble key={m.id} content={m.content || ''} />
        if (m.role === 'assistant') {
          return (
            <div key={m.id} style={{ alignSelf: 'flex-start', display: 'flex' }}>
              <AssistantMessage
                message={m}
                isLatest={m.id === latestAssistantId}
                onCopy={copyToClipboard}
                onSave={() => onSavePreset(m)}
              />
            </div>
          )
        }
        return null
      })}

      {inFlight && <ToolCallIndicator recentToolCall={recentToolCall} />}
    </div>
  )
}
```

- [ ] **Step 2: Smoke test (later)**

The transcript can't be visually tested in isolation. It'll be wired into PromptBuilder in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/prompt/ChatTranscript.jsx
git commit -m "feat(prompt): ChatTranscript with user bubbles, assistant cards, tool-call indicator"
```

---

## Task 8: InputDock component + LoRAPicker + TagLibraryPanel

**Files:**
- Create: `src/renderer/components/prompt/InputDock.jsx`
- Create: `src/renderer/components/prompt/LoRAPicker.jsx`
- Create: `src/renderer/components/prompt/TagLibraryPanel.jsx`

Three components in one task because they're all relatively small. (If the implementer prefers, can be three commits — but for plan brevity, one commit.)

- [ ] **Step 1: Create `InputDock.jsx`**

```javascript
// src/renderer/components/prompt/InputDock.jsx
import React, { useState, useEffect } from 'react'

export default function InputDock({ selectedLoras, onRemoveLora, onSend, inFlight, defaultTemp }) {
  const [text, setText] = useState('')
  const [temp, setTemp] = useState(defaultTemp || 1.0)

  useEffect(() => {
    setTemp(defaultTemp || 1.0)
  }, [defaultTemp])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || inFlight) return
    onSend({ userMessage: trimmed, temperature: temp })
    setText('')
  }

  const handleKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ padding: '14px 18px 18px', borderTop: '1px solid #302c1e', background: '#0d0c09' }}>
      {/* Selected LoRA pills */}
      {selectedLoras && selectedLoras.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {selectedLoras.map((l) => (
            <span
              key={l.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 9px',
                background: 'rgba(125, 170, 136, 0.18)',
                color: '#7daa88',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              🎛 {l.name}
              <span
                onClick={() => onRemoveLora(l.id)}
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 13, lineHeight: 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = 1 }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6 }}
              >
                ×
              </span>
            </span>
          ))}
        </div>
      )}

      <div style={{ background: '#1a1813', border: '1px solid #302c1e', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe your image in any way — narrative, paragraph, vibe, whatever feels natural… (⌘/Ctrl+Enter to send)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 0,
              color: '#eae5dc',
              fontSize: 13,
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              minHeight: 38,
              maxHeight: 200,
              fontFamily: 'Figtree, sans-serif',
            }}
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || inFlight}
            style={{
              background: !text.trim() || inFlight ? '#302c1e' : '#e8c820',
              color: !text.trim() || inFlight ? '#635c48' : '#0f0e0b',
              fontWeight: 700,
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 6,
              border: 0,
              cursor: !text.trim() || inFlight ? 'not-allowed' : 'pointer',
            }}
          >
            {inFlight ? 'Sending…' : 'Send ▸'}
          </button>
        </div>

        {/* Temp + model badges */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #302c1e' }}>
          <span style={{ display: 'inline-flex', gap: 4, fontSize: 10, color: '#bfb8a8' }}>
            ⬡ DeepSeek
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#8a8268', fontWeight: 600 }}>Temp</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temp}
              onChange={(e) => setTemp(parseFloat(e.target.value))}
              style={{ accentColor: '#e8c820', width: 90 }}
            />
            <span style={{ fontSize: 10, color: '#e8c820', fontFamily: "'JetBrains Mono', monospace", minWidth: 28 }}>
              {temp.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `LoRAPicker.jsx`**

```javascript
// src/renderer/components/prompt/LoRAPicker.jsx
import React, { useState, useEffect } from 'react'

export default function LoRAPicker({ selectedIds, onToggle }) {
  const [loras, setLoras] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.forge.loras.list().then(setLoras).catch(() => {})
  }, [])

  const filtered = loras.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.trigger_words || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, color: '#eae5dc' }}>LoRAs</div>
        <span style={{ fontSize: 10, color: '#7daa88', fontWeight: 600 }}>
          {selectedIds.size} selected
        </span>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search your LoRAs…"
        style={{
          width: '100%',
          background: '#1a1813',
          border: '1px solid #302c1e',
          color: '#bfb8a8',
          padding: '6px 8px',
          borderRadius: 4,
          fontSize: 11,
          marginBottom: 10,
          outline: 'none',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 && (
          <p style={{ fontSize: 11, color: '#635c48', fontStyle: 'italic' }}>No LoRAs match.</p>
        )}
        {filtered.map((l) => {
          const isSelected = selectedIds.has(l.id)
          const noTriggers = !(l.trigger_words || '').trim()
          return (
            <div
              key={l.id}
              onClick={() => onToggle(l.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: isSelected ? 'rgba(125, 170, 136, 0.12)' : 'transparent',
                border: isSelected ? '1px solid rgba(125, 170, 136, 0.3)' : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: l.status === 'offline' ? 0.45 : 1,
                transition: 'background .12s',
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: isSelected ? 'none' : '1.5px solid #4a4530',
                  borderRadius: 3,
                  background: isSelected ? '#7daa88' : 'transparent',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0f0e0b',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {isSelected ? '✓' : ''}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: isSelected ? '#eae5dc' : '#bfb8a8', fontWeight: 500 }}>
                  {l.name}
                </div>
                <div style={{ fontSize: 9, color: '#635c48', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                  {noTriggers ? 'no trigger words set' : `trigger: ${l.trigger_words}`}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `TagLibraryPanel.jsx`**

```javascript
// src/renderer/components/prompt/TagLibraryPanel.jsx
import React, { useState, useEffect } from 'react'

// Categories with curated quick-access tags — these are popular Danbooru tags.
// Clicking a tag inserts it into the chat input (calls onInsertTag prop).
const CURATED = [
  { label: 'Subject', tags: ['1girl', 'solo', 'portrait', 'looking at viewer', 'upper body', 'full body'] },
  { label: 'Style',   tags: ['cinematic', 'photorealistic', 'moody', 'golden hour', 'soft lighting'] },
  { label: 'Camera',  tags: ['bokeh', 'depth of field', 'close-up', 'from above', 'from below'] },
  { label: 'Quality', tags: ['masterpiece', 'best quality', 'highres', 'absurdres'] },
]

export default function TagLibraryPanel({ onInsertTag }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [libraryCount, setLibraryCount] = useState(0)

  useEffect(() => {
    window.forge.prompt.libraryStatus().then((s) => setLibraryCount(s.count || 0)).catch(() => {})
  }, [])

  // Debounced search
  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    setSearching(true)
    const handle = setTimeout(async () => {
      try {
        const r = await window.forge.prompt.searchTags(search.trim(), { limit: 30 })
        setResults(r)
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [search])

  const insert = (tag) => onInsertTag && onInsertTag(tag)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, color: '#eae5dc' }}>Tag Library</div>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={libraryCount > 0 ? `Search ${libraryCount.toLocaleString()} tags…` : 'Library not downloaded'}
        disabled={libraryCount === 0}
        style={{
          width: '100%',
          background: '#1a1813',
          border: '1px solid #302c1e',
          color: '#bfb8a8',
          padding: '6px 8px',
          borderRadius: 4,
          fontSize: 11,
          marginBottom: 12,
          outline: 'none',
        }}
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {search.trim() ? (
          <div>
            {searching && <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic' }}>Searching…</p>}
            {!searching && results.length === 0 && <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic' }}>No matches.</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {results.map((t) => (
                <span
                  key={t.id}
                  onClick={() => insert(t.name)}
                  style={{
                    padding: '3px 7px',
                    fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: 'rgba(122, 160, 232, 0.18)',
                    color: '#7aa0e8',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  title={`${t.post_count.toLocaleString()} posts`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          CURATED.map((group) => (
            <div key={group.label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#8a8268', fontWeight: 600, marginBottom: 4 }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {group.tags.map((tag) => (
                  <span
                    key={tag}
                    onClick={() => insert(tag)}
                    style={{
                      padding: '3px 7px',
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      background: 'rgba(122, 160, 232, 0.18)',
                      color: '#7aa0e8',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic', marginTop: 8 }}>
        Click any tag to drop it into your message →
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/prompt/InputDock.jsx src/renderer/components/prompt/LoRAPicker.jsx src/renderer/components/prompt/TagLibraryPanel.jsx
git commit -m "feat(prompt): InputDock, LoRAPicker, TagLibraryPanel components"
```

---

## Task 9: Wire it all into PromptBuilder

**Files:**
- Modify: `src/renderer/pages/PromptBuilder.jsx`

Replace the Task-4 stub shell with the full integration: chat transcript in the center, tag library on the left, LoRA picker on the right, input dock at the bottom. Wire send flow, tool-call event subscription, tag-insert from left panel, LoRA selection from right panel.

- [ ] **Step 1: Rewrite `PromptBuilder.jsx` with full integration**

```javascript
// src/renderer/pages/PromptBuilder.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import ChatTranscript from '../components/prompt/ChatTranscript.jsx'
import InputDock from '../components/prompt/InputDock.jsx'
import LoRAPicker from '../components/prompt/LoRAPicker.jsx'
import TagLibraryPanel from '../components/prompt/TagLibraryPanel.jsx'

export default function PromptBuilder() {
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedLoraIds, setSelectedLoraIds] = useState(() => new Set())
  const [loraNamesById, setLoraNamesById] = useState(() => new Map())
  const [inFlight, setInFlight] = useState(false)
  const [recentToolCall, setRecentToolCall] = useState(null)
  const [defaultTemp, setDefaultTemp] = useState(1.0)
  const [transcriptTick, setTranscriptTick] = useState(0)
  const showToast = useToast()
  const insertTagRef = useRef(null)

  // Load sessions + defaults on mount.
  useEffect(() => {
    window.forge.prompt.sessions.list().then((list) => {
      setSessions(list)
      if (list.length > 0) setActiveSessionId(list[0].id)
    }).catch(() => {})
    window.forge.settings.get('prompt_default_temperature').then((v) => {
      if (v) setDefaultTemp(parseFloat(v))
    }).catch(() => {})
  }, [])

  // Load LoRA names so we can show pills.
  useEffect(() => {
    window.forge.loras.list().then((rows) => {
      const m = new Map()
      for (const r of rows) m.set(r.id, r)
      setLoraNamesById(m)
    }).catch(() => {})
  }, [])

  // Subscribe to tool-call events while in flight.
  useEffect(() => {
    const handler = (payload) => {
      setRecentToolCall({ query: payload.query, results_count: payload.results_count })
    }
    window.forge.on('prompt:tool-call', handler)
    return () => window.forge.off('prompt:tool-call', handler)
  }, [])

  const reloadSessions = useCallback(async () => {
    const list = await window.forge.prompt.sessions.list()
    setSessions(list)
  }, [])

  const newChat = async () => {
    const s = await window.forge.prompt.sessions.new()
    setActiveSessionId(s.id)
    setSelectedLoraIds(new Set())
    await reloadSessions()
  }

  const toggleLora = (id) => {
    setSelectedLoraIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const removeLora = (id) => {
    setSelectedLoraIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleInsertTag = (tag) => {
    if (insertTagRef.current) insertTagRef.current(tag)
  }

  const handleSend = async ({ userMessage, temperature }) => {
    if (inFlight) return
    setInFlight(true)
    setRecentToolCall(null)
    try {
      const result = await window.forge.prompt.send({
        sessionId: activeSessionId,
        userMessage,
        checkpointId: null,  // v1: no checkpoint picker in the pane — falls back to 'other' family
        loraIds: Array.from(selectedLoraIds),
        temperature,
      })

      if (result.ok) {
        if (!activeSessionId) setActiveSessionId(result.sessionId)
        await reloadSessions()
        setTranscriptTick(t => t + 1)
      } else {
        showToast(`Send failed: ${result.reason}`)
        // Still refresh transcript so the user sees the persisted error message.
        setTranscriptTick(t => t + 1)
      }
    } catch (err) {
      showToast(`Send error: ${err.message || err}`)
    } finally {
      setInFlight(false)
      setRecentToolCall(null)
    }
  }

  const handleSavePreset = (assistantMessage) => {
    // Open a name prompt and save. Simple inline prompt for v1.
    const name = window.prompt('Save this prompt as:', 'Untitled preset')
    if (!name) return
    let structured = null
    try { structured = JSON.parse(assistantMessage.structured_response || 'null') } catch {}
    if (!structured) { showToast('Cannot save — malformed response.'); return }

    const positive = structured.positive || []
    const negative = structured.negative || []
    const loraTriggers = positive.filter(t => t.type === 'lora_trigger')

    const lorasSnapshot = loraTriggers.map(t => {
      const row = loraNamesById.get(t.lora_id)
      return {
        lora_id: t.lora_id,
        filename: row ? (row.file_path ? row.file_path.split('/').pop() : row.name) : '(unknown)',
        trigger_words: t.tag,
      }
    })

    window.forge.prompt.presets.save({
      name,
      sourceMessageId: assistantMessage.id,
      userDescription: null,
      positiveText: positive.map(t => t.tag).join(', '),
      negativeText: negative.map(t => t.tag).join(', '),
      positiveStructured: JSON.stringify(positive),
      negativeStructured: JSON.stringify(negative),
      modelFamily: assistantMessage.model_family || null,
      checkpointId: null,
      temperature: assistantMessage.temperature,
      loras: lorasSnapshot,
    }).then((r) => {
      if (r.ok) showToast(`Saved "${name}".`)
      else showToast('Save failed.')
    }).catch(() => showToast('Save failed.'))
  }

  const selectedLorasArray = Array.from(selectedLoraIds).map(id => loraNamesById.get(id)).filter(Boolean)

  return (
    <div className="flex flex-col h-full" style={{ background: '#0f0e0b' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between flex-shrink-0 px-5 py-3" style={{ borderBottom: '1px solid #302c1e' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Prompt Builder
          </h1>
          <p className="text-[10px]" style={{ color: '#635c48' }}>
            DeepSeek · {sessions.length > 0 && activeSessionId ? `Session ${activeSessionId}` : 'No session yet'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={newChat}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ↺ New chat
          </button>
        </div>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-shrink-0" style={{ width: '220px', background: '#0f0e0b', borderRight: '1px solid #302c1e' }}>
          <TagLibraryPanel onInsertTag={handleInsertTag} />
        </div>

        <div className="flex flex-col flex-1 min-w-0" style={{ background: '#0f0e0b' }}>
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
        </div>

        <div className="flex-shrink-0" style={{ width: '270px', background: '#0f0e0b', borderLeft: '1px solid #302c1e' }}>
          <LoRAPicker
            selectedIds={selectedLoraIds}
            onToggle={toggleLora}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Extend `InputDock.jsx` to expose tag-insertion**

Open `src/renderer/components/prompt/InputDock.jsx`. Inside the function signature, accept the `insertTagRef` prop. After the `setText` useState declaration, register the insert handler:

```javascript
export default function InputDock({ selectedLoras, onRemoveLora, onSend, inFlight, defaultTemp, insertTagRef }) {
  const [text, setText] = useState('')
  const [temp, setTemp] = useState(defaultTemp || 1.0)

  // Expose tag-insertion to the parent.
  useEffect(() => {
    if (!insertTagRef) return
    insertTagRef.current = (tag) => {
      setText((prev) => (prev ? prev + ', ' : '') + tag)
    }
    return () => { insertTagRef.current = null }
  }, [insertTagRef])

  // ... rest of the component unchanged
```

(Adjust the existing `useEffect(() => { setTemp(defaultTemp || 1.0) }, [defaultTemp])` to be a SEPARATE effect from this new one.)

- [ ] **Step 3: Smoke test (without API key — at least confirm the UI renders without crashing)**

```bash
npm run dev
```

Navigate to `/prompt`. Confirm:
- All three columns render.
- The tag library left shows curated categories + a search box.
- The LoRA picker right shows your LoRAs.
- Clicking a tag from the left panel inserts it into the textarea (separated by ", ").
- Selecting a LoRA shows a sage-green pill above the textarea.
- Typing in the textarea + Send (without API key) toasts an error and the chat shows an error placeholder message.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/PromptBuilder.jsx src/renderer/components/prompt/InputDock.jsx
git commit -m "feat(prompt): wire pane — chat, tag library, LoRA picker, input dock, send flow"
```

---

## Task 10: First-launch guard and no-API-key banner

**Files:**
- Modify: `src/renderer/pages/PromptBuilder.jsx`

If the tag library isn't downloaded yet, show a centered card telling the user to go to Settings. If there's no API key, the Send button is disabled and a banner says so.

- [ ] **Step 1: Add status state + checks**

Inside the `PromptBuilder` component, after the existing state hooks, add:

```javascript
  const [libraryReady, setLibraryReady] = useState(true)
  const [apiKeySet, setApiKeySet] = useState(true)

  useEffect(() => {
    window.forge.prompt.libraryStatus().then((s) => setLibraryReady(s.indexed && s.count > 0)).catch(() => setLibraryReady(false))
    window.forge.prompt.hasApiKey().then(setApiKeySet).catch(() => setApiKeySet(false))
  }, [])
```

- [ ] **Step 2: Add the guard render**

Replace the `return (...)` block's three-column body with a conditional:

If `!libraryReady` OR `!apiKeySet`, show a centered card explaining what's missing. Otherwise show the normal three-column body.

Find the existing return JSX (the `<div className="flex flex-col h-full">` block). Inside, between the top bar and the three-column flex, add a guard:

```jsx
      {!libraryReady ? (
        <div className="flex flex-1 items-center justify-center" style={{ background: '#0f0e0b' }}>
          <div style={{ background: '#1a1813', border: '1px solid #302c1e', borderRadius: 12, padding: 28, maxWidth: 460, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 600, color: '#eae5dc', marginBottom: 8 }}>
              Tag library not downloaded
            </p>
            <p style={{ fontSize: 13, color: '#bfb8a8', marginBottom: 18, lineHeight: 1.5 }}>
              The Prompt Builder needs the local Danbooru tag library to ground the AI's choices. It's a one-time ~500 MB download and ~5 minute index.
            </p>
            <a
              href="#/settings"
              style={{
                display: 'inline-block',
                background: '#e8c820',
                color: '#0f0e0b',
                padding: '8px 16px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Go to Settings →
            </a>
          </div>
        </div>
      ) : (
        <>
          {!apiKeySet && (
            <div style={{ flexShrink: 0, padding: '10px 18px', background: 'rgba(232, 200, 32, 0.08)', borderBottom: '1px solid rgba(232, 200, 32, 0.3)' }}>
              <p style={{ fontSize: 12, color: '#e8c820' }}>
                ⚠ No DeepSeek API key set. <a href="#/settings" style={{ color: '#e8c820', textDecoration: 'underline' }}>Add one in Settings</a> to start generating prompts.
              </p>
            </div>
          )}

          <div className="flex flex-1 min-h-0">
            {/* ... existing three-column body unchanged ... */}
          </div>
        </>
      )}
```

Move the three existing column divs INSIDE that inner `<div className="flex flex-1 min-h-0">`.

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Scenarios to verify:
- With library populated + API key set: normal pane shows.
- With API key cleared (via Settings → Clear): banner appears at top of pane saying "⚠ No DeepSeek API key set."
- (Optional, destructive) If you delete the tag library: pane shows the "Tag library not downloaded" card with a "Go to Settings" button.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/PromptBuilder.jsx
git commit -m "feat(prompt): library + API-key guard states for the pane"
```

---

## Task 11: Saved presets drawer

**Files:**
- Create: `src/renderer/components/prompt/SavedPresetsDrawer.jsx`
- Modify: `src/renderer/pages/PromptBuilder.jsx`

A simple modal lists saved presets with Load + Delete actions. Load doesn't re-run the AI — it just shows the snapshot in a read-only view (or copies the positive/negative text). For v1, Load = copy positive to clipboard + toast.

- [ ] **Step 1: Create the drawer**

```javascript
// src/renderer/components/prompt/SavedPresetsDrawer.jsx
import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../../context/ToastContext.jsx'

export default function SavedPresetsDrawer({ isOpen, onClose }) {
  const [presets, setPresets] = useState([])
  const showToast = useToast()

  const reload = () => {
    window.forge.prompt.presets.list().then(setPresets).catch(() => {})
  }

  useEffect(() => { if (isOpen) reload() }, [isOpen])

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied.')
    } catch { showToast("Couldn't copy.") }
  }

  const remove = async (id, name) => {
    if (!window.confirm(`Delete preset "${name}"?`)) return
    await window.forge.prompt.presets.delete(id)
    reload()
    showToast('Deleted.')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="rounded-xl p-6 w-[640px] max-h-[80vh] overflow-y-auto shadow-2xl"
            style={{ background: '#1a1813', border: '1px solid #302c1e' }}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold mb-1" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              Saved Presets
            </h2>
            <p className="text-xs mb-5" style={{ color: '#635c48' }}>
              Generated prompts you've archived. Click Copy Positive to send the prompt to your clipboard.
            </p>

            {presets.length === 0 ? (
              <p className="text-sm" style={{ color: '#635c48' }}>No presets yet — click Save on a generated prompt to start.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {presets.map(p => (
                  <div key={p.id} className="rounded-lg p-4" style={{ background: '#242118', border: '1px solid #302c1e' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium" style={{ color: '#eae5dc' }}>{p.name}</p>
                      <p className="text-[10px]" style={{ color: '#635c48' }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-[11px] font-mono mb-2" style={{ color: '#bfb8a8', lineHeight: 1.5 }}>
                      {p.positive_text.length > 220 ? p.positive_text.slice(0, 220) + '…' : p.positive_text}
                    </p>
                    {p.loras && p.loras.length > 0 && (
                      <p className="text-[10px] mb-3" style={{ color: '#635c48' }}>
                        🎛 {p.loras.map(l => l.lora_filename_snapshot).join(' · ')}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => copy(p.positive_text)}
                        className="px-3 py-1.5 rounded text-xs"
                        style={{ background: '#e8c820', color: '#0f0e0b', fontWeight: 600 }}
                      >
                        Copy positive
                      </button>
                      <button
                        onClick={() => copy(p.negative_text)}
                        className="px-3 py-1.5 rounded text-xs"
                        style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
                      >
                        Copy negative
                      </button>
                      <button
                        onClick={() => remove(p.id, p.name)}
                        className="px-3 py-1.5 rounded text-xs ml-auto"
                        style={{ background: '#2a1010', color: '#e87068' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Wire the drawer into `PromptBuilder.jsx`**

Open `src/renderer/pages/PromptBuilder.jsx`. Add the import:

```javascript
import SavedPresetsDrawer from '../components/prompt/SavedPresetsDrawer.jsx'
```

Add state:

```javascript
  const [presetsOpen, setPresetsOpen] = useState(false)
```

Replace the existing "↺ New chat" button block with both buttons:

```jsx
        <div className="flex gap-2">
          <button
            onClick={newChat}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ↺ New chat
          </button>
          <button
            onClick={() => setPresetsOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ⎘ Saved
          </button>
        </div>
```

At the bottom of the component, before the closing `</div>` of the outermost wrapper, add:

```jsx
      <SavedPresetsDrawer isOpen={presetsOpen} onClose={() => setPresetsOpen(false)} />
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Navigate to `/prompt`. Click the `⎘ Saved` button. The drawer should open showing either "No presets yet" or a list of presets (if you saved any in earlier testing). Try Copy positive → should put text on clipboard + toast. Try Delete → window.confirm shows up, click OK, preset disappears.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/prompt/SavedPresetsDrawer.jsx src/renderer/pages/PromptBuilder.jsx
git commit -m "feat(prompt): SavedPresetsDrawer modal with copy + delete"
```

---

## Task 12: Update CLAUDE.md and end-to-end verification

**Files:**
- Modify: `CLAUDE.md`

### Step 1: Update CLAUDE.md

- [ ] **Step 1.1: Bump schema version to 8**

Edit the line `(current version: 7)` → `(current version: 8)`.

- [ ] **Step 1.2: Add the Prompt Builder pane reference**

In the architecture / renderer pages section, add a sentence noting that the Prompt Builder pane lives at `/prompt` and uses the IPC surface from Plans 1-3 plus the saved-presets IPC. Specifically, find the line in the `db/schema.sql` bullet that ends with the chat-tables note, and APPEND:

```
The pane itself lives at `src/renderer/pages/PromptBuilder.jsx` with child components under `src/renderer/components/prompt/`. Generated prompts can be archived to `saved_prompts` (with `saved_prompt_loras` snapshotting LoRA trigger words at save time, so renaming a LoRA's triggers later doesn't corrupt old presets).
```

- [ ] **Step 1.3: Commit the doc update**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document Prompt Builder pane and schema version 8"
```

### Step 2: End-to-end UI verification (hand to user)

This step is interactive and the controller should hand off to the user. The implementer can verify nothing crashes by starting the dev server and confirming no errors, but the actual UX validation needs the user:

- [ ] **Smoke test (implementer): `npm run dev`, navigate to `/prompt`, confirm no React errors in DevTools.**

- [ ] **Hand-off to user with this script:**

> 1. `npm run dev`. Open Prompt (sidebar ✨).
> 2. The pane should load with three columns: tag library (left), chat (center), LoRAs (right).
> 3. If you haven't set an API key, see the yellow banner at top. If the tag library is empty, see the centered "not downloaded" card.
> 4. Type "moody redhead portrait at sunset on a rooftop" and press Send (or ⌘/Ctrl+Enter).
> 5. The chat should show a user bubble on the right, then a "searching tags…" indicator below it (with the AI's tool-call query streaming), then ~10 seconds later the structured AI response with colored tag chips appears.
> 6. Click Copy on the positive — check clipboard.
> 7. Click Save → enter a preset name → toast.
> 8. Click `⎘ Saved` in top bar → drawer opens showing your preset.
> 9. Pick a LoRA from the right panel → it appears as a sage-green pill above the textarea. Send another message. The AI's response should include that LoRA's trigger words in red.
> 10. Quit the app, reopen — the chat history should still be there.

---

## Self-Review checklist

- **Spec coverage:** Pane layout (Task 4), tag chips by category (Task 5/6), LoRA picker (Task 8), input dock with selected pills (Task 8), saved presets (Task 1+2+11), first-launch guard (Task 10).
- **Placeholder scan:** No "TBD" / "TODO" / unfinished sections.
- **Type consistency:**
  - The structured response shape `{ positive: [{tag, type, category, lora_id?}], negative: [...] }` is consumed by `AssistantMessage` and `colorsFor` consistently.
  - `selectedLoraIds` is a `Set<number>` throughout.
  - IPC channel names use `:` separator convention (matches existing handlers).

## Out-of-scope for Plan 4

- Reusing a saved preset to seed a new chat session (just clipboard copy in v1).
- Streaming token output during AI generation (deferred — request/response is fine).
- Drag-to-reorder presets.
- Tag autocomplete in the textarea.
- A checkpoint picker in the input dock (uses `null` checkpointId for v1 — the AI uses the `other` family fallback; user can classify a default checkpoint later via Settings or the next plan).
- "Stop generation" button (no streaming, nothing to stop).
- Auto-titling sessions via a second AI call.
