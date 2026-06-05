// src/main/scanner/png-metadata.js
const fs = require('fs')
const path = require('path')

function extractPngMetadata(imagePath) {
  let buffer
  try {
    buffer = fs.readFileSync(imagePath)
  } catch {
    return null
  }

  const raw = readPngTextChunks(buffer)
  // Prefer `prompt` (ComfyUI API format: flat dict keyed by node ID with class_type + inputs)
  // over `workflow` (visual graph format: {nodes:[...], links:[...]} — not parseable the same way)
  const workflowJson = raw.prompt || raw.workflow || null
  if (!workflowJson) return null

  let workflow
  try {
    workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson
  } catch {
    return null
  }

  return parseComfyWorkflow(workflow)
}

function readPngTextChunks(buffer) {
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIG[i]) return {}
  }

  const chunks = {}
  let offset = 8

  while (offset < buffer.length - 12) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii')

    if (type === 'tEXt') {
      const data = buffer.slice(offset + 8, offset + 8 + length)
      const nullIdx = data.indexOf(0)
      if (nullIdx !== -1) {
        const key = data.slice(0, nullIdx).toString('ascii')
        const value = data.slice(nullIdx + 1).toString('latin1')
        chunks[key] = value
      }
    } else if (type === 'iTXt') {
      const data = buffer.slice(offset + 8, offset + 8 + length)
      const nullIdx = data.indexOf(0)
      if (nullIdx !== -1) {
        const key = data.slice(0, nullIdx).toString('ascii')
        const rest = data.slice(nullIdx + 1)
        const textStart = rest.indexOf(0, 2) + 1
        const langEnd = rest.indexOf(0, textStart)
        const transEnd = rest.indexOf(0, langEnd + 1)
        const value = rest.slice(transEnd + 1).toString('utf8')
        chunks[key] = value
      }
    } else if (type === 'IEND') {
      break
    }

    offset += 12 + length
  }

  return chunks
}

function parseComfyWorkflow(workflow) {
  const result = {
    seed: null,
    steps: null,
    cfg: null,
    sampler: null,
    scheduler: null,
    prompt: null,
    negative_prompt: null,
    checkpoint_name: null,
    loras: [],
    width: null,
    height: null,
  }

  if (!workflow || typeof workflow !== 'object') return result

  const nodes = Object.values(workflow)
  const textNodes = []

  for (const node of nodes) {
    if (!node || !node.class_type) continue
    const inputs = node.inputs || {}

    switch (node.class_type) {
      case 'KSampler':
      case 'KSamplerAdvanced':
        if (inputs.seed !== undefined) result.seed = String(inputs.seed)
        if (inputs.steps !== undefined) result.steps = Number(inputs.steps)
        if (inputs.cfg !== undefined) result.cfg = Number(inputs.cfg)
        if (inputs.sampler_name) result.sampler = inputs.sampler_name
        if (inputs.scheduler) result.scheduler = inputs.scheduler
        break

      case 'CLIPTextEncode':
        if (typeof inputs.text === 'string') textNodes.push(inputs.text)
        break

      case 'CheckpointLoaderSimple':
      case 'CheckpointLoader':
        if (inputs.ckpt_name) {
          result.checkpoint_name = path.basename(inputs.ckpt_name, path.extname(inputs.ckpt_name))
        }
        break

      case 'LoraLoader':
      case 'LoRALoader':
        if (inputs.lora_name) {
          result.loras.push({
            name: path.basename(inputs.lora_name, path.extname(inputs.lora_name)),
            weight: inputs.strength_model !== undefined ? Number(inputs.strength_model) : 1.0,
          })
        }
        break

      case 'EmptyLatentImage':
        if (inputs.width) result.width = Number(inputs.width)
        if (inputs.height) result.height = Number(inputs.height)
        break
    }
  }

  if (textNodes[0]) result.prompt = textNodes[0]
  if (textNodes[1]) result.negative_prompt = textNodes[1]

  return result
}

module.exports = { extractPngMetadata }
