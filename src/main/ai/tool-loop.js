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
