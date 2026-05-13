# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Forge is a macOS desktop app (Electron + React + SQLite) for managing ComfyUI image generations as a structured creative journal. It watches a ComfyUI `output/` folder, parses metadata from PNG `tEXt`/`iTXt` chunks, and lets the user assign generations into "Main Gens" with iterations, LoRAs, and checkpoints.

## Commands

```bash
npm run dev        # concurrently: Vite (port 5173) + Electron, waits on Vite
npm run dev:vite   # Vite only (renderer)
npm run dev:electron  # Electron only (expects Vite on :5173)
npm run build      # vite build → electron-builder (produces .dmg in dist/package)
npm run postinstall  # electron-rebuild for better-sqlite3 — runs automatically after `npm install`
```

No test framework, linter, or formatter is configured. Don't invent commands.

If `better-sqlite3` fails to load after install, re-run `npm run postinstall` — it's a native module that must be rebuilt against the Electron ABI.

## Architecture

Two-process Electron app. The split is enforced — the renderer never touches the filesystem or DB directly.

### Main process (`src/main/`)
- `index.js` — window setup, registers `forge://` protocol, registers all IPC handlers on app ready, starts the output-folder watcher.
- `preload.js` — exposes `window.forge.*` to the renderer via `contextBridge` (the only renderer→main bridge). `contextIsolation: true`, `nodeIntegration: false`.
- `protocol.js` — registers the custom `forge://` scheme. Two routes:
  - `forge://thumb/<absolute-path>` → 320px JPEG thumbnail via `nativeImage.createThumbnailFromPath`, cached on disk under `userData/thumbnails/<md5>.jpg`.
  - `forge:///<absolute-path>` → streams the original file.
  Path parsing is deliberately careful — Chromium lowercases the hostname but not the path; see comments in `protocol.js` before changing.
- `db/database.js` — singleton `better-sqlite3` connection at `userData/forge.db` with `journal_mode=WAL`, `foreign_keys=ON`. Schema versioning uses `PRAGMA user_version`; bumping the version requires both updating `schema.sql` and adding an `ALTER`/backfill block before the new `user_version` is set (current version: 8).
- `db/schema.sql` — full DDL (idempotent `CREATE TABLE IF NOT EXISTS`). Core tables: `main_gens`, `iterations`, `iteration_loras`, `iteration_custom_fields`, `loras`, `models` (checkpoints), `inbox_items`, `global_field_templates`, `settings`. `models.family` is a nullable enum classifying each checkpoint by prompt-style family: `pony_xl`, `illustrious`, `animagine_xl`, `sdxl_realistic`, `sdxl_anime`, `sd15_anime`, `sd15_realistic`, `other`. The enum is mirrored in `src/renderer/lib/model-families.js` and `src/main/ipc/models.js` — keep them in sync. The Danbooru tag library lives in `danbooru_tags` (with `danbooru_tags_fts` FTS5 virtual table and three sync triggers — keep them aligned if the schema changes) and is populated from `a1111-sd-webui-tagcomplete`'s `tags/danbooru.csv` via the Settings "Refresh tag library" action. `prompt_chat_sessions` and `prompt_chat_messages` hold the Prompt Builder's persisted chat history; messages CASCADE on session delete. The assistant's structured tag response is stored as JSON in `structured_response` for re-rendering without re-calling the AI. The pane itself lives at `src/renderer/pages/PromptBuilder.jsx` with child components under `src/renderer/components/prompt/`. Generated prompts can be archived to `saved_prompts` (with `saved_prompt_loras` snapshotting LoRA trigger words at save time, so renaming a LoRA's triggers later doesn't corrupt old presets).
- `scanner/output-scanner.js` — chokidar watcher on the user's output folder. New PNGs go into `inbox_items`; emits `inbox:new-item` IPC event to renderer. On startup, calls `backfillMissingMetadata()` which re-parses PNGs for any row missing fields (idempotent — safe to run anytime).
- `scanner/png-metadata.js` — reads PNG `tEXt`/`iTXt` chunks. Prefers the `prompt` chunk (ComfyUI API format: flat dict keyed by node ID with `class_type` + `inputs`) over `workflow` (visual graph format, not parsable the same way). Extracts seed/steps/cfg/sampler/scheduler/prompts/checkpoint/loras/dimensions from `KSampler`, `CLIPTextEncode`, `CheckpointLoaderSimple`, `LoraLoader`, and `EmptyLatentImage` nodes.
- `scanner/folder-scanner.js` — recursive scan of LoRA/checkpoint folders for `.safetensors`/`.ckpt`/`.pt` files. Sets `status = 'online'` for found files, `'offline'` for previously-known names not in the current scan.
- `ipc/*.js` — one file per namespace (`inbox`, `main-gens`, `iterations`, `loras`, `models`, `dashboard`, `search`, `settings`). Each exports `registerXxxHandlers()` called once from `index.js`. All multi-statement writes go through `db.transaction(...)()`.

### Renderer (`src/renderer/`)
- `App.jsx` — `HashRouter` + `ToastProvider` + `InboxProvider`. Listens for ⌘K/Ctrl+K to open `SearchOverlay`. Shows `OnboardingModal` on first launch (when `output_folder` is unset and `onboarding_done` is not `'true'`).
- `context/InboxContext.jsx` — subscribes to `inbox:new-item` IPC event for the sidebar badge count.
- `context/ToastContext.jsx` — `useToast()` hook.
- `lib/motion.js` — shared Framer Motion variants (`fadeUp`, `stagger`, `scaleIn`, `slideInRight`, `toastVariant`, `overlayBg`). All use ease-out-expo `[0.16, 1, 0.3, 1]`.
- `components/GalleryGrid.jsx` — uses `forge://thumb<absolute-path>` for thumbnails (NOT `file://`).

### IPC contract
Renderer calls the typed API exposed at `window.forge.*` (see `src/main/preload.js` for the full surface). Channel naming is `<namespace>:<verb>`. The only event channel the renderer can subscribe to via `window.forge.on(...)` is `inbox:new-item` — the allowlist is enforced in preload.

When adding a new IPC handler:
1. Add the handler in `src/main/ipc/<namespace>.js`.
2. Expose it in `src/main/preload.js` under `window.forge.<namespace>`.
3. Register the handler module in `src/main/index.js` if it's a new namespace.

### Settings & onboarding state
All app config lives in the `settings` SQLite table as key/value text. Keys used: `output_folder`, `checkpoints_folder`, `loras_folder`, `onboarding_done`, plus user preferences (e.g. gallery size). Changing `output_folder` requires `window.forge.scanner.restart()` to re-watch.

## Design system

See `.impeccable.md` for the full visual spec. Critical conventions:

- **Theme is warm dark** (amber-tinted near-black), never cool blue-gray. Surfaces: `#0f0e0b` → `#1a1813` → `#242118`. Accent: yellow `#e8c820`. Secondary: blue `#7aa0e8` for checkpoints. Tertiary: sage `#7daa88` for LoRAs.
- All design tokens are CSS custom properties in `src/renderer/index.css` (`--bg`, `--surface`, `--yellow`, etc.) AND mirrored in `tailwind.config.js` under `colors.forge.*`. **Keep these two in sync** when adding tokens.
- Fonts: **Bricolage Grotesque** (headings, via `.font-display` or h1–h4) and **Figtree** (body/UI default). Both loaded from Google Fonts.
- Motion: always import variants from `src/renderer/lib/motion.js`. Standard easing is `[0.16, 1, 0.3, 1]`. Respect `prefers-reduced-motion` (already wired in `index.css`).

## Implementation plan reference

`docs/superpowers/plans/2026-05-06-forge-sessions-2-7.md` and `docs/superpowers/specs/2026-05-06-forge-sessions-2-7-design.md` contain the original 7-session build plan and design spec. Consult them when in doubt about why a particular table column or IPC channel exists.
