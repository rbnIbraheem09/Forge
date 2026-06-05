import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import TagPillInput from './TagPillInput.jsx'
import RelevancyStrip from './RelevancyStrip.jsx'

export default function ManualPromptComposer({ selectedLoras, onRemoveLora, insertTagRef, onSavedPreset }) {
  const [positive, setPositive] = useState([])
  const [negative, setNegative] = useState([])
  const showToast = useToast()
  const prevLoraIds = useRef('')

  // Keep LoRA-trigger pills in `positive` in sync with the right-panel selection.
  useEffect(() => {
    const idsKey = selectedLoras.map(l => l.id).join(',')
    if (idsKey === prevLoraIds.current) return
    prevLoraIds.current = idsKey
    setPositive(prev => {
      const nonLora = prev.filter(t => t.type !== 'lora_trigger')
      const loraPills = selectedLoras.map(l => ({
        tag: (l.trigger_words && l.trigger_words.trim()) ? l.trigger_words.trim() : l.name,
        category: null,
        type: 'lora_trigger',
        lora_id: l.id,
      }))
      return [...nonLora, ...loraPills]
    })
  }, [selectedLoras])

  const copy = useCallback(async (arr, label) => {
    const text = arr.map(t => t.tag).join(', ')
    if (!text) { showToast(`Nothing in the ${label} prompt.`); return }
    try { await navigator.clipboard.writeText(text); showToast(`Copied ${label} prompt.`) }
    catch { showToast("Couldn't copy.") }
  }, [showToast])

  const clearAll = () => {
    setPositive([])
    setNegative([])
    // Drop LoRA selection too so pills don't get re-added.
    selectedLoras.forEach(l => onRemoveLora(l.id))
    prevLoraIds.current = ''
  }

  const savePreset = useCallback(async () => {
    if (positive.length === 0 && negative.length === 0) { showToast('Add some tags first.'); return }
    const loraPills = positive.filter(t => t.type === 'lora_trigger')
    const lorasSnapshot = loraPills.map(t => {
      const row = selectedLoras.find(l => l.id === t.lora_id)
      return {
        lora_id: t.lora_id,
        filename: row ? (row.file_path ? row.file_path.split('/').pop() : row.name) : '(unknown)',
        trigger_words: t.tag,
      }
    })
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const autoName = `Manual ${ts}`
    try {
      const r = await window.forge.prompt.presets.save({
        name: autoName,
        sourceMessageId: null,
        userDescription: null,
        positiveText: positive.map(t => t.tag).join(', '),
        negativeText: negative.map(t => t.tag).join(', '),
        positiveStructured: JSON.stringify(positive),
        negativeStructured: JSON.stringify(negative),
        modelFamily: null,
        checkpointId: null,
        temperature: null,
        loras: lorasSnapshot,
      })
      if (r && r.ok) { showToast(`Saved as "${autoName}" — rename in the Saved drawer.`); onSavedPreset && onSavedPreset() }
      else showToast(`Save failed: ${(r && r.reason) || 'unknown'}`)
    } catch (err) {
      showToast(`Save error: ${err.message || err}`)
    }
  }, [positive, negative, selectedLoras, showToast, onSavedPreset])

  const btn = {
    padding: '6px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
    background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: 16, gap: 14 }}>
      <RelevancyStrip tags={positive} onAdd={(item) => setPositive(prev =>
        prev.some(t => t.tag.toLowerCase() === item.tag.toLowerCase()) ? prev : [...prev, item])} />

      <div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e8c820', fontWeight: 600, marginBottom: 6 }}>
          + Positive · {positive.length} tag{positive.length !== 1 ? 's' : ''}
        </div>
        <TagPillInput tags={positive} onChange={setPositive} inserterRef={insertTagRef} placeholder="Type a tag — e.g. 1girl, absurdres…" />
      </div>

      <div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e06c75', fontWeight: 600, marginBottom: 6 }}>
          − Negative · {negative.length} tag{negative.length !== 1 ? 's' : ''}
        </div>
        <TagPillInput tags={negative} onChange={setNegative} placeholder="Negative tags — e.g. lowres, bad anatomy…" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #302c1e' }}>
        <button style={btn} onClick={() => copy(positive, 'positive')}>⧉ Copy positive</button>
        <button style={btn} onClick={() => copy(negative, 'negative')}>⧉ Copy negative</button>
        <button style={{ ...btn, color: '#e8c820' }} onClick={savePreset}>★ Save preset</button>
        <button style={{ ...btn, marginLeft: 'auto', color: '#e06c75' }} onClick={clearAll}>Clear</button>
      </div>
    </div>
  )
}
