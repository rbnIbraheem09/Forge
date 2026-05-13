# Prompt Builder — AI-Driven Danbooru Tag Generation

**Status:** Design
**Date:** 2026-05-13

## Summary

Replace the placeholder `Extras` pane with a new **Prompt Builder** pane that converts the user's natural-language description into a properly-structured Danbooru-style positive/negative prompt for Stable Diffusion / ComfyUI generation, using DeepSeek as the LLM provider.

The pane is chat-driven: the user describes the image they want in any natural-language form (a sentence, a paragraph, vague vibes, detailed scene-building — whatever feels natural), and the AI returns a copy-ready prompt. The user can iterate by sending follow-up messages. Each generation is grounded in the **full Danbooru tag library** (~150 k tags) via a function-calling pattern — the AI calls a local `search_tags` tool to discover real tags rather than receiving the library in context. Selected LoRAs from the user's existing Forge library can be attached to a generation; their trigger words are woven into the AI's output as visually distinct red tags, with an addendum listing the applied LoRA filenames.

Goal: replace the manual tag-clicking workflow most prompt builders force, while still giving the user a browsable tag reference and full control over which model family / LoRAs / temperature shape the output.

## Goals & non-goals

**Goals**
- A chat-driven UI where natural-language descriptions become Danbooru-style prompts.
- AI is grounded against the full Danbooru tag library via tool use — no curated subset.
- Per-checkpoint **model family** classification so the AI uses the correct quality / negative tags.
- LoRA selection sidebar — trigger words from selected LoRAs are inserted into the output and visually distinguished.
- Saved-presets library so generated prompts can be archived and reloaded.
- Local SQLite tag library with FTS5 + 384-dim embeddings (MiniLM, ONNX) for semantic search.
- Chat history persisted across app restarts so the user can return to a session.
- "Refresh tag library" action that re-pulls from Danbooru's API.
- Respect existing Forge IPC patterns, schema migration discipline, and warm-dark design system.

**Non-goals**
- Sending generated prompts directly to ComfyUI as a workflow (clipboard / save-to-preset is sufficient for v1).
- Auto-classifying checkpoint families from filenames (manual classification only — explicit user decision).
- Image generation, image preview, or any rendering of the resulting image inside Forge.
- Multi-provider LLM support (DeepSeek only for v1; the abstraction allows future providers but they're not built).
- A "Random pool" / dice-roll mechanic like the reference gist has — out of scope.
- BREAK separator support in v1 beyond a documented optional pass-through if AI inserts it.
- Per-LoRA strength editing inside the Prompt Builder — the addendum shows filenames only; strength stays a property of the LoRA record.
- Generated prompts being attachable to a `main_gens` record (separation: Prompt Builder produces prompts; Main Gens organizes generations).

## User stories

- *As a user*, I open the Prompt Builder, type "moody redhead portrait at sunset, slight smile", press Send, and ~10 seconds later see a clean Danbooru-style positive + negative prompt I can copy into ComfyUI.
- *As a user*, I follow up with "make her blonde and shift the scene to a rooftop", and the AI returns a revised prompt that preserves the rest of the context.
- *As a user*, I pick a checkpoint at the top of the pane and the AI tailors quality tags to that checkpoint's family (e.g. `score_9, score_8_up…` for Pony, `masterpiece, best quality, newest, absurdres` for Illustrious).
- *As a user*, I check two LoRAs in the right panel. The AI's next response includes their trigger words as red tags inside the positive prompt, and lists the LoRA filenames below the prompt as an addendum.
- *As a user*, I hit Save on a great response. It lands in a Saved Presets drawer with a name I can edit, the LoRAs frozen as a snapshot, the model family preserved.
- *As a user*, I close Forge and reopen it next week. My last chat session is still there, scrollable.
- *As a user*, I click "Refresh tag library" in settings when I hear that Danbooru added a bunch of new tags I want to use. The library re-pulls and re-indexes.

## Architecture

Two-process Electron split is preserved. All Danbooru tag data, AI calls, embedding model, and DB writes live in the **main** process. The renderer holds chat session state, LoRA selection state, and renders the structured AI response.

```
┌─────────────────── Renderer ───────────────────┐
│ PromptBuilder.jsx (route /prompt)              │
│   ├─ TagLibraryPanel (left)                    │
│   ├─ ChatPane (center)                         │
│   │   ├─ Transcript (user + AI bubbles)        │
│   │   └─ InputDock (textarea + temp + send)    │
│   └─ LoRAPicker (right)                        │
│                                                 │
│ PromptBuilderContext                            │
│   ├─ activeSessionId                            │
│   ├─ selectedLoraIds (Set)                      │
│   ├─ selectedCheckpointId                       │
│   ├─ temperature                                │
│   └─ inFlight (boolean)                         │
└────────────────────┬───────────────────────────┘
                     │ window.forge.prompt.*
┌────────────────────▼───────────────────────────┐
│ Main process                                   │
│   ipc/prompt.js                                │
│     ├─ prompt:send         (streaming response)│
│     ├─ prompt:search-tags  (tool exposure)     │
│     ├─ prompt:history                          │
│     ├─ prompt:sessions     (list/new/delete)   │
│     ├─ prompt:saved        (list/save/delete)  │
│     └─ prompt:library      (status/refresh)    │
│                                                 │
│   ai/deepseek-client.js                        │
│     └─ tool-loop runner (calls back into       │
│        search-tags as a function call until    │
│        AI emits final JSON)                    │
│                                                 │
│   tags/                                        │
│     ├─ library-loader.js (download/refresh)    │
│     ├─ embedder.js       (MiniLM via ORT)      │
│     └─ search.js         (FTS5 + cosine)       │
│                                                 │
│   db/                                          │
│     ├─ danbooru_tags + danbooru_tags_fts       │
│     ├─ prompt_chat_sessions                    │
│     ├─ prompt_chat_messages                    │
│     ├─ saved_prompts                           │
│     └─ saved_prompt_loras                      │
└─────────────────────────────────────────────────┘
```

The AI tool-loop is the load-bearing pattern: when the user sends a message, the main process opens a chat completion with DeepSeek, exposes `search_tags(query, limit?)` as a function, and re-feeds the AI's tool calls (one per round) until the AI emits a final structured JSON response. Each tool call is satisfied by a local SQLite + embedding lookup, not a network hop.

## User experience

### Layout

Three-column flex layout filling the route:

| Column | Width | Contents |
|---|---|---|
| **Left** | 220 px | Tag Library — searchable browse view of the top Danbooru tags (popularity-ordered), grouped by category. Click a tag to drop it into the textarea as text. |
| **Center** | flex | Chat transcript + input dock. Top bar shows pane title and the **active checkpoint** (with its detected family) as a small label, plus `↺ New chat` and `⎘ Saved` buttons. |
| **Right** | 270 px | LoRA Picker — searchable list of the user's LoRAs from the existing `loras` table. Click row or checkbox to select. Selected count shown top-right. |

The pane consumes the same `<main>` slot used by other Forge pages. No new sidebar pattern; the existing left sidebar from `Sidebar.jsx` continues to control top-level navigation. The "Extras" entry in `Sidebar.jsx` is renamed to **"Prompt"** and routes to `/prompt`.

### Chat transcript

- **User messages** right-aligned, bubble fill `#242118`, rounded with one corner squared (`12px 12px 4px 12px`).
- **AI responses** left-aligned, fill `#1a1813`, rounded `12px 12px 12px 4px`. Each AI message is structured:
  - Header row: label `+ Positive` (yellow) and ghost-icon Copy / Save buttons (top-right).
  - Tag run: positive tags as colored chips (palette below).
  - Header row: label `− Negative` (red) and ghost-icon Copy button.
  - Tag run: negative tags.
  - **Addendum** (only when LoRAs were applied): dashed top border, label `LoRAs applied:`, then each LoRA's `.safetensors` filename. Non-interactive — informational only.
- The **latest AI response** is highlighted with a yellow border (`rgba(232,200,32,0.4)`) and a subtle yellow halo (`box-shadow 0 0 0 1px rgba(232,200,32,0.15)`). Earlier responses revert to the unhighlighted style. This re-renders on every new message.

### Tag color palette in output

Categories map to colors already used in Forge's design system or borrowed from the reference gist:

| Category | Background | Foreground |
|---|---|---|
| Quality (`masterpiece`, `score_9`, etc.) | `rgba(198, 120, 221, 0.18)` | `#c678dd` (purple) |
| Subject (`1girl`, `red hair`, etc.) | `rgba(122, 160, 232, 0.18)` | `#7aa0e8` (blue — Checkpoint accent) |
| Style (`cinematic`, `golden hour`) | `rgba(232, 200, 32, 0.15)` | `#e8c820` (Forge yellow) |
| Camera (`bokeh`, `depth of field`) | `rgba(86, 182, 194, 0.18)` | `#56b6c2` (cyan) |
| Negative tags (always in negative block) | `rgba(224, 108, 117, 0.18)` | `#e06c75` (red-coral) |
| **LoRA trigger** | `rgba(232, 80, 80, 0.18)` | `#ff6b6b` (red), `font-weight: 600`, `border: 1px dashed rgba(232, 80, 80, 0.4)` |

The AI emits one of 12 categories in its JSON response (`quality | subject | style | camera | scene | pose | clothing | expression | lighting | composition | anatomy | other`). The renderer collapses them onto the 5 color groups above:

| AI category | Display color |
|---|---|
| `quality` | purple |
| `subject`, `anatomy`, `expression`, `clothing` | blue |
| `style`, `lighting` | yellow |
| `camera`, `composition` | cyan |
| `scene`, `pose` | orange (`#d19a66`) |
| `other` | neutral (`#bfb8a8` on `#242118`) |

Negative-block tags ignore category entirely and render in the negative red regardless.

### Input dock

Sticky bottom. Above the textarea, **selected LoRA pills** render in sage green (`#7daa88`, the LoRA accent color), each with a `×` to deselect. Inside the dock:

- Textarea (auto-grow 1–6 lines, ⌘/Ctrl+Enter to send).
- Below textarea, a thin divider then a row with:
  - Left: small pill `⬡ V4-Flash` (DeepSeek model badge) and the current model family label.
  - Right: temperature slider 0.0 → 2.0 with `1.0` default; tick mark at 1.5 with subtitle "may hallucinate tags" on hover. Slider tooltip notes "DeepSeek recommends 0.6–0.8 for the most reliable tag selection."
- Send button (yellow fill `#e8c820`, primary).

### First-launch download flow

On the first visit to `/prompt` (or anytime the tag library is empty / out-of-date), the pane shows a centered modal:

> **Danbooru tag library not yet downloaded**
>
> Forge needs to download ~150 k Danbooru tags and build a local index (~30 MB total). This is a one-time setup; refreshes later are incremental.
>
> [Download tag library] [Skip for now]

Skip leaves the pane in a non-functional state (input dock disabled with explanatory tooltip). Download shows progress: download → embed (the embedder generates 384-d vectors for each tag, batched 64 at a time; takes 2–4 min on M-series).

## Data model

### Schema migration (user_version 4 → 5)

```sql
-- All new tables; add to schema.sql with CREATE TABLE IF NOT EXISTS
CREATE TABLE IF NOT EXISTS danbooru_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,                -- canonical, spaces not underscores
  category INTEGER NOT NULL DEFAULT 0,      -- 0=general 1=artist 3=copyright 4=character 5=meta
  post_count INTEGER NOT NULL DEFAULT 0,
  aliases TEXT,                             -- comma-separated alternative names
  embedding BLOB                            -- 384 floats × 4 bytes = 1536 bytes when indexed
);

CREATE VIRTUAL TABLE IF NOT EXISTS danbooru_tags_fts USING fts5(
  name, aliases,
  content='danbooru_tags', content_rowid='id'
);

-- FTS sync triggers
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

CREATE TABLE IF NOT EXISTS prompt_chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,                               -- auto-derived from first message, user-editable
  checkpoint_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES prompt_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
  content TEXT,                             -- raw text for user/tool; null for assistant
  structured_response TEXT,                 -- JSON of typed tags for assistant
  lora_ids_snapshot TEXT,                   -- JSON array of lora ids active at send time
  model_family TEXT,
  temperature REAL,
  tool_calls_count INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source_message_id INTEGER REFERENCES prompt_chat_messages(id) ON DELETE SET NULL,
  user_description TEXT,                    -- the natural-language input that produced this
  positive_text TEXT NOT NULL,              -- ready-to-paste prompt string
  negative_text TEXT NOT NULL,
  positive_structured TEXT NOT NULL,        -- JSON of typed tags for re-rendering
  negative_structured TEXT NOT NULL,
  model_family TEXT,
  checkpoint_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  temperature REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_prompt_loras (
  saved_prompt_id INTEGER NOT NULL REFERENCES saved_prompts(id) ON DELETE CASCADE,
  lora_id INTEGER REFERENCES loras(id) ON DELETE SET NULL,
  lora_filename_snapshot TEXT NOT NULL,     -- frozen at save time
  trigger_words_snapshot TEXT NOT NULL,     -- frozen at save time
  PRIMARY KEY (saved_prompt_id, lora_id)
);
```

### `ALTER` to existing tables

```sql
ALTER TABLE models ADD COLUMN family TEXT;  -- nullable; user classifies manually
```

Wrapped in `try { db.exec(...) } catch {}` inside a `if (version < 5)` block in `database.js`, matching the existing idempotency pattern.

After applying: `db.pragma('user_version = 5')`.

### Model family enum (enforced in IPC handlers, not DB)

| Stored value | Display label |
|---|---|
| `pony_xl` | Pony Diffusion XL |
| `illustrious` | Illustrious / NoobAI |
| `animagine_xl` | Animagine XL |
| `sdxl_realistic` | SDXL — Realistic |
| `sdxl_anime` | SDXL — Anime / Generic |
| `sd15_anime` | SD 1.5 — Anime |
| `sd15_realistic` | SD 1.5 — Realistic |
| `other` | Other / Generic |

Stored as snake_case strings, displayed via a lookup map in the renderer. Null `family` is treated as `other` in the system prompt builder.

### New settings keys

| Key | Value |
|---|---|
| `deepseek_api_key` | encrypted via Electron `safeStorage` then base64; null when unset |
| `deepseek_model` | default `'deepseek-v4-flash'` |
| `prompt_default_temperature` | default `'1.0'` (DeepSeek's recommended range for structured tasks is 0.6–0.8; we honor the user's stated 1.0 default and surface the tradeoff in the slider tooltip) |
| `danbooru_library_version` | ISO date of last successful refresh |
| `danbooru_library_count` | tag count after last refresh |
| `danbooru_library_indexed` | `'true'` once embeddings are populated |

`safeStorage` uses the OS keychain on macOS (Keychain), Windows (DPAPI), and Linux (libsecret). The encrypted blob is what lives in the `settings` table; nothing else changes.

## AI integration

### Provider

DeepSeek over their OpenAI-compatible REST endpoint (`https://api.deepseek.com/v1/chat/completions`). Default model: `deepseek-v4-flash` (supports function calling and temperature). A `deepseek-v4-pro` option is exposed in settings but disables the temperature slider (V4-pro is the R1-equivalent and ignores temperature per DeepSeek's API behavior).

### Tool-loop runner

The AI doesn't see the tag library in its context. Instead, when the user sends a message:

1. The main process opens a chat completion with the AI **and** declares a single function tool:

    ```jsonc
    {
      "name": "search_tags",
      "description": "Search the local Danbooru tag library and return the top matches by semantic similarity + popularity. Use this to find canonical tag names for concepts you want to include in the output.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "A concept or phrase to find tags for, e.g. 'red hair shades', 'golden hour lighting', 'soft smile'." },
          "category": { "type": "string", "enum": ["general","character","copyright","artist","meta","any"], "default": "any" },
          "limit": { "type": "integer", "default": 20, "maximum": 50 }
        },
        "required": ["query"]
      }
    }
    ```

2. The AI receives:
    - **System prompt** (templated per model family — see *System prompt* below).
    - **User context block** (selected LoRAs + their trigger words, selected checkpoint family, the user's natural-language message, conversation history if any).
3. The AI emits zero or more `tool_call`s. Each is satisfied by `tags/search.js`:
    - Embed the `query` with MiniLM → cosine-similarity against `danbooru_tags.embedding`.
    - Also run FTS5 `MATCH` against `danbooru_tags_fts`.
    - Merge by reciprocal rank fusion, return top `limit` results as `[{name, post_count, category, aliases}]`.
4. Tool results are appended to the message history with role `tool`. The loop continues until the AI emits a final non-tool response.
5. The final response must be valid JSON matching the schema below; we enforce this with DeepSeek's `response_format: { type: 'json_object' }` in the final call.

The loop has a hard cap of **8 tool calls** per generation to prevent runaway. If reached, we force-finalize by setting `tool_choice: 'none'` on the next call.

### Structured response schema

The AI's final response MUST be a JSON object of the form:

```jsonc
{
  "positive": [
    { "tag": "1girl", "type": "danbooru", "category": "subject" },
    { "tag": "red hair", "type": "danbooru", "category": "subject" },
    { "tag": "cinematicMood_v2", "type": "lora_trigger", "lora_id": 14 },
    { "tag": "(soft smile:1.15)", "type": "danbooru", "category": "subject" },
    { "tag": "masterpiece", "type": "danbooru", "category": "quality" }
  ],
  "negative": [
    { "tag": "worst quality", "type": "danbooru", "category": "quality" },
    { "tag": "bad anatomy", "type": "danbooru", "category": "anatomy" }
  ],
  "explanation": "Optional one-sentence note about choices made (e.g., 'Inserted cinematicMood_v2 at front; rest follows Illustrious convention')."
}
```

The renderer derives `positive_text` and `negative_text` by joining each array with `, ` (comma-space). `type: lora_trigger` chips render with the red dashed style; everything else renders by `category`.

If the AI returns malformed JSON (rare with `json_object` enforcement, but possible), the main process retries once with a "your previous response wasn't valid JSON" follow-up, then surfaces a friendly error to the renderer.

### System prompt

Stored in `src/main/ai/system-prompts/` as one base prompt plus per-family suffixes. The base prompt encodes the rules synthesized from the research:

> You are a prompt engineer specializing in Danbooru-style tag prompts for Stable Diffusion image generators.
>
> **Output format**
> - Output a single JSON object with `positive`, `negative`, and optional `explanation` keys.
> - Each item in `positive` and `negative` is `{ tag, type, category }` (and `lora_id` for type=`lora_trigger`).
> - `type` is `danbooru` for canonical tags and `lora_trigger` for trigger words from the user's LoRAs.
> - `category` is one of: `quality`, `subject`, `style`, `camera`, `scene`, `pose`, `clothing`, `expression`, `lighting`, `composition`, `anatomy`, `other`.
> - Use **spaces, not underscores** (`long hair`, not `long_hair`). Escape parens in character/series tags (`hatsune miku \(vocaloid\)`).
> - All tags should be canonical Danbooru tags discoverable via the `search_tags` tool. **Do not invent tag names.** If you're not sure a tag exists, search for it first.
>
> **Workflow**
> 1. Read the user's description and identify the concepts to encode: subject, appearance, clothing, pose, expression, lighting, scene, composition, camera framing, quality.
> 2. For each concept group, call `search_tags` with a descriptive query. Prefer 3–6 well-chosen searches over 12+ narrow ones.
> 3. From each result list, pick the most popular tags that match the user's intent (`post_count` is a strong relevance signal).
> 4. Insert any LoRA trigger words provided by the user as `lora_trigger` items at sensible positions in the positive prompt — typically near the front for style LoRAs and near the subject for character LoRAs.
> 5. Apply the model family's quality + negative preset (see family-specific instructions below).
> 6. Emit the final JSON.
>
> **Constraints**
> - Aim for 15–25 tags total in the positive prompt (50–70 CLIP tokens).
> - Aim for 6–12 tags in the negative prompt.
> - Weight conservatively — `(tag:1.15)` to `(tag:1.3)` for emphasis, `(tag:0.7)` to `(tag:0.85)` for de-emphasis. Only weight 0–2 tags per prompt. Never weight every tag.
> - **Tag what is visible**, not what is implied (don't tag shoes in a portrait shot).
> - Convert natural-language phrasing into canonical tags. Reject `"beautiful girl with flowing red hair"` and emit `1girl, solo, long hair, red hair, beautiful` instead.

Per-family suffix appended for the active checkpoint family. Examples:

**Pony Diffusion XL:**
> - Start the positive prompt with `score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up`.
> - Pony's quality tags ARE the quality system — do not also use `masterpiece` or `best quality`.
> - Start the negative prompt with `score_4, score_5, score_6`.
> - Include a rating tag (`rating_safe`, `rating_questionable`, `rating_explicit`) based on user intent; default to `rating_safe` when unclear.

**Illustrious / NoobAI:**
> - End the positive prompt with `masterpiece, best quality, newest, absurdres, highres`.
> - Include date tag `newest` (NoobAI-specific).
> - Start the negative prompt with `worst quality, old, early, low quality, lowres, signature, watermark`.

**Animagine XL:**
> - Start the positive prompt with `masterpiece, best quality, very aesthetic, absurdres`.
> - Start the negative prompt with `worst quality, low quality, lowres, jpeg artifacts, signature, watermark`.

**SDXL — Realistic:**
> - Start the positive prompt with `photorealistic, 8k, hyperdetailed, sharp focus, professional photography`.
> - Start the negative prompt with `cartoon, anime, illustration, painting, blurry, low quality`.

**SDXL — Anime / Generic, SD 1.5 — Anime, SD 1.5 — Realistic, Other:** similar dedicated suffixes documented inline in `src/main/ai/system-prompts/`.

### LoRA context injection

When the user sends a message with N LoRAs selected, the main process prepends this block to the conversation as a system-role addendum:

```
The user has selected the following LoRA models to apply. Each LoRA has trigger
words that must be included as type="lora_trigger" items in the positive prompt.
These trigger words are NOT Danbooru tags — emit them exactly as written.

LoRAs:
  - id 14, file "cinematic-mood-style-v2.safetensors", triggers: cinematicMood_v2
  - id 22, file "moody-portrait-trigger-pack.safetensors", triggers: moodyPortrait
```

The AI uses `lora_id` in the structured output to identify which LoRA each trigger came from; the renderer uses that to build the addendum.

## Tag library

### Source

Primary: `a1111-sd-webui-tagcomplete`'s `tags/danbooru.csv` ([GitHub source](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete/blob/main/tags/danbooru.csv)). It's a ~10 MB CSV with `name,category,post_count,aliases` rows, MIT-licensed, refreshed periodically.

Refresh: pulled directly from raw.githubusercontent.com on first launch and again when the user clicks "Refresh tag library" in settings. We do not hit Danbooru's live API in v1; a future enhancement can add it as a fallback.

### Storage

Parsed line-by-line, transformed (underscores → spaces, parens unescaped), inserted into `danbooru_tags` in batched transactions (1000 rows per `db.transaction`). Total time on M-series: ~5–8 seconds for the insert phase.

### Embedding

Model: `Xenova/all-MiniLM-L6-v2` (the quantized ONNX variant, ~22 MB on disk). Inference via `onnxruntime-node`, which is already compatible with `electron-rebuild` since it ships pre-built native binaries per platform.

The model file is downloaded on first-launch tag-library setup (same modal, sequential after CSV download). Once present, embeddings for all ~150 k tags are computed in batches of 64, written to `danbooru_tags.embedding` as raw float32 `Buffer`s (384 dimensions × 4 bytes = 1536 bytes/tag).

Total indexing time on M-series: ~3–4 min. Index is one-shot — refreshing the library only re-embeds new or changed tags (we compare against the previous CSV's row hashes).

### Search

`tags/search.js`'s `searchTags(query, options)`:

1. Embed `query` with the same MiniLM model.
2. Run cosine similarity against all rows where `embedding IS NOT NULL`. With 150 k × 384-d float32, the in-memory matrix is ~225 MB; we keep it cached in main-process memory after first load. Cosine across all rows is ~15–25 ms.
3. Also run FTS5 `MATCH '"<query>"*'` against `danbooru_tags_fts` → top 50 by `bm25(danbooru_tags_fts) * (1 + log(post_count))`.
4. Merge the two ranked lists by **reciprocal rank fusion** (k=60) for the final ranking.
5. Return top `limit` (default 20).

The same function backs both the AI tool call and the left-panel search bar.

## IPC contract

New namespace `window.forge.prompt`:

| Method | IPC channel | Returns |
|---|---|---|
| `send(args)` | `prompt:send` | streaming via `prompt:chunk` events; final returns `{ messageId }` |
| `searchTags(query, options)` | `prompt:search-tags` | `[{name, post_count, category, aliases}]` |
| `history(sessionId)` | `prompt:history` | `[{role, content, structured_response, ...}]` |
| `newSession(checkpointId?)` | `prompt:new-session` | `{ sessionId }` |
| `listSessions()` | `prompt:list-sessions` | `[{id, title, updated_at, message_count}]` |
| `deleteSession(id)` | `prompt:delete-session` | `true` |
| `renameSession(id, title)` | `prompt:rename-session` | `true` |
| `savedList()` | `prompt:saved-list` | `[saved_prompts row + loras]` |
| `savedSave(args)` | `prompt:saved-save` | `{ savedId }` |
| `savedDelete(id)` | `prompt:saved-delete` | `true` |
| `savedRename(id, name)` | `prompt:saved-rename` | `true` |
| `libraryStatus()` | `prompt:library-status` | `{ version, count, indexed, embedderReady }` |
| `libraryRefresh()` | `prompt:library-refresh` | streaming via `prompt:library-progress` events; final returns `{ added, updated, removed }` |

Extensions to existing `window.forge.models`:

| Method | Change |
|---|---|
| `update({ id, family })` | accepts new `family` field; validated against enum |

Streaming events on `window.forge.on(channel, cb)` — extend the preload allowlist:

| Channel | Payload |
|---|---|
| `prompt:chunk` | `{ messageId, delta }` for token streaming during AI generation |
| `prompt:tool-call` | `{ messageId, query, results_count }` (lightweight tool-use telemetry for the spinner) |
| `prompt:library-progress` | `{ phase: 'download'|'parse'|'embed', current, total }` |

## Settings page additions

A new section "Prompt Builder" added to `Settings.jsx`:

- **DeepSeek API key** — masked input with show/hide toggle. Stored via `safeStorage`. A "Test connection" button issues a minimal chat completion and reports success/failure.
- **DeepSeek model** — dropdown: `deepseek-v4-flash` (default), `deepseek-v4-pro`. Notes that V4-pro disables the temperature slider.
- **Default temperature** — slider, default 1.0.
- **Tag library** — status row: "152,398 tags · last refreshed 2026-04-30 · indexed." Button: "Refresh from Danbooru" (or "Refresh library").
- **Embedder model** — status row: "Xenova/all-MiniLM-L6-v2 (ONNX) · ready." Button: "Re-download" if user wants to repair.

## Sidebar / routing changes

- `Sidebar.jsx`: rename `{ icon: '📝', label: 'Extras', to: '/extras' }` → `{ icon: '✨', label: 'Prompt', to: '/prompt' }`.
- `App.jsx`: replace `<Route path="/extras" element={<Extras />} />` with `<Route path="/prompt" element={<PromptBuilder />} />`.
- Delete `src/renderer/pages/Extras.jsx`. Add `src/renderer/pages/PromptBuilder.jsx`.

## Error handling

- **No API key set:** the input dock is disabled with a banner: "Set your DeepSeek API key in Settings to start generating." Send button gone; clicking the banner deep-links to Settings.
- **API call fails (network, 4xx, 5xx):** the AI bubble shows a red-border error state with the message "Generation failed: <reason>" and a retry button. The user's message stays in the transcript.
- **AI emits malformed JSON twice in a row:** error state with copy of the raw response so the user can salvage manually.
- **Tool-loop exceeds 8 calls:** continue with `tool_choice: 'none'` for one more turn, then surface a "your request was too complex — try simpler phrasing" if still no valid JSON.
- **Tag library not downloaded:** modal blocks pane; no Send.
- **Embedder model missing:** silent fallback to FTS-only search; show a yellow warning ribbon at the top of the pane.

## Design system token additions

Add to `src/renderer/index.css` and mirror in `tailwind.config.js`:

| Token | Value | Used for |
|---|---|---|
| `--lora-red` | `#ff6b6b` | LoRA trigger tag foreground |
| `--lora-red-bg` | `rgba(232, 80, 80, 0.18)` | LoRA trigger tag background |
| `--lora-red-border` | `rgba(232, 80, 80, 0.4)` | LoRA trigger tag dashed border |
| `--cyan` | `#56b6c2` | Camera category tags |
| `--purple` | `#c678dd` | Quality category tags |

Motion: standard ease-out-expo `[0.16, 1, 0.3, 1]` from `src/renderer/lib/motion.js`. New variants:

- `aiMessageVariant` — fade-in + slight scale (0.96 → 1.0) for newly-arriving AI responses.
- `toolCallPulse` — subtle background pulse on the "searching tags…" indicator below the latest user message while the AI is mid-tool-loop.

Respect `prefers-reduced-motion` (already wired).

## Performance & resource considerations

- **DB size growth:** ~150 k tags × (avg 40 bytes name + 1536 bytes embedding) ≈ **240 MB**. Acceptable for a local desktop tool; mentioned in the first-launch modal so the user knows.
- **Memory:** the embedding matrix is held in main-process RAM as a Float32Array (~225 MB). Searches are O(n) per query but fast (~15–25 ms). If this becomes a problem we can add Approximate-NN via `hnswlib-node` in a later session.
- **First-launch time:** download (~10 s) + parse (~5 s) + embed (~3–4 min) on M-series. Slower on Intel Macs. Modal shows progress so the user knows it's working.
- **Per-generation latency:** typical 5–12 s end-to-end. Streaming tokens to the renderer keeps the chat feeling alive.

## Testing

No test framework is currently configured (per CLAUDE.md). Manual test plan for each implementation chunk:

1. **Schema migration** — open a forge.db at user_version 4 in a backup copy, verify it migrates cleanly to 5 with all new tables and the `models.family` column added.
2. **Tag library download** — fresh install, observe modal, verify ~150 k rows in `danbooru_tags`, FTS5 sync triggers fire (insert a test row and confirm it appears in `danbooru_tags_fts`).
3. **Embedder index** — verify all rows get a non-null embedding within ~5 min on test machine; verify cosine search returns sensible results for "red hair" → `red hair, auburn hair, crimson hair, …`.
4. **Tool loop happy path** — send "moody redhead portrait at sunset", verify AI calls `search_tags` 3–6 times, emits valid JSON, renders without errors.
5. **LoRA injection** — select 2 LoRAs with trigger words, verify trigger tags appear in red, addendum lists both filenames.
6. **Family-aware output** — switch checkpoint from Illustrious to Pony; verify quality tags change from `masterpiece, best quality, newest, absurdres` to `score_9, score_8_up, …`.
7. **Save + reload preset** — save a generation, reload Forge, verify preset still there with LoRAs snapshot intact even if a LoRA's trigger words were changed in-between.
8. **Chat history persistence** — close Forge mid-session, reopen, verify last session loads with full transcript.
9. **Refresh library** — change CSV in test, hit Refresh, verify new tags appear and FTS picks them up.
10. **No API key flow** — clear `deepseek_api_key`, verify banner appears and Send is disabled.
11. **Malformed JSON recovery** — temporarily force the AI to return non-JSON; verify retry + error surface.

## Open questions / risks

- **DeepSeek V4 model IDs unverified.** The user specified `deepseek-v4-flash` / `deepseek-v4-pro`; the actual API model strings should be validated against DeepSeek's current API docs during implementation. If the strings differ, the spec value is wrong but the rest of the integration is unaffected.
- **Embedder license & runtime stability.** `Xenova/all-MiniLM-L6-v2` is Apache-2.0; `onnxruntime-node` ships native binaries that have historically had issues with `electron-rebuild`. Implementation should validate that `onnxruntime-node` loads in the packaged Electron app, not just in `npm run dev`. Fallback: `@xenova/transformers` package (pure-JS WASM), slower but more portable.
- **Tag list canonicalization for parentheses.** Some Danbooru tags contain parens (`hatsune miku (vocaloid)`). The CSV stores them unescaped; we escape them only when assembling the final prompt string. The structured `tag` field stays unescaped.
- **DB size on machines with small SSDs.** 240 MB is fine for most, but worth a "tag library size" line in settings so the user can see and trigger a "shrink: drop embeddings, keep FTS-only" option if needed (deferred; not in v1).
- **Streaming + tool-calls in DeepSeek.** OpenAI-compatible streaming with `tool_calls` is well-supported in their API but worth a single integration test early — if streaming breaks during tool-use, we fall back to non-streaming for the final completion only.
- **Token-stream UX during the tool loop.** The user sees a "searching tags…" indicator while the AI loops. We should decide if individual tag streams from the final response feel better, or if a single in-place reveal is cleaner. Either works; recommend trying token-stream first.
