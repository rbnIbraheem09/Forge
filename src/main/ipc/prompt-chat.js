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
