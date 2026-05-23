// src/main/ai/system-prompts/families.js
//
// Per-model-family system prompt suffixes. Each suffix specifies the quality
// bomb (the closing 8-12 quality tags), the negative preset, and where to
// place the bomb. Family enum mirrors src/renderer/lib/model-families.js.

const FAMILY_SUFFIXES = {
  pony_xl: `MODEL FAMILY: Pony Diffusion XL.
- START the positive prompt with this Pony quality bomb: "score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up".
- Pony's score_* tags ARE the quality system — do NOT also use "masterpiece" or "best quality".
- Include a rating tag near the start: "rating_safe", "rating_questionable", or "rating_explicit" based on user intent. Default to "rating_safe" when unclear.
- Start the negative prompt with: "score_4, score_5, score_6, worst quality, low quality, blurry, bad anatomy, bad hands, signature, watermark, jpeg artifacts, lowres, deformed".`,

  illustrious: `MODEL FAMILY: Illustrious / NoobAI XL.
- END the positive prompt with this quality bomb (8-12 tags): "masterpiece, best quality, amazing quality, very aesthetic, absurdres, newest, ultra detailed, 8k, HDR, high quality digital art, official art, incredibly absurdres, very awa".
- "newest" is the NoobAI date tag and is REQUIRED for this family.
- Start the negative prompt with: "worst quality, old, early, low quality, lowres, signature, watermark, jpeg artifacts, bad anatomy, bad hands, blurry, deformed, ugly, sketch".`,

  animagine_xl: `MODEL FAMILY: Animagine XL (3.x convention).
- START the positive prompt with this quality bomb: "masterpiece, best quality, very aesthetic, absurdres, ultra detailed, 8k, official art, high quality digital art".
- Start the negative prompt with: "worst quality, low quality, lowres, jpeg artifacts, signature, watermark, bad anatomy, bad hands, blurry, deformed".`,

  sdxl_realistic: `MODEL FAMILY: SDXL — Realistic (Juggernaut, RealVisXL, etc.).
- START the positive prompt with: "photorealistic, 8k, hyperdetailed, sharp focus, professional photography, raw photo, ultra realistic, detailed skin, detailed eyes, intricate details, HDR, depth of field, cinematic lighting".
- Start the negative prompt with: "cartoon, anime, illustration, painting, blurry, low quality, bad anatomy, bad hands, deformed, plastic skin, oversaturated, jpeg artifacts, watermark".`,

  sdxl_anime: `MODEL FAMILY: SDXL — Anime / Generic.
- END the positive prompt with: "masterpiece, best quality, amazing quality, highres, absurdres, ultra detailed, 8k, HDR, official art, detailed background, detailed eyes".
- Start the negative prompt with: "worst quality, low quality, lowres, jpeg artifacts, bad anatomy, bad hands, blurry, deformed, signature, watermark".`,

  sd15_anime: `MODEL FAMILY: SD 1.5 — Anime (Anything V3/V5, Pastel Mix, etc.).
- START the positive prompt with: "masterpiece, best quality, highres, ultra detailed, official art, detailed eyes, detailed background".
- Start the negative prompt with: "lowres, bad anatomy, bad hands, worst quality, low quality, jpeg artifacts, signature, watermark, blurry, deformed".`,

  sd15_realistic: `MODEL FAMILY: SD 1.5 — Realistic (MajicMix Realistic, Realistic Vision, etc.).
- START the positive prompt with: "photorealistic, RAW photo, 8k, hyperdetailed, sharp focus, detailed skin, detailed eyes, professional photography, HDR, cinematic lighting".
- Start the negative prompt with: "cartoon, anime, illustration, painting, blurry, bad anatomy, signature, watermark, deformed, plastic skin".`,

  other: `MODEL FAMILY: Other / Generic.
- END the positive prompt with: "masterpiece, best quality, highres, ultra detailed, 8k, HDR, intricate details, sharp focus".
- Start the negative prompt with: "low quality, lowres, blurry, bad anatomy, signature, watermark, deformed, jpeg artifacts".`,
}

module.exports = { FAMILY_SUFFIXES }
