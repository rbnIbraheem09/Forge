// src/main/ai/deepseek-client.js
//
// Thin wrapper around DeepSeek's OpenAI-compatible chat completions endpoint.
// Pulls API key from settings (decrypts via safeStorage). Supports function calling
// and JSON-mode response_format.
//
// MODEL IDS: the user specified deepseek-v4-flash (default) and deepseek-v4-pro.
// As of 2026-05, DeepSeek's documented model IDs are:
//   deepseek-chat      — the current fast/general-purpose model (was "deepseek-v3" family)
//   deepseek-reasoner  — the current thinking/reasoning model (was "deepseek-r1" family)
// The user-requested IDs "deepseek-v4-flash" / "deepseek-v4-pro" may not exist yet.
// If DEFAULT_MODEL returns HTTP 400 model_not_found, update it to "deepseek-chat".
// See https://api-docs.deepseek.com/ for the latest model list.

const { getDatabase } = require('../db/database')
const { getDecryptedSetting } = require('../ipc/settings')

const BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function getModel() {
  const db = getDatabase()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'deepseek_model'").get()
  return (row && row.value) || DEFAULT_MODEL
}

// Returns { ok: true, message, finishReason, usage } on success
// or { ok: false, status, reason } on failure.
// `message` is the assistant's message object from choices[0].message
// (may contain tool_calls when tools are provided).
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
    return { ok: false, status: 0, reason: 'Network error: ' + String((err && err.message) || err) }
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
