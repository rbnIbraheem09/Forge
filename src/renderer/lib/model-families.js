// src/renderer/lib/model-families.js
//
// Source of truth for checkpoint model families used by the Prompt Builder
// to tailor AI-generated prompts. Stored values are snake_case strings;
// keep these in sync with src/main/ipc/models.js MODEL_FAMILIES.

export const MODEL_FAMILIES = [
  { value: 'pony_xl',        label: 'Pony Diffusion XL' },
  { value: 'illustrious',    label: 'Illustrious / NoobAI' },
  { value: 'animagine_xl',   label: 'Animagine XL' },
  { value: 'sdxl_realistic', label: 'SDXL — Realistic' },
  { value: 'sdxl_anime',     label: 'SDXL — Anime / Generic' },
  { value: 'sd15_anime',     label: 'SD 1.5 — Anime' },
  { value: 'sd15_realistic', label: 'SD 1.5 — Realistic' },
  { value: 'other',          label: 'Other / Generic' },
]

export const MODEL_FAMILY_VALUES = MODEL_FAMILIES.map(f => f.value)

export function familyLabel(value) {
  if (!value) return 'Unclassified'
  const found = MODEL_FAMILIES.find(f => f.value === value)
  return found ? found.label : value
}
