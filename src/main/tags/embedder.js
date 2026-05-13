// src/main/tags/embedder.js
//
// Local MiniLM (all-MiniLM-L6-v2) embedding via @huggingface/transformers.
// Outputs 384-dim normalized float32 vectors. Model is cached after first load.

let pipelinePromise = null

async function getPipeline() {
  if (pipelinePromise) return pipelinePromise
  pipelinePromise = (async () => {
    // Dynamic import — @huggingface/transformers is ESM, this file is CommonJS.
    const { pipeline } = await import('@huggingface/transformers')
    return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true })
  })()
  return pipelinePromise
}

// Returns an array of Float32Array, one per input text. All vectors are length 384 and L2-normalized.
async function embedTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return []
  const extractor = await getPipeline()
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  // output.data is a single contiguous Float32Array shaped [batch * dim].
  const dim = output.dims[output.dims.length - 1]
  const result = []
  for (let i = 0; i < texts.length; i++) {
    const start = i * dim
    // Copy out — output.data is a view into a single buffer we don't want to retain.
    result.push(new Float32Array(output.data.slice(start, start + dim)))
  }
  return result
}

// Preload the model so the first user query isn't slowed by cold-start.
function warmUp() {
  return getPipeline()
}

module.exports = { embedTexts, warmUp }
