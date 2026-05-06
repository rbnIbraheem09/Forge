// src/renderer/components/CompareOverlay.jsx
import React, { useEffect } from 'react'

function diffValue(a, b) {
  if (a === b || (a == null && b == null)) return null
  return 'diff'
}

function MetaRow({ label, aVal, bVal }) {
  const isDiff = diffValue(String(aVal ?? ''), String(bVal ?? '')) !== null
  return (
    <div className="grid gap-2 text-xs" style={{ gridTemplateColumns: '80px 1fr 1fr' }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color: '#f0f0f0' }}>{aVal ?? '—'}</span>
      <span style={{ color: isDiff ? '#ff6b6b' : '#f0f0f0' }}>
        {bVal ?? '—'}{isDiff && ' ≠'}
      </span>
    </div>
  )
}

export default function CompareOverlay({ iterA, iterB, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!iterA || !iterB) return null

  const loraA = (iterA.loras || []).map(l => `${l.name} ${l.weight}`).join(', ')
  const loraB = (iterB.loras || []).map(l => `${l.name} ${l.weight}`).join(', ')

  return (
    <div
      className="fixed inset-0 z-[9997] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
        <h2 className="text-base font-semibold" style={{ color: '#f0f0f0' }}>Compare</h2>
        <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: '#2a2a2e', color: '#888' }}>
          Close (ESC)
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Images */}
          <div>
            <p className="text-xs mb-2 font-medium" style={{ color: '#7c6ff7' }}>
              Iteration #{iterA.iteration_number} {iterA.title ? `— ${iterA.title}` : ''}
            </p>
            <img src={`forge://${iterA.image_path}`} alt="" className="w-full rounded-xl object-contain" style={{ maxHeight: '40vh', background: '#1c1c1e' }} />
          </div>
          <div>
            <p className="text-xs mb-2 font-medium" style={{ color: '#7c6ff7' }}>
              Iteration #{iterB.iteration_number} {iterB.title ? `— ${iterB.title}` : ''}
            </p>
            <img src={`forge://${iterB.image_path}`} alt="" className="w-full rounded-xl object-contain" style={{ maxHeight: '40vh', background: '#1c1c1e' }} />
          </div>
        </div>

        {/* Metadata diff */}
        <div
          className="mt-6 rounded-xl p-4 flex flex-col gap-3"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
        >
          {/* Column headers */}
          <div className="grid text-[10px] uppercase tracking-wider gap-2" style={{ gridTemplateColumns: '80px 1fr 1fr', color: '#555' }}>
            <span />
            <span>#{iterA.iteration_number}</span>
            <span>#{iterB.iteration_number}</span>
          </div>
          <MetaRow label="Seed" aVal={iterA.seed} bVal={iterB.seed} />
          <MetaRow label="Steps" aVal={iterA.steps} bVal={iterB.steps} />
          <MetaRow label="CFG" aVal={iterA.cfg} bVal={iterB.cfg} />
          <MetaRow label="Sampler" aVal={iterA.sampler} bVal={iterB.sampler} />
          <MetaRow label="Checkpoint" aVal={iterA.checkpoint_name} bVal={iterB.checkpoint_name} />
          <MetaRow label="LoRAs" aVal={loraA || '—'} bVal={loraB || '—'} />

          {/* Custom fields */}
          {(() => {
            const keysA = new Map((iterA.custom_fields || []).map(f => [f.field_key, f.field_value]))
            const keysB = new Map((iterB.custom_fields || []).map(f => [f.field_key, f.field_value]))
            const allKeys = new Set([...keysA.keys(), ...keysB.keys()])
            return [...allKeys].map(key => (
              <MetaRow key={key} label={key} aVal={keysA.get(key)} bVal={keysB.get(key)} />
            ))
          })()}
        </div>
        <p className="text-[10px] mt-3 text-center" style={{ color: '#444' }}>
          Values in red differ between iterations
        </p>
      </div>
    </div>
  )
}
