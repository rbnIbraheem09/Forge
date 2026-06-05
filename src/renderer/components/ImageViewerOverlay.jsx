import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { overlayBg, scaleIn } from '../lib/motion.js'
import TagChips from './TagChips.jsx'
import { useToast } from '../context/ToastContext.jsx'

function FieldRow({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-2 text-xs">
      <span style={{ color: '#635c48' }}>{label}</span>
      <span style={{ color: '#eae5dc', textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
    </div>
  )
}

function IterationSidebar({ iterationId, mainGenId, onChange, onClose }) {
  const [iter, setIter] = useState(null)
  const [globalFields, setGlobalFields] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [notesDraft, setNotesDraft] = useState('')
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [negExpanded, setNegExpanded] = useState(false)
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimer = useRef(null)

  const load = useCallback(async () => {
    const [data, gf] = await Promise.all([
      window.forge.iterations.get(iterationId),
      window.forge.globalFields.list(),
    ])
    setIter(data)
    setNotesDraft(data.notes || '')
    setGlobalFields(gf)
    const existing = data.custom_fields || []
    const existingKeys = new Set(existing.map(f => f.field_key))
    const merged = [
      ...existing,
      ...gf.filter(k => !existingKeys.has(k)).map(k => ({ field_key: k, field_value: '' })),
    ]
    setCustomFields(merged)
  }, [iterationId])

  useEffect(() => { load() }, [load])

  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotesDraft(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.forge.iterations.update({ id: iterationId, notes: val })
    }, 500)
  }

  const toggleStar = async () => {
    const next = !iter.starred
    await window.forge.iterations.update({ id: iterationId, starred: next })
    setIter(prev => ({ ...prev, starred: next }))
    onChange?.()
  }

  const saveCustomFields = async (fields) => {
    const toSave = fields.filter(f => f.field_key && f.field_value !== '')
    await window.forge.iterations.setCustomFields(iterationId, toSave.map(f => ({ key: f.field_key, value: f.field_value })))
  }

  const updateCustomField = (idx, key, value) => {
    setCustomFields(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: value }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveCustomFields(next), 500)
      return next
    })
  }

  const removeCustomField = (idx) => {
    setCustomFields(prev => {
      const next = prev.filter((_, i) => i !== idx)
      saveCustomFields(next)
      return next
    })
  }

  const pinField = async (key) => {
    const isPinned = globalFields.includes(key)
    if (isPinned) {
      await window.forge.globalFields.unpin(key)
      setGlobalFields(prev => prev.filter(k => k !== key))
      showToast('Field unpinned.')
    } else {
      await window.forge.globalFields.pin(key)
      setGlobalFields(prev => [...prev, key])
      showToast('Field pinned globally.')
    }
  }

  const saveTags = async (tags) => {
    await window.forge.iterations.update({ id: iterationId, tags })
    setIter(prev => ({ ...prev, tags }))
    onChange?.()
  }

  const openMainGen = () => {
    if (!mainGenId && !iter?.main_gen_id) return
    onClose()
    navigate(`/main-gens/${mainGenId || iter.main_gen_id}`)
  }

  const setAsCover = async () => {
    const mgId = mainGenId || iter?.main_gen_id
    if (!mgId) return
    await window.forge.mainGens.setHero(mgId, iterationId)
    showToast('Set as Main Gen cover.')
    onChange?.()
  }

  if (!iter) return (
    <div className="flex-shrink-0 h-full flex items-center justify-center" style={{ width: 280, color: '#635c48', fontSize: 12 }}>
      Loading…
    </div>
  )

  return (
    <div
      className="flex-shrink-0 overflow-y-auto h-full"
      style={{ width: 300, background: '#1a1813', borderLeft: '1px solid #302c1e' }}
    >
      <div className="p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              {iter.title || `Iteration #${iter.iteration_number}`}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#635c48' }}>
              {new Date(iter.created_at).toLocaleDateString()}
            </p>
          </div>
          <motion.button
            onClick={toggleStar}
            className="text-base leading-none"
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            style={{ color: iter.starred ? '#f0c840' : '#635c48', transition: 'color 0.15s' }}
          >
            {iter.starred ? '★' : '☆'}
          </motion.button>
        </div>

        {/* Extracted */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#635c48', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Extracted
          </p>
          <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: '#0f0e0b', border: '1px solid #302c1e' }}>
            <FieldRow label="Seed" value={iter.seed} />
            <FieldRow label="Steps" value={iter.steps} />
            <FieldRow label="CFG" value={iter.cfg} />
            <FieldRow label="Sampler" value={iter.sampler} />
            <FieldRow label="Scheduler" value={iter.scheduler} />
            <FieldRow label="Size" value={iter.width ? `${iter.width}×${iter.height}` : null} />
            {iter.checkpoint_name && (
              <div className="flex justify-between items-start text-xs">
                <span style={{ color: '#635c48' }}>Checkpoint</span>
                <button
                  onClick={() => { onClose(); navigate(`/models/${iter.checkpoint_id}`) }}
                  className="text-right hover:underline"
                  style={{ color: '#7aa0e8', wordBreak: 'break-all' }}
                >
                  {iter.checkpoint_name}
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #302c1e' }} />

        {/* LoRAs */}
        {iter.loras && iter.loras.length > 0 && (
          <>
            <div>
              <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#635c48', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                LoRAs
              </p>
              <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: '#0f0e0b', border: '1px solid #302c1e' }}>
                {iter.loras.map(l => (
                  <div key={l.id} className="flex justify-between items-center text-xs">
                    <button
                      onClick={() => { onClose(); navigate(`/loras/${l.id}`) }}
                      className="hover:underline"
                      style={{ color: '#7daa88' }}
                    >
                      {l.name}
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#302c1e', color: '#eae5dc' }}>
                      {l.weight}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: '1px solid #302c1e' }} />
          </>
        )}

        {/* Prompt */}
        <div>
          <button
            className="text-[9px] uppercase tracking-wider mb-2 flex items-center gap-1"
            style={{ color: '#635c48', fontFamily: 'Bricolage Grotesque, sans-serif' }}
            onClick={() => setPromptExpanded(p => !p)}
          >
            Prompt {promptExpanded ? '▲' : '▼'}
          </button>
          {promptExpanded && (
            <p className="text-xs leading-relaxed" style={{ color: '#bfb8a8' }}>
              {iter.prompt || '—'}
            </p>
          )}
        </div>

        {/* Negative Prompt */}
        <div>
          <button
            className="text-[9px] uppercase tracking-wider mb-2 flex items-center gap-1"
            style={{ color: '#635c48', fontFamily: 'Bricolage Grotesque, sans-serif' }}
            onClick={() => setNegExpanded(p => !p)}
          >
            Negative {negExpanded ? '▲' : '▼'}
          </button>
          {negExpanded && (
            <p className="text-xs leading-relaxed" style={{ color: '#bfb8a8' }}>
              {iter.negative_prompt || '—'}
            </p>
          )}
        </div>

        <div style={{ borderTop: '1px solid #302c1e' }} />

        {/* Notes */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#635c48', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Notes
          </p>
          <textarea
            value={notesDraft}
            onChange={handleNotesChange}
            placeholder="Your notes…"
            rows={4}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none"
            style={{ background: '#0f0e0b', border: '1px solid #302c1e', color: '#eae5dc' }}
          />
        </div>

        <div style={{ borderTop: '1px solid #302c1e' }} />

        {/* Custom Fields */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#635c48', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Custom Fields
          </p>
          <div className="flex flex-col gap-1.5">
            {customFields.map((f, idx) => {
              const isPinned = globalFields.includes(f.field_key)
              return (
                <div key={idx} className="flex items-center gap-1">
                  <input
                    value={f.field_key}
                    onChange={(e) => updateCustomField(idx, 'field_key', e.target.value)}
                    placeholder="Key"
                    className="flex-1 rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#0f0e0b', border: '1px solid #302c1e', color: '#bfb8a8', width: 70 }}
                  />
                  <input
                    value={f.field_value}
                    onChange={(e) => updateCustomField(idx, 'field_value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#0f0e0b', border: '1px solid #302c1e', color: '#eae5dc', width: 70 }}
                  />
                  <button
                    onClick={() => pinField(f.field_key)}
                    title={isPinned ? 'Unpin globally' : 'Pin globally'}
                    className="text-xs"
                    style={{ color: isPinned ? '#e8c820' : '#635c48' }}
                  >📌</button>
                  <button onClick={() => removeCustomField(idx)} className="text-xs" style={{ color: '#635c48' }}>✕</button>
                </div>
              )
            })}
            <button
              onClick={() => setCustomFields(prev => [...prev, { field_key: '', field_value: '' }])}
              className="text-xs mt-1"
              style={{ color: '#e8c820' }}
            >
              + Add field
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #302c1e' }} />

        {/* Tags */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#635c48', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Tags
          </p>
          <TagChips tags={iter.tags || ''} onChange={saveTags} />
        </div>

        {/* Open Main Gen */}
        {(mainGenId || iter.main_gen_id) && (
          <>
            <div style={{ borderTop: '1px solid #302c1e' }} />
            <button
              onClick={setAsCover}
              className="w-full rounded-lg py-2 text-xs font-medium transition-colors"
              style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#302c1e'; e.currentTarget.style.color = '#e8c820' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#242118'; e.currentTarget.style.color = '#bfb8a8' }}
              title="Use this image as the cover shown on the Main Gens grid"
            >
              ★ Set as cover
            </button>
            <button
              onClick={openMainGen}
              className="w-full rounded-lg py-2 text-xs font-medium transition-colors"
              style={{ background: '#242118', color: '#e8c820', border: '1px solid #302c1e' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#302c1e' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#242118' }}
            >
              Open Main Gen →
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ImageViewerOverlay({ payload, onClose }) {
  const isOpen = payload !== null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          variants={overlayBg} initial="hidden" animate="visible" exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="relative flex rounded-2xl overflow-hidden"
            style={{
              background: '#0f0e0b',
              border: '1px solid #302c1e',
              width: 'min(1400px, 92vw)',
              height: 'min(900px, 92vh)',
            }}
            variants={scaleIn} initial="hidden" animate="visible"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image column */}
            <div className="flex-1 flex items-center justify-center p-4 cursor-zoom-out" onClick={onClose}>
              <img
                src={`forge://${payload.imagePath}`}
                alt=""
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: 8,
                  cursor: 'default',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Sidebar (iteration mode only) */}
            {payload.iterationId && (
              <IterationSidebar
                iterationId={payload.iterationId}
                mainGenId={payload.mainGenId}
                onChange={payload.onChange}
                onClose={onClose}
              />
            )}

            {/* Close button — top-right of overlay */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(15,14,11,0.85)',
                border: '1px solid #302c1e',
                color: '#bfb8a8',
                fontSize: 16,
                lineHeight: 1,
              }}
              title="Close (Esc)"
            >×</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
