// src/renderer/components/CompareOverlay.jsx
import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { overlayBg, scaleIn } from '../lib/motion.js'

function diffValue(a, b) {
  if (a === b || (a == null && b == null)) return null
  return 'diff'
}

function MetaRow({ label, aVal, bVal, rowIndex }) {
  const isDiff = diffValue(String(aVal ?? ''), String(bVal ?? '')) !== null
  // Alternating row backgrounds
  const rowBg = rowIndex % 2 === 0 ? '#1a1813' : '#242118'
  return (
    <div
      className="grid gap-2 text-xs px-2 py-1.5 rounded"
      style={{ gridTemplateColumns: '80px 1fr 1fr', background: rowBg }}
    >
      <span style={{ color: '#635c48' }}>{label}</span>
      <span style={{ color: '#bfb8a8' }}>{aVal ?? '—'}</span>
      <span style={{ color: isDiff ? '#e8c820' : '#bfb8a8' }}>
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

  // Collect custom field rows for index-based alternating
  const keysA = new Map((iterA.custom_fields || []).map(f => [f.field_key, f.field_value]))
  const keysB = new Map((iterB.custom_fields || []).map(f => [f.field_key, f.field_value]))
  const allCustomKeys = [...new Set([...keysA.keys(), ...keysB.keys()])]

  const fixedRows = [
    { label: 'Seed',       aVal: iterA.seed,            bVal: iterB.seed },
    { label: 'Steps',      aVal: iterA.steps,           bVal: iterB.steps },
    { label: 'CFG',        aVal: iterA.cfg,             bVal: iterB.cfg },
    { label: 'Sampler',    aVal: iterA.sampler,         bVal: iterB.sampler },
    { label: 'Checkpoint', aVal: iterA.checkpoint_name, bVal: iterB.checkpoint_name },
    { label: 'LoRAs',      aVal: loraA || '—',          bVal: loraB || '—' },
  ]
  const customRows = allCustomKeys.map(key => ({
    label: key,
    aVal: keysA.get(key),
    bVal: keysB.get(key),
  }))
  const allRows = [...fixedRows, ...customRows]

  return (
    <motion.div
      variants={overlayBg}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[9997] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid #302c1e', background: '#0f0e0b' }}
      >
        <h2
          className="text-base font-semibold"
          style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
        >
          Compare
        </h2>
        <motion.button
          onClick={onClose}
          className="text-sm px-3 py-1.5 rounded-lg"
          style={{ background: '#1a1813', color: '#bfb8a8', border: '1px solid #302c1e' }}
          whileHover={{ scale: 1.1, color: '#e8c820' }}
          whileTap={{ scale: 0.95 }}
        >
          Close (ESC)
        </motion.button>
      </div>

      {/* Body — inner panel scales in */}
      <motion.div
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto p-6"
      >
        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Image A */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: '#e8c820', color: '#0f0e0b' }}
              >
                #{iterA.iteration_number}
              </span>
              <p
                className="text-xs font-medium truncate"
                style={{ color: '#bfb8a8', fontFamily: 'Bricolage Grotesque, sans-serif' }}
              >
                {iterA.title || ''}
              </p>
            </div>
            <img
              src={`forge://${iterA.image_path}`}
              alt=""
              className="w-full rounded-xl object-contain"
              style={{ maxHeight: '40vh', background: '#1a1813' }}
            />
          </div>

          {/* Image B */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: '#e8c820', color: '#0f0e0b' }}
              >
                #{iterB.iteration_number}
              </span>
              <p
                className="text-xs font-medium truncate"
                style={{ color: '#bfb8a8', fontFamily: 'Bricolage Grotesque, sans-serif' }}
              >
                {iterB.title || ''}
              </p>
            </div>
            <img
              src={`forge://${iterB.image_path}`}
              alt=""
              className="w-full rounded-xl object-contain"
              style={{ maxHeight: '40vh', background: '#1a1813' }}
            />
          </div>
        </div>

        {/* Metadata diff table */}
        <div
          className="mt-6 rounded-xl p-3 flex flex-col gap-0.5 overflow-hidden"
          style={{ background: '#0f0e0b', border: '1px solid #302c1e' }}
        >
          {/* Column headers */}
          <div
            className="grid text-[10px] uppercase tracking-wider gap-2 px-2 pb-2 mb-1"
            style={{
              gridTemplateColumns: '80px 1fr 1fr',
              color: '#635c48',
              borderBottom: '1px solid #302c1e',
              fontFamily: 'Bricolage Grotesque, sans-serif',
            }}
          >
            <span />
            <span>#{iterA.iteration_number}</span>
            <span>#{iterB.iteration_number}</span>
          </div>

          {allRows.map((row, i) => (
            <MetaRow key={row.label} label={row.label} aVal={row.aVal} bVal={row.bVal} rowIndex={i} />
          ))}
        </div>

        <p className="text-[10px] mt-3 text-center" style={{ color: '#635c48' }}>
          Values in <span style={{ color: '#e8c820' }}>yellow</span> differ between iterations
        </p>
      </motion.div>
    </motion.div>
  )
}
