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
