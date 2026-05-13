// src/renderer/lib/prompt-tag-categories.js
//
// The AI's structured response emits one of 12 categories per tag.
// The renderer collapses them onto a smaller set of display colors.

export const COLORS = {
  quality:  { fg: '#c678dd', bg: 'rgba(198, 120, 221, 0.18)' },           // purple
  subject:  { fg: '#7aa0e8', bg: 'rgba(122, 160, 232, 0.18)' },           // blue
  style:    { fg: '#e8c820', bg: 'rgba(232, 200, 32, 0.15)' },             // yellow
  camera:   { fg: '#56b6c2', bg: 'rgba(86, 182, 194, 0.18)' },             // cyan
  scene:    { fg: '#d19a66', bg: 'rgba(209, 154, 102, 0.18)' },           // orange
  neutral:  { fg: '#bfb8a8', bg: '#242118' },                              // grey fallback
  negative: { fg: '#e06c75', bg: 'rgba(224, 108, 117, 0.18)' },           // red-coral (negative block)
  lora:     { fg: '#ff6b6b', bg: 'rgba(232, 80, 80, 0.18)', border: 'rgba(232, 80, 80, 0.4)' }, // LoRA red
}

export const CATEGORY_TO_COLOR = {
  quality:     'quality',
  subject:     'subject',
  anatomy:     'subject',
  expression:  'subject',
  clothing:    'subject',
  style:       'style',
  lighting:    'style',
  camera:      'camera',
  composition: 'camera',
  scene:       'scene',
  pose:        'scene',
  other:       'neutral',
}

// Returns the color triple for a tag item (positive or negative).
export function colorsFor(tagItem, isNegativeBlock = false) {
  if (tagItem.type === 'lora_trigger') return COLORS.lora
  if (isNegativeBlock) return COLORS.negative
  const group = CATEGORY_TO_COLOR[tagItem.category] || 'neutral'
  return COLORS[group]
}
