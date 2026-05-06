import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'

export default function ModelDetail() {
  const { id } = useParams()
  const modelId = parseInt(id)
  const [model, setModel] = useState(null)
  const [usage, setUsage] = useState([])
  const [notes, setNotes] = useState('')
  const showToast = useToast()
  const navigate = useNavigate()
  const saveTimer = useRef(null)

  const load = useCallback(async () => {
    const [m, u] = await Promise.all([
      window.forge.models.get(modelId),
      window.forge.models.usage(modelId),
    ])
    setModel(m)
    setUsage(u)
    setNotes(m.notes || '')
  }, [modelId])

  useEffect(() => { load() }, [load])

  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotes(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.forge.models.update({ id: modelId, notes: val })
      showToast('Notes saved.')
    }, 500)
  }

  if (!model) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <button onClick={() => navigate('/models')} className="text-sm mb-4 block" style={{ color: '#555' }}>← Checkpoints</button>

      <div className="rounded-xl p-5 mb-6" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-xl font-semibold" style={{ color: '#f0f0f0' }}>{model.name}</h1>
          {model.status === 'offline' && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2a1a1a', color: '#888' }}>Offline</span>
          )}
        </div>
        {model.file_path && <p className="text-xs mb-3 truncate" style={{ color: '#555' }}>{model.file_path}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#4a9a6e' }}>{model.usage_count}</div>
            <div className="text-xs mt-0.5" style={{ color: '#555' }}>Iterations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#4a9a6e' }}>{model.main_gen_count}</div>
            <div className="text-xs mt-0.5" style={{ color: '#555' }}>Main Gens</div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#555' }}>Notes</p>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          placeholder="Your notes on this checkpoint…"
          rows={5}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0' }}
        />
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>
          Used in — {usage.length} iteration{usage.length !== 1 ? 's' : ''}
        </p>
        {usage.length === 0 ? (
          <p className="text-sm" style={{ color: '#555' }}>Not used in any iterations yet.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {usage.map(iter => (
              <div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '0.85', background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <img src={`forge://${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }} />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[9px]" style={{ color: '#aaa' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
