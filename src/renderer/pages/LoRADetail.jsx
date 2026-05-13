import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'

export default function LoRADetail() {
  const { id } = useParams()
  const loraId = parseInt(id)
  const [lora, setLora] = useState(null)
  const [usage, setUsage] = useState([])
  const [notes, setNotes] = useState('')
  const [triggerWords, setTriggerWords] = useState('')
  const [strength, setStrength] = useState('')
  const [focused, setFocused] = useState(null)
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimers = useRef({})

  const load = useCallback(async () => {
    const [l, u] = await Promise.all([
      window.forge.loras.get(loraId),
      window.forge.loras.usage({ id: loraId }),
    ])
    setLora(l)
    setUsage(u)
    setNotes(l.notes || '')
    setTriggerWords(l.trigger_words || '')
    setStrength(l.recommended_strength != null ? String(l.recommended_strength) : '')
  }, [loraId])

  useEffect(() => { load() }, [load])

  const queueSave = (key, value) => {
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      const payload = { id: loraId }
      if (key === 'notes') payload.notes = value
      if (key === 'trigger_words') payload.trigger_words = value
      if (key === 'recommended_strength') {
        payload.recommended_strength = value === '' ? null : Number(value)
      }
      await window.forge.loras.update(payload)
      showToast('Saved.')
    }, 500)
  }

  const handleNotesChange = (e) => { setNotes(e.target.value); queueSave('notes', e.target.value) }
  const handleTriggerChange = (e) => { setTriggerWords(e.target.value); queueSave('trigger_words', e.target.value) }
  const handleStrengthChange = (e) => {
    const v = e.target.value
    if (v === '' || /^\d*\.?\d*$/.test(v)) {
      setStrength(v)
      queueSave('recommended_strength', v)
    }
  }

  const pasteInto = async (setter, key, kind) => {
    try {
      const text = await navigator.clipboard.readText()
      if (kind === 'number') {
        const num = parseFloat(text)
        if (Number.isNaN(num)) { showToast('Clipboard has no number.'); return }
        const clamped = Math.min(2, Math.max(0, num))
        setter(String(clamped))
        queueSave(key, String(clamped))
      } else {
        setter(text)
        queueSave(key, text)
      }
      showToast('Pasted.')
    } catch {
      showToast("Couldn't read clipboard.")
    }
  }

  const copyValue = async (val) => {
    if (!val) { showToast('Nothing to copy.'); return }
    try { await navigator.clipboard.writeText(String(val)); showToast('Copied.') }
    catch { showToast("Couldn't copy.") }
  }

  if (!lora) return <div className="flex items-center justify-center h-full" style={{ color: '#635c48' }}>Loading…</div>

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0f0e0b' }}>
      <button onClick={() => navigate('/loras')} className="text-sm mb-4 block" style={{ color: '#635c48' }}>← LoRAs</button>

      {/* Stats header — unchanged */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                {lora.name}
              </h1>
              {lora.status === 'offline' && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#242118', color: '#635c48' }} title="File not found at last known path.">Offline</span>
              )}
            </div>
            {lora.file_path && <p className="text-xs mt-1 truncate" style={{ color: '#635c48', maxWidth: '400px' }}>{lora.file_path}</p>}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Iterations', value: lora.usage_count },
            { label: 'Default wt', value: lora.default_weight },
            { label: 'Avg wt used', value: lora.avg_weight ? Number(lora.avg_weight).toFixed(2) : '—' },
            { label: 'Main Gens', value: lora.main_gen_count },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#7daa88', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                {value}
              </div>
              <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#635c48' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trigger words */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Trigger words</p>
          <div className="flex gap-2">
            <button onClick={() => pasteInto(setTriggerWords, 'trigger_words', 'text')}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
            <button onClick={() => copyValue(triggerWords)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
          </div>
        </div>
        <textarea
          value={triggerWords}
          onChange={handleTriggerChange}
          onFocus={() => setFocused('trigger')}
          onBlur={() => setFocused(null)}
          placeholder="Activation tokens / sample prompts, comma-separated or freeform…"
          rows={4}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
          style={{
            background: '#1a1813',
            border: focused === 'trigger' ? '1px solid #635c48' : '1px solid transparent',
            color: '#eae5dc',
          }}
        />
      </div>

      {/* Strength */}
      <div className="mb-6 max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Strength (0–2)</p>
          <div className="flex gap-2">
            <button onClick={() => pasteInto(setStrength, 'recommended_strength', 'number')}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
            <button onClick={() => copyValue(strength)}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
          </div>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={strength}
          onChange={handleStrengthChange}
          onFocus={() => setFocused('strength')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. 0.85"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
          style={{
            background: '#1a1813',
            border: focused === 'strength' ? '1px solid #635c48' : '1px solid transparent',
            color: '#e8c820',
          }}
        />
      </div>

      {/* Notes — unchanged shape, just uses new queueSave */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Notes</p>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          onFocus={() => setFocused('notes')}
          onBlur={() => setFocused(null)}
          placeholder="Your notes on this LoRA — strengths, weaknesses, best pairings…"
          rows={5}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
          style={{
            background: '#1a1813',
            border: focused === 'notes' ? '1px solid #635c48' : '1px solid transparent',
            color: '#eae5dc',
          }}
        />
      </div>

      {/* Usage gallery — unchanged */}
      <div>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#635c48' }}>
          Used in — {usage.length} iteration{usage.length !== 1 ? 's' : ''}
        </p>
        {usage.length === 0 ? (
          <p className="text-sm" style={{ color: '#635c48' }}>Not used in any iterations yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {usage.map(iter => (
              <motion.div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '0.85', background: '#1a1813', border: '1px solid #302c1e' }}
                whileHover={{ scale: 1.04 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <img src={`forge://thumb${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }} />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[10px] font-medium" style={{ color: '#bfb8a8' }}>wt {iter.weight}</p>
                  <p className="text-[9px]" style={{ color: '#bfb8a8' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
