# Prompt Builder — Plan 3: DeepSeek AI Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire DeepSeek as the LLM provider for the Prompt Builder. The AI receives a user's natural-language description plus selected-LoRA context, calls the local `search_tags` tool repeatedly to ground its choices in the real Danbooru tag library (Plan 2), then emits a structured JSON response with positive + negative tag arrays. Chat sessions persist across app restarts. By the end of this plan, the user can call `window.forge.prompt.send(...)` from DevTools and get back a valid prompt — even though the pane UI doesn't exist yet (Plan 4).

**Architecture:** A thin DeepSeek client wraps the OpenAI-compatible chat completions endpoint. A tool-loop runner declares one tool (`search_tags`) and re-feeds tool results back to the model until it emits a final JSON response (enforced via `response_format: json_object`). System prompts live as plain JS modules with a base prompt + per-model-family suffix. API keys are encrypted via Electron's `safeStorage` (OS keychain on macOS, DPAPI on Windows, libsecret on Linux). Chat sessions and messages are stored in SQLite for cross-session persistence.

**Tech Stack:** Native `fetch` for DeepSeek API, Electron `safeStorage`, better-sqlite3, OpenAI-compatible chat completions + function calling + JSON mode.

**Reference spec:** [docs/superpowers/specs/2026-05-13-prompt-builder-design.md](../specs/2026-05-13-prompt-builder-design.md) sections "AI integration", "Schema migration", "IPC contract", "Settings additions", "Error handling".

---

## File Structure

**Files to create (main process):**
- `src/main/ai/deepseek-client.js` — Thin wrapper around DeepSeek's `/v1/chat/completions` endpoint. Handles auth header, JSON-mode `response_format`, tool declarations, and surface errors. No streaming in this module — keep it request/response for simplicity in v1.
- `src/main/ai/tool-loop.js` — Orchestrates the multi-turn function-calling loop. Declares `search_tags` as a tool, executes calls against the local search backend, re-feeds results back to DeepSeek, terminates on final JSON response (or hard cap of 8 tool calls).
- `src/main/ai/system-prompts/base.js` — Returns the base system prompt (the Danbooru-style rules synthesized from the research).
- `src/main/ai/system-prompts/families.js` — Per-model-family quality/negative suffixes. Indexed by the same 8 family enum values as Plan 1.
- `src/main/ai/system-prompts/index.js` — Composes base + family-specific suffix into a single system message string, and adds the LoRA context block when LoRAs are selected.
- `src/main/ipc/prompt-chat.js` — IPC handlers for `prompt:send`, `prompt:sessions:list`, `prompt:sessions:new`, `prompt:sessions:delete`, `prompt:sessions:rename`, `prompt:messages:list`.

**Files to modify (main process):**
- `src/main/db/schema.sql` — Add `prompt_chat_sessions` and `prompt_chat_messages` tables.
- `src/main/db/database.js` — Bump `user_version` from 6 → 7.
- `src/main/preload.js` — Expose `window.forge.prompt.send`, `window.forge.prompt.sessions.*`, `window.forge.prompt.messages.*`. Also expose two new settings helpers: `window.forge.prompt.setApiKey` and `window.forge.prompt.hasApiKey` (key value is never returned to the renderer for safety).
- `src/main/ipc/settings.js` — Add two new handlers: `settings:setApiKey` (writes via `safeStorage.encryptString`) and `settings:hasApiKey` (returns boolean).
- `src/main/index.js` — Register `registerPromptChatHandlers()`.

**Files to modify (renderer):**
- `src/renderer/pages/Settings.jsx` — Add a "DeepSeek API" section: masked input for the API key, "Test connection" button, dropdown for the model (`deepseek-v4-flash` default, `deepseek-v4-pro` option), slider for default temperature (0–2, default 1.0).
- `CLAUDE.md` — Bump schema version to 7, document the chat tables.

**Files to write but later (Plan 4 territory):**
- The Prompt Builder pane itself — not in this plan.

**New settings keys (encrypted where noted):**
- `deepseek_api_key` — base64-encoded encrypted blob from `safeStorage`.
- `deepseek_model` — plain string, default `'deepseek-v4-flash'`.
- `prompt_default_temperature` — plain string, default `'1.0'`.

---

## Important up-front notes for implementers

**DeepSeek model IDs.** The user specified `deepseek-v4-flash` (default) and `deepseek-v4-pro` (R1-equivalent, ignores temperature). These are forward-looking model IDs. The current DeepSeek API docs at the time of writing may use different strings (e.g. `deepseek-chat` / `deepseek-reasoner` for V3/R1, or new V4 ones). **Implementer responsibility:** verify the actual model IDs against [api-docs.deepseek.com](https://api-docs.deepseek.com/) during Task 5 (DeepSeek client) implementation. If the user's specified IDs return 404 or "invalid model", fall back to whatever the current chat / reasoner model IDs are, document the fallback in a code comment, and surface it to the controller.

**Function calling format.** DeepSeek is OpenAI-compatible, so the tool definition follows OpenAI's format: top-level `tools: [{ type: 'function', function: { name, description, parameters } }]` and the assistant's tool calls come back in `choices[0].message.tool_calls`. Each tool result is appended as a new message with `role: 'tool'` and `tool_call_id: <the call id>`.

**JSON response format.** DeepSeek supports `response_format: { type: 'json_object' }`. Use this on the FINAL completion (after the tool loop is done) to enforce structured output. Don't use it on intermediate calls — that conflicts with tool calling.

**No streaming in v1.** The spec mentions streaming, but for the first iteration we use synchronous request/response. The renderer will see a single result after ~5–12s. Streaming can be added in a later session without changing the IPC contract.

---

## Task 1: Schema migration v6 → v7 — chat sessions and messages

**Files:**
- Modify: `src/main/db/schema.sql`
- Modify: `src/main/db/database.js`

Add two tables: `prompt_chat_sessions` and `prompt_chat_messages`. Bump `user_version`.

- [ ] **Step 1: Append new tables to `schema.sql`**

Open `src/main/db/schema.sql`. After the existing `CREATE TRIGGER IF NOT EXISTS danbooru_tags_au` block (the last FTS trigger from Plan 2), append:

```sql

CREATE TABLE IF NOT EXISTS prompt_chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  checkpoint_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_chat_sessions_updated_at ON prompt_chat_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS prompt_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES prompt_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
  content TEXT,
  structured_response TEXT,
  lora_ids_snapshot TEXT,
  model_family TEXT,
  temperature REAL,
  tool_calls_count INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_chat_messages_session ON prompt_chat_messages(session_id, id);
```

- [ ] **Step 2: Bump `user_version` in `database.js`**

Open `src/main/db/database.js`. Find the existing `if (version < 6)` block. Add immediately after it:

```javascript
  if (version < 7) {
    // prompt_chat_sessions and prompt_chat_messages are created idempotently by schema.sql.
  }
```

Change the final pragma:

```javascript
  db.pragma('user_version = 7')
```

- [ ] **Step 3: Verify the migration applies cleanly**

```bash
npm run dev
```

Wait ~15 seconds for the window. In a separate terminal:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "PRAGMA user_version; SELECT name FROM sqlite_master WHERE name LIKE 'prompt_chat_%' OR name LIKE 'idx_prompt_chat_%' ORDER BY name;"
```

Expected:
- `user_version` is `7`.
- Four objects listed: `idx_prompt_chat_messages_session`, `idx_prompt_chat_sessions_updated_at`, `prompt_chat_messages`, `prompt_chat_sessions`.

Stop the dev server.

- [ ] **Step 4: Verify the foreign-key cascade**

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "INSERT INTO prompt_chat_sessions (title) VALUES ('test session'); INSERT INTO prompt_chat_messages (session_id, role, content) VALUES (last_insert_rowid(), 'user', 'hi'); SELECT COUNT(*) FROM prompt_chat_messages; DELETE FROM prompt_chat_sessions WHERE title = 'test session'; SELECT COUNT(*) FROM prompt_chat_messages;"
```

Expected output: `1` then `0` (ON DELETE CASCADE removes the message when the session is deleted).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.sql src/main/db/database.js
git commit -m "feat(db): prompt_chat_sessions + prompt_chat_messages (user_version 7)"
```

---

## Task 2: System prompts module

**Files:**
- Create: `src/main/ai/system-prompts/base.js`
- Create: `src/main/ai/system-prompts/families.js`
- Create: `src/main/ai/system-prompts/index.js`

The base prompt encodes the Danbooru-style rules. Family suffixes append per-model-family quality/negative presets.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/main/ai/system-prompts
```

- [ ] **Step 2: Create `base.js`**

```javascript
// src/main/ai/system-prompts/base.js
//
// Base system prompt for the Prompt Builder. Defines the output schema,
// tagging rules, and workflow. Per-family suffixes (in families.js) append
// quality/negative presets specific to each SDXL/SD1.5 lineage.

const BASE_PROMPT = `You are a prompt engineer specializing in Danbooru-style tag prompts for Stable Diffusion image generators.

OUTPUT FORMAT (strict):
- Emit a single JSON object with keys "positive", "negative", and optional "explanation".
- Each item in "positive" and "negative" is an object: { "tag": string, "type": "danbooru" | "lora_trigger", "category": string, "lora_id"?: number }.
- "type" is "danbooru" for canonical tags discovered via the search_tags tool, "lora_trigger" for trigger words supplied via the user's selected LoRAs.
- "category" must be one of: "quality", "subject", "style", "camera", "scene", "pose", "clothing", "expression", "lighting", "composition", "anatomy", "other".
- For lora_trigger items, include the "lora_id" field copied from the LoRA context block in the user message.

TAG FORMATTING:
- Use spaces, NOT underscores. Output "long hair", not "long_hair".
- Escape parentheses inside tag names: write "hatsune miku \\(vocaloid\\)".
- All tags must be canonical Danbooru tags discoverable via the search_tags tool, EXCEPT lora_trigger items which are emitted verbatim as supplied.
- DO NOT invent tag names. If you are unsure a tag exists, call search_tags first.

WORKFLOW:
1. Read the user's description; identify concepts to encode (subject, appearance, clothing, pose, expression, lighting, scene, framing, quality).
2. For each concept group, call the search_tags function with a descriptive query. Prefer 3-6 well-chosen searches over 12+ narrow ones. The tool returns the top-ranked canonical tags for that query.
3. From each result list, pick the most popular tags that match the user's intent. Higher post_count means more reliably trained.
4. Insert any LoRA trigger words (from the LoRA context block) as type "lora_trigger" items at appropriate positions in the positive prompt — typically near the front for style LoRAs, near the subject for character LoRAs.
5. Apply the model family's quality + negative preset as specified in the family suffix below.
6. Emit the final JSON.

CONSTRAINTS:
- Aim for 15-25 tags total in the positive prompt (50-70 CLIP tokens). Less is more.
- Aim for 6-12 tags in the negative prompt.
- Weight conservatively: "(tag:1.15)" to "(tag:1.3)" for emphasis, "(tag:0.7)" to "(tag:0.85)" for de-emphasis. Only weight 0-2 tags per prompt. NEVER weight every tag.
- Tag what is visible in the intended composition, not what is merely implied. For a portrait, do not tag shoes.
- Convert natural-language phrasing to canonical tags. Reject "beautiful girl with flowing red hair" and emit "1girl, solo, long hair, red hair, beautiful" instead.

NEVER:
- Invent non-canonical tag names.
- Output natural-language sentences in the positive or negative arrays.
- Mix weighting syntaxes — pick (tag:N) and stick with it.
- Stack contradictory framing tags (e.g. "full_body" AND "portrait").
- Include quality modifiers the family suffix doesn't list (e.g. "masterpiece" on Pony Diffusion).`

module.exports = { BASE_PROMPT }
```

- [ ] **Step 3: Create `families.js`**

```javascript
// src/main/ai/system-prompts/families.js
//
// Per-model-family system prompt suffixes. Each suffix specifies the quality
// and negative tag conventions for that family. Family enum mirrors
// src/renderer/lib/model-families.js.

const FAMILY_SUFFIXES = {
  pony_xl: `MODEL FAMILY: Pony Diffusion XL.
- Start the positive prompt with: "score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up".
- Pony's score_* tags ARE the quality system — do NOT also use "masterpiece" or "best quality".
- Start the negative prompt with: "score_4, score_5, score_6".
- Include a rating tag near the start of the positive prompt: "rating_safe", "rating_questionable", or "rating_explicit" based on user intent. Default to "rating_safe" when unclear.`,

  illustrious: `MODEL FAMILY: Illustrious / NoobAI XL.
- End the positive prompt with: "masterpiece, best quality, newest, absurdres, highres".
- "newest" is the date-tag the NoobAI lineage was trained with; include it.
- Start the negative prompt with: "worst quality, old, early, low quality, lowres, signature, watermark".`,

  animagine_xl: `MODEL FAMILY: Animagine XL (3.x convention).
- Start the positive prompt with: "masterpiece, best quality, very aesthetic, absurdres".
- Start the negative prompt with: "worst quality, low quality, lowres, jpeg artifacts, signature, watermark".`,

  sdxl_realistic: `MODEL FAMILY: SDXL — Realistic (Juggernaut, RealVisXL, etc.).
- Start the positive prompt with: "photorealistic, 8k, hyperdetailed, sharp focus, professional photography".
- Start the negative prompt with: "cartoon, anime, illustration, painting, blurry, low quality, bad anatomy".`,

  sdxl_anime: `MODEL FAMILY: SDXL — Anime / Generic.
- Start the positive prompt with: "masterpiece, best quality, highres, absurdres".
- Start the negative prompt with: "worst quality, low quality, lowres, jpeg artifacts, bad anatomy, signature, watermark".`,

  sd15_anime: `MODEL FAMILY: SD 1.5 — Anime (Anything V3/V5, Pastel Mix, etc.).
- Start the positive prompt with: "masterpiece, best quality, highres".
- Start the negative prompt with: "lowres, bad anatomy, bad hands, worst quality, low quality, jpeg artifacts, signature, watermark".`,

  sd15_realistic: `MODEL FAMILY: SD 1.5 — Realistic (MajicMix Realistic, Realistic Vision, etc.).
- Start the positive prompt with: "photorealistic, RAW photo, 8k, hyperdetailed, sharp focus".
- Start the negative prompt with: "cartoon, anime, illustration, painting, blurry, bad anatomy, signature, watermark".`,

  other: `MODEL FAMILY: Other / Generic (no specific quality convention).
- Start the positive prompt with conservative universal quality tags: "masterpiece, best quality, highres".
- Start the negative prompt with: "low quality, lowres, blurry, bad anatomy, signature, watermark".`,
}

module.exports = { FAMILY_SUFFIXES }
```

- [ ] **Step 4: Create `index.js` (composer)**

```javascript
// src/main/ai/system-prompts/index.js
//
// Composes the full system prompt: base rules + family-specific suffix +
// LoRA context block (if any).

const { BASE_PROMPT } = require('./base')
const { FAMILY_SUFFIXES } = require('./families')

// loras: array of { id, file_path, trigger_words } (whichever subset we want to expose)
function buildSystemPrompt({ family, loras }) {
  const familyKey = family && FAMILY_SUFFIXES[family] ? family : 'other'
  let prompt = BASE_PROMPT + '\n\n' + FAMILY_SUFFIXES[familyKey]

  if (loras && loras.length > 0) {
    prompt += '\n\nLORA CONTEXT (insert these trigger words as type="lora_trigger" items in the positive prompt):\n'
    for (const l of loras) {
      const triggers = (l.trigger_words || '').trim()
      if (!triggers) continue
      prompt += `  - id ${l.id}, file ${JSON.stringify(l.file_path || '(unknown)')}, triggers: ${triggers}\n`
    }
  }

  return prompt
}

module.exports = { buildSystemPrompt }
```

- [ ] **Step 5: Verify the composer**

```bash
node -e "const {buildSystemPrompt} = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/ai/system-prompts'); console.log(buildSystemPrompt({family: 'pony_xl', loras: [{id: 1, file_path: 'styleA.safetensors', trigger_words: 'triggerWordA'}]}))"
```

Expected: prints the base prompt followed by the Pony suffix and a LORA CONTEXT block listing the LoRA.

Try with an unknown family:

```bash
node -e "const {buildSystemPrompt} = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/ai/system-prompts'); console.log(buildSystemPrompt({family: 'unknown', loras: []}).slice(-400))"
```

Expected: ends with the "Other / Generic" suffix (graceful fallback).

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/system-prompts
git commit -m "feat(ai): system prompts — base rules + per-family suffixes + LoRA context"
```

---

## Task 3: API key + model settings storage with `safeStorage`

**Files:**
- Modify: `src/main/ipc/settings.js`
- Modify: `src/main/preload.js`

`safeStorage` encrypts/decrypts strings using the OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux). We store the encrypted blob as base64 in the existing `settings` table.

- [ ] **Step 1: Add API key handlers to `settings.js`**

Open `src/main/ipc/settings.js`. After the existing `settings:openFolderPicker` handler (around line 33), add:

```javascript
  ipcMain.handle('settings:setApiKey', (_event, { key, plaintext }) => {
    const { safeStorage } = require('electron')
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: 'OS keychain unavailable' }
    }
    const db = getDatabase()
    if (plaintext === null || plaintext === '' || plaintext === undefined) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(key)
      return { ok: true, cleared: true }
    }
    const encrypted = safeStorage.encryptString(plaintext)
    const base64 = encrypted.toString('base64')
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, base64)
    return { ok: true }
  })

  ipcMain.handle('settings:hasApiKey', (_event, { key }) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return !!row && !!row.value
  })

  ipcMain.handle('settings:testApiKey', async (_event, { key, baseUrl }) => {
    const { safeStorage } = require('electron')
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row || !row.value) return { ok: false, reason: 'No API key set' }
    let plaintext
    try {
      plaintext = safeStorage.decryptString(Buffer.from(row.value, 'base64'))
    } catch (err) {
      return { ok: false, reason: 'Failed to decrypt API key — keychain may be unavailable' }
    }
    try {
      const resp = await fetch((baseUrl || 'https://api.deepseek.com/v1') + '/models', {
        headers: { Authorization: 'Bearer ' + plaintext },
      })
      if (resp.ok) return { ok: true }
      return { ok: false, reason: `HTTP ${resp.status} ${resp.statusText}` }
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) }
    }
  })
```

This adds three handlers. The plaintext API key is NEVER returned to the renderer — only `hasApiKey` (boolean) and `testApiKey` (returns ok/reason) are exposed. Main-process code that actually needs the plaintext (the DeepSeek client in Task 4) reads it directly from the DB.

- [ ] **Step 2: Add internal helper for the DeepSeek client to read the key**

Still in `src/main/ipc/settings.js`, OUTSIDE `registerSettingsHandlers`, add an exported helper:

```javascript
function getDecryptedSetting(key) {
  const { safeStorage } = require('electron')
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row || !row.value) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.value, 'base64'))
  } catch (err) {
    return null
  }
}

module.exports = { registerSettingsHandlers, getDecryptedSetting }
```

(The existing `module.exports = { registerSettingsHandlers }` line needs to be replaced with the new combined version.)

- [ ] **Step 3: Expose in preload**

Open `src/main/preload.js`. The `prompt` namespace currently has `searchTags`, `libraryStatus`, `libraryRefresh`, `libraryDelete`. Add three more entries:

```javascript
    setApiKey: (plaintext) => ipcRenderer.invoke('settings:setApiKey', { key: 'deepseek_api_key', plaintext }),
    hasApiKey: () => ipcRenderer.invoke('settings:hasApiKey', { key: 'deepseek_api_key' }),
    testApiKey: () => ipcRenderer.invoke('settings:testApiKey', { key: 'deepseek_api_key', baseUrl: 'https://api.deepseek.com/v1' }),
```

So the full `prompt` namespace should now look like:

```javascript
  prompt: {
    searchTags: (query, options) => ipcRenderer.invoke('prompt:search-tags', { query, options }),
    libraryStatus: () => ipcRenderer.invoke('prompt:library-status'),
    libraryRefresh: () => ipcRenderer.invoke('prompt:library-refresh'),
    libraryDelete: () => ipcRenderer.invoke('prompt:library-delete'),
    setApiKey: (plaintext) => ipcRenderer.invoke('settings:setApiKey', { key: 'deepseek_api_key', plaintext }),
    hasApiKey: () => ipcRenderer.invoke('settings:hasApiKey', { key: 'deepseek_api_key' }),
    testApiKey: () => ipcRenderer.invoke('settings:testApiKey', { key: 'deepseek_api_key', baseUrl: 'https://api.deepseek.com/v1' }),
  },
```

(Note: `prompt:send`, `prompt:sessions:*` will be added in Task 7.)

- [ ] **Step 4: Verify via DevTools**

```bash
npm run dev
```

Wait for the window. In DevTools console:

```javascript
await window.forge.prompt.hasApiKey()    // → false
await window.forge.prompt.setApiKey('test-key-placeholder')
await window.forge.prompt.hasApiKey()    // → true
await window.forge.prompt.testApiKey()   // → { ok: false, reason: 'HTTP 401 Unauthorized' } (real DeepSeek rejects the fake key, which proves the round-trip works)
await window.forge.prompt.setApiKey(null)
await window.forge.prompt.hasApiKey()    // → false
```

Confirm the encrypted value appears in the DB:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT key, length(value) FROM settings WHERE key = 'deepseek_api_key';"
```

After setting: should show a row with `value` length around 100+ characters (encrypted base64). After clearing: no row.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/settings.js src/main/preload.js
git commit -m "feat(settings): encrypted DeepSeek API key storage via safeStorage"
```

---

## Task 4: DeepSeek client wrapper

**Files:**
- Create: `src/main/ai/deepseek-client.js`

A thin wrapper around DeepSeek's `/v1/chat/completions` endpoint. Accepts a messages array + optional `tools` and `response_format`, returns the parsed response. Pulls the API key + model + base URL from settings.

**Implementer note on model IDs:** the user specified `deepseek-v4-flash` (default) and `deepseek-v4-pro`. **Validate against the current DeepSeek API docs.** If those exact IDs don't resolve (model_not_found error), fall back to the chat-equivalent and reasoner-equivalent IDs documented at api-docs.deepseek.com. Document the fallback in a comment near the default-model constant.

- [ ] **Step 1: Create the client**

```javascript
// src/main/ai/deepseek-client.js
//
// Thin wrapper around DeepSeek's OpenAI-compatible chat completions endpoint.
// Pulls API key from settings (decrypts via safeStorage). Supports function calling
// and JSON-mode response_format.
//
// MODEL IDS: the user specified deepseek-v4-flash (default) and deepseek-v4-pro.
// If those return model_not_found at runtime, update DEFAULT_MODEL to the current
// DeepSeek chat/reasoner model IDs from https://api-docs.deepseek.com/

const { getDatabase } = require('../db/database')
const { getDecryptedSetting } = require('../ipc/settings')

const BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function getModel() {
  const db = getDatabase()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'deepseek_model'").get()
  return (row && row.value) || DEFAULT_MODEL
}

// Returns { ok: true, message } on success or { ok: false, status, reason } on failure.
// `message` is the assistant's message object from choices[0].message (may contain tool_calls).
async function chatCompletion({ messages, tools, responseFormat, temperature }) {
  const apiKey = getDecryptedSetting('deepseek_api_key')
  if (!apiKey) {
    return { ok: false, status: 0, reason: 'No DeepSeek API key set. Add one in Settings.' }
  }

  const model = getModel()
  const body = {
    model,
    messages,
    temperature: typeof temperature === 'number' ? temperature : 1.0,
  }
  if (tools) body.tools = tools
  if (responseFormat) body.response_format = responseFormat

  let resp
  try {
    resp = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, status: 0, reason: 'Network error: ' + String(err && err.message || err) }
  }

  if (!resp.ok) {
    let detail = ''
    try { detail = await resp.text() } catch {}
    return {
      ok: false,
      status: resp.status,
      reason: `HTTP ${resp.status} ${resp.statusText}` + (detail ? ': ' + detail.slice(0, 400) : ''),
    }
  }

  let payload
  try {
    payload = await resp.json()
  } catch (err) {
    return { ok: false, status: resp.status, reason: 'Response was not valid JSON' }
  }

  const choice = payload && payload.choices && payload.choices[0]
  if (!choice || !choice.message) {
    return { ok: false, status: resp.status, reason: 'Response had no message' }
  }

  return {
    ok: true,
    message: choice.message,
    finishReason: choice.finish_reason,
    usage: payload.usage || null,
  }
}

module.exports = { chatCompletion, getModel, BASE_URL, DEFAULT_MODEL }
```

- [ ] **Step 2: Verify the client end-to-end with a placeholder key**

You need a real DeepSeek API key to test the happy path. With a placeholder you'll get HTTP 401, which still proves the round-trip works.

```bash
NODE_ENV=development npx electron -e "
const { app } = require('electron')
app.whenReady().then(async () => {
  const { getDecryptedSetting } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/ipc/settings')
  // Bypass safeStorage encryption for this test by directly inserting:
  const { getDatabase } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/db/database')
  const { safeStorage } = require('electron')
  const db = getDatabase()
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString('placeholder-bad-key').toString('base64')
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('deepseek_api_key', enc)
  }
  const { chatCompletion } = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/ai/deepseek-client')
  const r = await chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] })
  console.log('Result:', JSON.stringify(r).slice(0, 500))
  // Clean up the test key
  db.prepare('DELETE FROM settings WHERE key = ?').run('deepseek_api_key')
  app.quit()
})
" 2>&1 | tail -10
```

Expected: prints something like `Result: {"ok":false,"status":401,"reason":"HTTP 401 Unauthorized: ..."}` — the round-trip to DeepSeek's API returned 401 because of the fake key. This proves auth header, request body, and error handling all work.

If you have a real key handy, swap `'placeholder-bad-key'` for it and observe `{ ok: true, message: { role: 'assistant', content: '...' }, ...}`.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/deepseek-client.js
git commit -m "feat(ai): DeepSeek chat completions client wrapper"
```

---

## Task 5: Tool-loop runner

**Files:**
- Create: `src/main/ai/tool-loop.js`

The runner is the heart of the AI integration. Flow:

1. Build initial `messages` array: system prompt + user description.
2. Call `chatCompletion` with the `search_tags` tool declared.
3. If the response contains `tool_calls`, execute each one against the local search backend, append a `tool` role message per call, and loop back.
4. If the response is plain content (no tool calls), parse it as JSON and return.
5. Hard cap at 8 tool calls — past that, force a final call with `response_format: json_object` and no `tools` to coerce JSON.

- [ ] **Step 1: Create the runner**

```javascript
// src/main/ai/tool-loop.js
//
// Tool-calling loop for the Prompt Builder. The AI is given a single tool
// (search_tags) and may call it iteratively. The loop terminates when the AI
// emits a final JSON message (no tool_calls) — enforced via response_format on
// the last attempt. Hard cap of MAX_TOOL_CALLS prevents runaway.

const { chatCompletion } = require('./deepseek-client')
const { searchTags } = require('../tags/search')

const MAX_TOOL_CALLS = 8

const SEARCH_TAGS_TOOL = {
  type: 'function',
  function: {
    name: 'search_tags',
    description: 'Search the local Danbooru tag library and return the top matches by semantic similarity + popularity. Use this to find canonical tag names for concepts you want to include in the output.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A concept or phrase to find tags for, e.g. "red hair shades", "golden hour lighting", "soft smile".',
        },
        category: {
          type: 'string',
          enum: ['general', 'character', 'copyright', 'artist', 'meta', 'any'],
          description: 'Optional category filter. Default: any.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results (1-50). Default: 20.',
        },
      },
      required: ['query'],
    },
  },
}

// Runs the tool loop until a final JSON message is returned.
// Returns { ok: true, structured, toolCallsCount, latencyMs } or { ok: false, reason }.
async function runToolLoop({ systemPrompt, userMessage, temperature, onToolCall }) {
  const startMs = Date.now()
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  let toolCallsCount = 0
  for (let i = 0; i < MAX_TOOL_CALLS + 1; i++) {
    const isFinal = i === MAX_TOOL_CALLS
    const resp = await chatCompletion({
      messages,
      tools: isFinal ? undefined : [SEARCH_TAGS_TOOL],
      responseFormat: isFinal ? { type: 'json_object' } : undefined,
      temperature,
    })

    if (!resp.ok) {
      return { ok: false, reason: resp.reason, latencyMs: Date.now() - startMs }
    }

    const message = resp.message
    messages.push(message)

    const toolCalls = (message.tool_calls || []).filter(c => c.type === 'function' && c.function && c.function.name === 'search_tags')

    if (toolCalls.length === 0) {
      // Final answer.
      const content = (message.content || '').trim()
      let structured
      try {
        structured = JSON.parse(content)
      } catch (err) {
        if (i < MAX_TOOL_CALLS) {
          // Retry once with JSON mode enforced.
          messages.push({
            role: 'user',
            content: 'Your previous response was not valid JSON. Please emit ONLY the JSON object now, with no surrounding prose.',
          })
          continue
        }
        return { ok: false, reason: 'Model did not produce valid JSON: ' + content.slice(0, 200), latencyMs: Date.now() - startMs }
      }
      return {
        ok: true,
        structured,
        toolCallsCount,
        latencyMs: Date.now() - startMs,
      }
    }

    // Execute each tool call and append a tool message per call.
    for (const call of toolCalls) {
      toolCallsCount++
      let args = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {}

      const query = String(args.query || '').slice(0, 200)
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 20))
      const category = args.category && args.category !== 'any' ? args.category : null

      let results = []
      try {
        results = await searchTags(query, { limit, category })
      } catch (err) {
        results = []
      }

      if (typeof onToolCall === 'function') {
        try { onToolCall({ query, results_count: results.length }) } catch {}
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(results.map(r => ({
          name: r.name,
          category: r.category,
          post_count: r.post_count,
        }))),
      })
    }
  }

  // Should never get here — the loop returns either via final JSON or via the cap path above.
  return { ok: false, reason: 'Tool loop fell through unexpectedly', latencyMs: Date.now() - startMs }
}

module.exports = { runToolLoop, MAX_TOOL_CALLS }
```

- [ ] **Step 2: Smoke-test the loop's structure**

Without a real DeepSeek key we can't run end-to-end, but we can confirm the file loads and exports what we need:

```bash
node -e "const m = require('/Users/ibraheemfiraz/Desktop/ForgeProject/src/main/ai/tool-loop'); console.log('exports:', Object.keys(m)); console.log('MAX_TOOL_CALLS:', m.MAX_TOOL_CALLS); console.log('runToolLoop type:', typeof m.runToolLoop)"
```

Expected: `exports: [ 'runToolLoop', 'MAX_TOOL_CALLS' ]`, `MAX_TOOL_CALLS: 8`, `runToolLoop type: function`.

The real verification happens in Task 11 (E2E) once Settings provides a way to enter a real API key.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/tool-loop.js
git commit -m "feat(ai): tool-calling loop with search_tags and JSON-mode terminator"
```

---

## Task 6: IPC handlers for chat send + sessions

**Files:**
- Create: `src/main/ipc/prompt-chat.js`
- Modify: `src/main/index.js`
- Modify: `src/main/preload.js`

Exposes six handlers:
- `prompt:send` — given `{ sessionId?, userMessage, checkpointId, loraIds, temperature }`, runs the full pipeline (build prompt, call DeepSeek via tool loop, persist user + assistant messages) and returns the assistant message row.
- `prompt:sessions:list` — list all sessions ordered by `updated_at DESC`.
- `prompt:sessions:new` — create a session, return its id and title (auto-titled "New chat").
- `prompt:sessions:delete` — delete a session and its messages.
- `prompt:sessions:rename` — update `title`.
- `prompt:messages:list` — list all messages of a session ordered by `id ASC`.

- [ ] **Step 1: Create the handler module**

```javascript
// src/main/ipc/prompt-chat.js
//
// IPC handlers for the Prompt Builder chat: send a message, manage sessions,
// list message history.

const { ipcMain, BrowserWindow } = require('electron')
const { getDatabase } = require('../db/database')
const { runToolLoop } = require('../ai/tool-loop')
const { buildSystemPrompt } = require('../ai/system-prompts')

function registerPromptChatHandlers() {
  ipcMain.handle('prompt:sessions:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT s.id, s.title, s.checkpoint_id, s.created_at, s.updated_at,
        (SELECT COUNT(*) FROM prompt_chat_messages m WHERE m.session_id = s.id) as message_count
      FROM prompt_chat_sessions s
      ORDER BY s.updated_at DESC
    `).all()
  })

  ipcMain.handle('prompt:sessions:new', (_e, { checkpointId, title } = {}) => {
    const db = getDatabase()
    const result = db.prepare(
      'INSERT INTO prompt_chat_sessions (title, checkpoint_id) VALUES (?, ?)'
    ).run(title || 'New chat', checkpointId || null)
    return db.prepare('SELECT * FROM prompt_chat_sessions WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('prompt:sessions:delete', (_e, { id }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM prompt_chat_sessions WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('prompt:sessions:rename', (_e, { id, title }) => {
    const db = getDatabase()
    db.prepare('UPDATE prompt_chat_sessions SET title = ?, updated_at = datetime(\'now\') WHERE id = ?').run(title, id)
    return true
  })

  ipcMain.handle('prompt:messages:list', (_e, { sessionId }) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT id, session_id, role, content, structured_response, lora_ids_snapshot,
             model_family, temperature, tool_calls_count, latency_ms, created_at
      FROM prompt_chat_messages
      WHERE session_id = ?
      ORDER BY id ASC
    `).all(sessionId)
  })

  ipcMain.handle('prompt:send', async (event, { sessionId, userMessage, checkpointId, loraIds, temperature }) => {
    const db = getDatabase()

    // Lazily create a session if one wasn't provided.
    let session
    if (sessionId) {
      session = db.prepare('SELECT * FROM prompt_chat_sessions WHERE id = ?').get(sessionId)
      if (!session) return { ok: false, reason: 'Session not found' }
    } else {
      const result = db.prepare(
        'INSERT INTO prompt_chat_sessions (title, checkpoint_id) VALUES (?, ?)'
      ).run((userMessage || 'New chat').slice(0, 60), checkpointId || null)
      session = db.prepare('SELECT * FROM prompt_chat_sessions WHERE id = ?').get(result.lastInsertRowid)
    }

    // Resolve checkpoint family.
    let family = 'other'
    const cpId = checkpointId || session.checkpoint_id
    if (cpId) {
      const cp = db.prepare('SELECT family FROM models WHERE id = ?').get(cpId)
      if (cp && cp.family) family = cp.family
    }

    // Resolve selected LoRAs.
    const loras = []
    if (Array.isArray(loraIds) && loraIds.length > 0) {
      const placeholders = loraIds.map(() => '?').join(',')
      const rows = db.prepare(
        `SELECT id, name, file_path, trigger_words FROM loras WHERE id IN (${placeholders})`
      ).all(...loraIds)
      for (const r of rows) loras.push(r)
    }

    // Persist the user message.
    const userInsert = db.prepare(
      `INSERT INTO prompt_chat_messages (session_id, role, content, lora_ids_snapshot, model_family, temperature)
       VALUES (?, 'user', ?, ?, ?, ?)`
    ).run(
      session.id,
      userMessage,
      JSON.stringify(loraIds || []),
      family,
      typeof temperature === 'number' ? temperature : null
    )

    // Build prompt and run tool loop.
    const systemPrompt = buildSystemPrompt({ family, loras })
    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload) => {
      if (win && !win.isDestroyed()) win.webContents.send('prompt:tool-call', payload)
    }

    const result = await runToolLoop({
      systemPrompt,
      userMessage,
      temperature: typeof temperature === 'number' ? temperature : 1.0,
      onToolCall: (info) => emit({ messageId: userInsert.lastInsertRowid, ...info }),
    })

    if (!result.ok) {
      const errInsert = db.prepare(
        `INSERT INTO prompt_chat_messages (session_id, role, content, model_family, temperature, latency_ms)
         VALUES (?, 'assistant', ?, ?, ?, ?)`
      ).run(session.id, 'ERROR: ' + result.reason, family, typeof temperature === 'number' ? temperature : null, result.latencyMs || null)
      db.prepare("UPDATE prompt_chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(session.id)
      return { ok: false, reason: result.reason, sessionId: session.id, messageId: errInsert.lastInsertRowid }
    }

    // Persist the assistant response.
    const assistantInsert = db.prepare(
      `INSERT INTO prompt_chat_messages (session_id, role, content, structured_response, model_family, temperature, tool_calls_count, latency_ms)
       VALUES (?, 'assistant', NULL, ?, ?, ?, ?, ?)`
    ).run(
      session.id,
      JSON.stringify(result.structured),
      family,
      typeof temperature === 'number' ? temperature : null,
      result.toolCallsCount,
      result.latencyMs
    )
    db.prepare("UPDATE prompt_chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(session.id)

    const assistantRow = db.prepare('SELECT * FROM prompt_chat_messages WHERE id = ?').get(assistantInsert.lastInsertRowid)
    return {
      ok: true,
      sessionId: session.id,
      message: assistantRow,
    }
  })
}

module.exports = { registerPromptChatHandlers }
```

- [ ] **Step 2: Register the handler in `src/main/index.js`**

Open `src/main/index.js`. After `const { registerPromptLibraryHandlers } = require('./ipc/prompt-library')`, add:

```javascript
const { registerPromptChatHandlers } = require('./ipc/prompt-chat')
```

After `registerPromptLibraryHandlers()`, add:

```javascript
  registerPromptChatHandlers()
```

- [ ] **Step 3: Expose in preload**

Open `src/main/preload.js`. Extend the `prompt` namespace with chat-specific entries:

```javascript
    send: (args) => ipcRenderer.invoke('prompt:send', args),
    sessions: {
      list: () => ipcRenderer.invoke('prompt:sessions:list'),
      new: (args) => ipcRenderer.invoke('prompt:sessions:new', args || {}),
      delete: (id) => ipcRenderer.invoke('prompt:sessions:delete', { id }),
      rename: (id, title) => ipcRenderer.invoke('prompt:sessions:rename', { id, title }),
    },
    messages: {
      list: (sessionId) => ipcRenderer.invoke('prompt:messages:list', { sessionId }),
    },
```

So the full `prompt` namespace is now:

```javascript
  prompt: {
    searchTags: (query, options) => ipcRenderer.invoke('prompt:search-tags', { query, options }),
    libraryStatus: () => ipcRenderer.invoke('prompt:library-status'),
    libraryRefresh: () => ipcRenderer.invoke('prompt:library-refresh'),
    libraryDelete: () => ipcRenderer.invoke('prompt:library-delete'),
    setApiKey: (plaintext) => ipcRenderer.invoke('settings:setApiKey', { key: 'deepseek_api_key', plaintext }),
    hasApiKey: () => ipcRenderer.invoke('settings:hasApiKey', { key: 'deepseek_api_key' }),
    testApiKey: () => ipcRenderer.invoke('settings:testApiKey', { key: 'deepseek_api_key', baseUrl: 'https://api.deepseek.com/v1' }),
    send: (args) => ipcRenderer.invoke('prompt:send', args),
    sessions: {
      list: () => ipcRenderer.invoke('prompt:sessions:list'),
      new: (args) => ipcRenderer.invoke('prompt:sessions:new', args || {}),
      delete: (id) => ipcRenderer.invoke('prompt:sessions:delete', { id }),
      rename: (id, title) => ipcRenderer.invoke('prompt:sessions:rename', { id, title }),
    },
    messages: {
      list: (sessionId) => ipcRenderer.invoke('prompt:messages:list', { sessionId }),
    },
  },
```

Also extend the event allowlist (it currently has `['inbox:new-item', 'prompt:library-progress']`) to include `'prompt:tool-call'`:

```javascript
    const allowed = ['inbox:new-item', 'prompt:library-progress', 'prompt:tool-call']
```

- [ ] **Step 4: Smoke test (no API key required for sessions, only for `send`)**

```bash
npm run dev
```

Wait for the window. In DevTools:

```javascript
await window.forge.prompt.sessions.list()          // → []
const s = await window.forge.prompt.sessions.new({ title: 'test' })
console.log(s)                                      // → { id: 1, title: 'test', ... }
await window.forge.prompt.sessions.list()          // → [{id: 1, title: 'test', message_count: 0, ...}]
await window.forge.prompt.messages.list(s.id)      // → []
await window.forge.prompt.sessions.delete(s.id)
await window.forge.prompt.sessions.list()          // → []
```

The `send` handler requires an API key — verified end-to-end in Task 9 / Task 11.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/prompt-chat.js src/main/index.js src/main/preload.js
git commit -m "feat(prompt): IPC for chat send + session/message management"
```

---

## Task 7: Settings UI — DeepSeek API section

**Files:**
- Modify: `src/renderer/pages/Settings.jsx`

A new "DeepSeek API" section above the existing "Prompt Builder — Tag Library" card. Contains:
- Masked API key input with show/hide toggle and a "Test connection" button.
- Model dropdown: `deepseek-v4-flash` (default), `deepseek-v4-pro`.
- Default temperature slider (0.0–2.0, step 0.1, default 1.0).

- [ ] **Step 1: Add state hooks**

Open `src/renderer/pages/Settings.jsx`. Inside the component, near the existing `lib*` state hooks, add:

```javascript
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyTesting, setApiKeyTesting] = useState(false)
  const [aiModel, setAiModel] = useState('deepseek-v4-flash')
  const [defaultTemp, setDefaultTemp] = useState(1.0)
```

- [ ] **Step 2: Load API key existence + model + temp on mount**

After the existing `libraryStatus` effect, add:

```javascript
  useEffect(() => {
    window.forge.prompt.hasApiKey().then(setApiKeySaved).catch(() => {})
    window.forge.settings.get('deepseek_model').then((v) => { if (v) setAiModel(v) }).catch(() => {})
    window.forge.settings.get('prompt_default_temperature').then((v) => { if (v) setDefaultTemp(parseFloat(v)) }).catch(() => {})
  }, [])
```

- [ ] **Step 3: Add the handlers**

Below `deleteTagLibrary`, add:

```javascript
  const saveApiKey = async () => {
    const result = await window.forge.prompt.setApiKey(apiKeyValue)
    if (result.ok) {
      setApiKeySaved(true)
      setApiKeyValue('')
      showToast('API key saved.')
    } else {
      showToast(`Failed to save key: ${result.reason}`)
    }
  }

  const clearApiKey = async () => {
    const result = await window.forge.prompt.setApiKey(null)
    if (result.ok) {
      setApiKeySaved(false)
      setApiKeyValue('')
      showToast('API key cleared.')
    }
  }

  const testApiKey = async () => {
    setApiKeyTesting(true)
    try {
      const result = await window.forge.prompt.testApiKey()
      if (result.ok) {
        showToast('Connection OK.')
      } else {
        showToast(`Connection failed: ${result.reason}`)
      }
    } finally {
      setApiKeyTesting(false)
    }
  }

  const changeModel = async (next) => {
    setAiModel(next)
    await window.forge.settings.set('deepseek_model', next)
    showToast('Model updated.')
  }

  const changeDefaultTemp = async (next) => {
    setDefaultTemp(next)
    await window.forge.settings.set('prompt_default_temperature', String(next))
  }
```

- [ ] **Step 4: Add the section to the JSX**

Place the new section IMMEDIATELY BEFORE the existing "Prompt Builder — Tag Library" card. So inside the `max-w-2xl` wrapper, between the auto-scan toggle and the tag library card, insert:

```jsx
        {/* DeepSeek API */}
        <div className="rounded-xl p-5 mt-4" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#eae5dc' }}>DeepSeek API</p>
          <p className="text-xs mb-4" style={{ color: '#bfb8a8' }}>
            The Prompt Builder uses DeepSeek to convert your natural-language descriptions into Danbooru-style tag prompts. Your API key is encrypted in your OS keychain.
          </p>

          {/* API key */}
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>API key</p>
            {apiKeySaved && !apiKeyValue ? (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value="•••••••••••••••••••••••"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono"
                  style={{ background: '#0f0e0b', border: '1px solid #302c1e', color: '#bfb8a8' }}
                />
                <button
                  onClick={testApiKey}
                  disabled={apiKeyTesting}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: apiKeyTesting ? '#302c1e' : '#242118', color: apiKeyTesting ? '#635c48' : '#bfb8a8', cursor: apiKeyTesting ? 'not-allowed' : 'pointer' }}
                >
                  {apiKeyTesting ? 'Testing…' : 'Test'}
                </button>
                <button
                  onClick={clearApiKey}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: '#2a1010', color: '#e87068' }}
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono"
                  style={{ background: '#0f0e0b', border: '1px solid #302c1e', color: '#eae5dc' }}
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: '#242118', color: '#bfb8a8' }}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={saveApiKey}
                  disabled={!apiKeyValue.trim()}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: apiKeyValue.trim() ? '#e8c820' : '#302c1e', color: apiKeyValue.trim() ? '#0f0e0b' : '#635c48', cursor: apiKeyValue.trim() ? 'pointer' : 'not-allowed' }}
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {/* Model */}
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Model</p>
            <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: '1px solid #302c1e' }}>
              {[
                { key: 'deepseek-v4-flash', label: 'V4 Flash (default)' },
                { key: 'deepseek-v4-pro', label: 'V4 Pro (no temperature)' },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => changeModel(m.key)}
                  className="px-4 py-2 text-sm font-medium"
                  style={{
                    background: aiModel === m.key ? '#e8c820' : '#1a1813',
                    color: aiModel === m.key ? '#0f0e0b' : '#635c48',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Default temperature</p>
              <span className="text-xs font-mono" style={{ color: '#e8c820' }}>{defaultTemp.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={defaultTemp}
              onChange={(e) => changeDefaultTemp(parseFloat(e.target.value))}
              disabled={aiModel === 'deepseek-v4-pro'}
              className="w-full"
              style={{ accentColor: '#e8c820' }}
            />
            <p className="text-[10px] mt-1.5" style={{ color: '#635c48' }}>
              {aiModel === 'deepseek-v4-pro'
                ? 'V4 Pro ignores temperature.'
                : 'DeepSeek recommends 0.6–0.8 for structured output; values above 1.5 may hallucinate non-canonical tags.'}
            </p>
          </div>
        </div>
```

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Open Settings, scroll to the new "DeepSeek API" card. Confirm:
- Empty state: password-style input + Show/Save buttons.
- Type a placeholder key (e.g. `sk-test`), click Save → toast "API key saved." → state changes to dots-display + Test/Clear.
- Click Test → toast with `HTTP 401 Unauthorized` (proves the round-trip works).
- Click Clear → returns to empty state.
- Model toggle switches between V4 Flash and V4 Pro. Selecting Pro disables the temperature slider.
- Default temperature slider works smoothly from 0.0 to 2.0.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/Settings.jsx
git commit -m "feat(settings): DeepSeek API key + model + temperature controls"
```

---

## Task 8: Update `CLAUDE.md` for schema v7

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump the version note**

Open `CLAUDE.md`. Edit the schema-version line (the one inside the `db/database.js` bullet) — change `current version: 6` to `current version: 7`.

- [ ] **Step 2: Append a sentence about chat tables**

Find the existing `db/schema.sql` bullet (ending with the Danbooru tag library sentence). Append:

```
`prompt_chat_sessions` and `prompt_chat_messages` hold the Prompt Builder's persisted chat history; messages CASCADE on session delete. The assistant's structured tag response is stored as JSON in `structured_response` for re-rendering without re-calling the AI.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document chat tables and bump schema version to 7"
```

---

## Task 9: End-to-end verification

**Files:** (none — verification only)

This needs a REAL DeepSeek API key. If you don't have one, stop here and ask the controller for one before proceeding.

- [ ] **Step 1: Pre-flight**

Confirm Plan 2's tag library is populated:

```bash
sqlite3 "$HOME/Library/Application Support/forge/forge.db" "SELECT COUNT(*) as total, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as indexed FROM danbooru_tags;"
```

Expected: total ~140k, indexed = total.

If the library is empty (Task 11 of Plan 2 was run on the Electron-default-context DB), trigger the download via Settings → "Download tag library" first and wait for it to finish (~5-10 min).

- [ ] **Step 2: Configure DeepSeek**

`npm run dev`. Open Settings.
- Paste your real DeepSeek API key into the field and click Save.
- Click Test → expect "Connection OK." toast.
- Leave model on V4 Flash; leave temperature at 1.0.

Optionally classify one of your checkpoints to a family (so the family suffix activates).

- [ ] **Step 3: End-to-end send via DevTools**

Open DevTools (View → Toggle Developer Tools). Run:

```javascript
const result = await window.forge.prompt.send({
  userMessage: 'A moody redhead portrait at sunset on a rooftop, soft cinematic feel, slight smile.',
  checkpointId: null,         // or a classified checkpoint id
  loraIds: [],
  temperature: 1.0,
})
console.log(result)
```

Expected (after ~5–15 seconds):
- `result.ok === true`
- `result.sessionId` is a number
- `result.message.role === 'assistant'`
- `result.message.structured_response` is a JSON string that, when parsed, has `positive` (array of tag objects) and `negative` (array of tag objects).
- `result.message.tool_calls_count` is between 1 and 8.

Parse and inspect:

```javascript
const parsed = JSON.parse(result.message.structured_response)
console.log('positive:', parsed.positive.map(t => t.tag).join(', '))
console.log('negative:', parsed.negative.map(t => t.tag).join(', '))
console.log('tool calls:', result.message.tool_calls_count)
```

Expected: the positive prompt reads as a coherent Danbooru-style sequence ("1girl, solo, portrait, red hair, …, masterpiece, best quality, …" or similar depending on family). All tags should be lowercase with spaces (not underscores).

- [ ] **Step 4: Confirm persistence**

```javascript
const sessions = await window.forge.prompt.sessions.list()
console.log(sessions)
const messages = await window.forge.prompt.messages.list(sessions[0].id)
console.log(messages.length, 'messages')
```

Expected: at least one session, with 2 messages (user + assistant).

Quit (⌘Q), `npm run dev` again, repeat the queries — sessions and messages should still be there.

- [ ] **Step 5: Test the family-specific output**

Classify a checkpoint as `pony_xl` via the Checkpoint detail page (Plan 1). Then re-run `send` passing that checkpoint id:

```javascript
const r2 = await window.forge.prompt.send({
  userMessage: 'A redhead in a meadow.',
  checkpointId: <id>,
  loraIds: [],
  temperature: 1.0,
})
const parsed = JSON.parse(r2.message.structured_response)
console.log(parsed.positive.map(t => t.tag).join(', '))
```

Expected: positive prompt starts with `score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up` (the Pony preset). Confirms the family suffix routing works.

- [ ] **Step 6: Test LoRA injection**

Pick a LoRA from your library that has trigger words set. Call:

```javascript
const r3 = await window.forge.prompt.send({
  userMessage: 'A redhead at sunset.',
  checkpointId: null,
  loraIds: [<lora-id>],
  temperature: 1.0,
})
const parsed = JSON.parse(r3.message.structured_response)
console.log(parsed.positive.filter(t => t.type === 'lora_trigger'))
```

Expected: at least one item in the positive prompt has `type: 'lora_trigger'` and matches the LoRA's trigger words.

---

## Self-Review checklist

Before considering Plan 3 done:

- **Spec coverage:**
  - DeepSeek client with auth + JSON mode + tools (Task 4).
  - Tool loop with hard cap (Task 5).
  - System prompts with base + per-family + LoRA context (Task 2).
  - API key encrypted via safeStorage (Task 3).
  - Chat persistence in SQLite (Task 1 + Task 6).
  - Settings UI for API key, model, temperature (Task 7).
- **Placeholder scan:** No "TBD"/"TODO".
- **Type consistency:**
  - The structured response shape `{ positive: [{tag, type, category, lora_id?}], negative: [...], explanation? }` is documented in `base.js` and parsed by callers (Plan 4 will render it).
  - The 8 model-family enum values match Plan 1's enum.
  - IPC channel names use the `:` separator convention.

## Out-of-scope for Plan 3

- The Prompt Builder pane UI (Plan 4).
- Streaming token output (deferred — request/response is fine for v1).
- "Stop generation" button (no streaming yet, nothing to stop).
- HNSW or approximate-NN tag search — Plan 2's linear cosine is fast enough.
- Cross-vendor LLM support — DeepSeek only.
- Auto-titling sessions via a second AI call — first message's first 60 chars is fine for v1.
