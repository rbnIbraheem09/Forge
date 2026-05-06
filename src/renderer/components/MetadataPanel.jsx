// src/renderer/components/MetadataPanel.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import TagChips from './TagChips.jsx'
import { useToast } from '../context/ToastContext.jsx'

function FieldRow({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-2 text-xs">
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color: '#f0f0f0', textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
    </div>
  )
}

export default function MetadataPanel({ iterationId, mainGenId, onClose, onStarChange }) {
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

  const saveNotes = useCallback(async (val) => {
    await window.forge.iterations.update({ id: iterationId, notes: val })
  }, [iterationId])

  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotesDraft(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNotes(val), 500)
  }

  const toggleStar = async () => {
    const next = !iter.starred
    await window.forge.iterations.update({ id: iterationId, starred: next })
    setIter(prev => ({ ...prev, starred: next }))
    onStarChange?.()
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
  }

  if (!iter) return (
    <div className="w-64 h-full flex items-center justify-center" style={{ color: '#555', fontSize: 12 }}>
      Loading…
    </div>
  )

  return (
    <div
      className="flex-shrink-0 overflow-y-auto h-full"
      style={{ width: '240px', background: '#141415', borderLeft: '1px solid #2a2a2e' }}
    >
      <div className="p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>
              {iter.title || `Iteration #${iter.iteration_number}`}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#555' }}>
              {new Date(iter.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleStar} className="text-base leading-none">
              {iter.starred ? '⭐' : '☆'}
            </button>
            <button onClick={onClose} className="text-sm" style={{ color: '#555' }}>✕</button>
          </div>
        </div>

        {/* Extracted */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Extracted</p>
          <div
            className="rounded-lg p-3 flex flex-col gap-2"
            style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
          >
            <FieldRow label="Seed" value={iter.seed} />
            <FieldRow label="Steps" value={iter.steps} />
            <FieldRow label="CFG" value={iter.cfg} />
            <FieldRow label="Sampler" value={iter.sampler} />
            <FieldRow label="Scheduler" value={iter.scheduler} />
            <FieldRow label="Size" value={iter.width ? `${iter.width}×${iter.height}` : null} />
            {iter.checkpoint_name && (
              <div className="flex justify-between items-start text-xs">
                <span style={{ color: '#555' }}>Checkpoint</span>
                <button
                  onClick={() => navigate(`/models/${iter.checkpoint_id}`)}
                  className="text-right"
                  style={{ color: '#7c6ff7', wordBreak: 'break-all' }}
                >
                  {iter.checkpoint_name}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* LoRAs */}
        {iter.loras && iter.loras.length > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>LoRAs</p>
            <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
              {iter.loras.map(l => (
                <div key={l.id} className="flex justify-between items-center text-xs">
                  <button
                    onClick={() => navigate(`/loras/${l.id}`)}
                    style={{ color: '#7c6ff7' }}
                  >
                    {l.name}
                  </button>
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#2a2a2e', color: '#f0f0f0' }}>
                    {l.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prompt */}
        <div>
          <button
            className="text-[9px] uppercase tracking-wider mb-2 flex items-center gap-1"
            style={{ color: '#555' }}
            onClick={() => setPromptExpanded(p => !p)}
          >
            Prompt {promptExpanded ? '▲' : '▼'}
          </button>
          {promptExpanded && (
            <p className="text-xs leading-relaxed" style={{ color: '#aaa' }}>
              {iter.prompt || '—'}
            </p>
          )}
        </div>

        {/* Negative Prompt */}
        <div>
          <button
            className="text-[9px] uppercase tracking-wider mb-2 flex items-center gap-1"
            style={{ color: '#555' }}
            onClick={() => setNegExpanded(p => !p)}
          >
            Negative {negExpanded ? '▲' : '▼'}
          </button>
          {negExpanded && (
            <p className="text-xs leading-relaxed" style={{ color: '#aaa' }}>
              {iter.negative_prompt || '—'}
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Notes</p>
          <textarea
            value={notesDraft}
            onChange={handleNotesChange}
            placeholder="Your notes…"
            rows={4}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none"
            style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0' }}
          />
        </div>

        {/* Custom Fields */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Custom Fields</p>
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
                    style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#888', width: '70px' }}
                  />
                  <input
                    value={f.field_value}
                    onChange={(e) => updateCustomField(idx, 'field_value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0', width: '70px' }}
                  />
                  <button
                    onClick={() => pinField(f.field_key)}
                    title={isPinned ? 'Unpin globally' : 'Pin globally'}
                    className="text-xs"
                    style={{ color: isPinned ? '#7c6ff7' : '#444' }}
                  >📌</button>
                  <button onClick={() => removeCustomField(idx)} className="text-xs" style={{ color: '#444' }}>✕</button>
                </div>
              )
            })}
            <button
              onClick={() => setCustomFields(prev => [...prev, { field_key: '', field_value: '' }])}
              className="text-xs mt-1"
              style={{ color: '#7c6ff7' }}
            >
              + Add field
            </button>
          </div>
        </div>

        {/* Tags */}
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#555' }}>Tags</p>
          <TagChips tags={iter.tags || ''} onChange={saveTags} />
        </div>
      </div>
    </div>
  )
}
