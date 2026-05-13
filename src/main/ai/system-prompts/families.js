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
