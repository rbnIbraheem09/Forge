import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import { useImageViewer } from '../context/ImageViewerContext.jsx'
import ExamplesGrid from '../components/ExamplesGrid.jsx'

export default function ModelDetail() {
  const { id } = useParams()
  const modelId = parseInt(id)
  const { open: openViewer } = useImageViewer()
  const [model, setModel] = useState(null)
  const [usage, setUsage] = useState([])
  const [notes, setNotes] = useState('')
  const [cfg, setCfg] = useState('')
  const [steps, setSteps] = useState('')
  const [focused, setFocused] = useState(null)
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimers = useRef({})

  const load = useCallback(async () => {
    const [m, u] = await Promise.all([
      window.forge.models.get(modelId),
      window.forge.models.usage(modelId),
    ])
    setModel(m)
    setUsage(u)
    setNotes(m.notes || '')
    setCfg(m.recommended_cfg != null ? String(m.recommended_cfg) : '')
    setSteps(m.recommended_steps != null ? String(m.recommended_steps) : '')
  }, [modelId])

  useEffect(() => { load() }, [load])

  const queueSave = (key, value) => {
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      const payload = { id: modelId }
      if (key === 'notes') payload.notes = value
      if (key === 'recommended_cfg') payload.recommended_cfg = value === '' ? null : Number(value)
      if (key === 'recommended_steps') payload.recommended_steps = value === '' ? null : Number(value)
      await window.forge.models.update(payload)
      showToast('Saved.')
    }, 500)
  }

  const handleNotesChange = (e) => { setNotes(e.target.value); queueSave('notes', e.target.value) }
  const handleCfgChange = (e) => {
    const v = e.target.value
    if (v === '' || /^\d*\.?\d*$/.test(v)) { setCfg(v); queueSave('recommended_cfg', v) }
  }
  const handleStepsChange = (e) => {
    const v = e.target.value
    if (v === '' || /^\d*$/.test(v)) { setSteps(v); queueSave('recommended_steps', v) }
  }

  const pasteNumber = async (setter, key, min, max, isInt) => {
    try {
      const text = await navigator.clipboard.readText()
      const num = isInt ? parseInt(text, 10) : parseFloat(text)
      if (Number.isNaN(num)) { showToast('Clipboard has no number.'); return }
      const clamped = Math.min(max, Math.max(min, num))
      setter(String(clamped))
      queueSave(key, String(clamped))
      showToast('Pasted.')
    } catch { showToast("Couldn't read clipboard.") }
  }

  const copyValue = async (val) => {
    if (!val) { showToast('Nothing to copy.'); return }
    try { await navigator.clipboard.writeText(String(val)); showToast('Copied.') }
    catch { showToast("Couldn't copy.") }
  }

  if (!model) return <div className="flex items-center justify-center h-full" style={{ color: '#635c48' }}>Loading…</div>

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0f0e0b' }}>
      <button onClick={() => navigate('/models')} className="text-sm mb-4 block" style={{ color: '#635c48' }}>← Checkpoints</button>

      {/* Stats header — unchanged */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-xl font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            {model.name}
          </h1>
          {model.status === 'offline' && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#242118', color: '#635c48' }}>Offline</span>
          )}
        </div>
        {model.file_path && <p className="text-xs mb-3 truncate" style={{ color: '#635c48' }}>{model.file_path}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#7aa0e8', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              {model.usage_count}
            </div>
            <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#635c48' }}>Iterations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#7aa0e8', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              {model.main_gen_count}
            </div>
            <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#635c48' }}>Main Gens</div>
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="mb-6 grid gap-6 detail-split" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Examples</p>
          <ExamplesGrid
            images={model.example_images || []}
            entityKind="checkpoint"
            entityId={modelId}
            entityName={model.name}
            onChanged={load}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Recommended CFG (1–30)</p>
              <div className="flex gap-2">
                <button onClick={() => pasteNumber(setCfg, 'recommended_cfg', 1, 30, false)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
                <button onClick={() => copyValue(cfg)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
              </div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={cfg}
              onChange={handleCfgChange}
              onFocus={() => setFocused('cfg')}
              onBlur={() => setFocused(null)}
              placeholder="e.g. 7"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
              style={{
                background: '#1a1813',
                border: focused === 'cfg' ? '1px solid #635c48' : '1px solid transparent',
                color: '#7aa0e8',
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#635c48' }}>Recommended steps (1–150)</p>
              <div className="flex gap-2">
                <button onClick={() => pasteNumber(setSteps, 'recommended_steps', 1, 150, true)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>📋 Paste</button>
                <button onClick={() => copyValue(steps)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{ borderColor: '#302c1e', color: '#635c48' }}>Copy</button>
              </div>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={steps}
              onChange={handleStepsChange}
              onFocus={() => setFocused('steps')}
              onBlur={() => setFocused(null)}
              placeholder="e.g. 30"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono"
              style={{
                background: '#1a1813',
                border: focused === 'steps' ? '1px solid #635c48' : '1px solid transparent',
                color: '#7aa0e8',
              }}
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#635c48' }}>Notes</p>
            <textarea
              value={notes}
              onChange={handleNotesChange}
              onFocus={() => setFocused('notes')}
              onBlur={() => setFocused(null)}
              placeholder="Your notes on this checkpoint…"
              rows={5}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
              style={{
                background: '#1a1813',
                border: focused === 'notes' ? '1px solid #635c48' : '1px solid transparent',
                color: '#eae5dc',
              }}
            />
          </div>
        </div>
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
                onClick={() => openViewer({ imagePath: iter.image_path, iterationId: iter.id, mainGenId: iter.main_gen_id })}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '0.85', background: '#1a1813', border: '1px solid #302c1e' }}
                whileHover={{ scale: 1.04 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <img src={`forge://thumb${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }} />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[9px]" style={{ color: '#bfb8a8' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .detail-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
