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
    try {
      console.log('[presets:save] args keys:', Object.keys(args || {}))
      console.log('[presets:save] name:', args && args.name)
      console.log('[presets:save] positiveText length:', args && args.positiveText && args.positiveText.length)
      console.log('[presets:save] negativeText length:', args && args.negativeText && args.negativeText.length)
      console.log('[presets:save] loras count:', args && Array.isArray(args.loras) ? args.loras.length : 'not array')

      const {
        name, sourceMessageId, userDescription,
        positiveText, negativeText, positiveStructured, negativeStructured,
        modelFamily, checkpointId, temperature, loras,
      } = args

      if (!name) return { ok: false, reason: 'Missing name' }
      if (!positiveText) return { ok: false, reason: 'Missing positiveText' }
      if (!negativeText) return { ok: false, reason: 'Missing negativeText' }
      if (!positiveStructured) return { ok: false, reason: 'Missing positiveStructured' }
      if (!negativeStructured) return { ok: false, reason: 'Missing negativeStructured' }

      const db = getDatabase()
      const result = db.transaction(() => {
        const insertResult = db.prepare(`
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

        const presetId = insertResult.lastInsertRowid

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

      console.log('[presets:save] success, id:', result.id)
      return result
    } catch (err) {
      console.error('[presets:save] ERROR:', err && err.message, err && err.stack)
      return { ok: false, reason: 'Save failed: ' + (err && err.message || String(err)) }
    }
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
