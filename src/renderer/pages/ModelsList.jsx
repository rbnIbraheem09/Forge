import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import { familyLabel } from '../lib/model-families.js'

export default function ModelsList() {
  const [models, setModels] = useState([])
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [mergeMode, setMergeMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [mergeDialog, setMergeDialog] = useState(null)
  const [keepId, setKeepId] = useState(null)
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setModels(await window.forge.models.list())
  }, [])

  useEffect(() => { load() }, [load])

  const scan = async () => {
    setScanning(true)
    const result = await window.forge.models.scan()
    await load()
    setScanning(false)
    showToast(`Scan complete: +${result.added} new, ${result.offlined} offline.`)
  }

  const toggleMergeMode = () => {
    setMergeMode(m => !m)
    setSelected(new Set())
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const openMergeDialog = () => {
    const selectedModels = models.filter(m => selected.has(m.id))
    const onlineFirst = selectedModels.find(m => m.status !== 'offline') || selectedModels[0]
    setKeepId(onlineFirst.id)
    setMergeDialog({ models: selectedModels })
  }

  const confirmMerge = async () => {
    const deleteIds = mergeDialog.models.map(m => m.id).filter(id => id !== keepId)
    await window.forge.models.merge({ keepId, deleteIds })
    showToast('Checkpoints merged.')
    setMergeDialog(null)
    setMergeMode(false)
    setSelected(new Set())
    await load()
  }

  const filtered = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0f0e0b' }}>
      <div className="flex items-center gap-3 mb-6">
        <h1
          className="text-xl font-semibold flex-1"
          style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
        >
          Checkpoints
        </h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: '#1a1813', border: '1px solid #302c1e', color: '#eae5dc', width: '160px' }}
        />
        <button
          onClick={toggleMergeMode}
          className="px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{
            background: mergeMode ? '#302c1e' : '#242118',
            color: mergeMode ? '#e8c820' : '#bfb8a8',
            border: mergeMode ? '1px solid #e8c82040' : '1px solid transparent',
          }}
        >
          {mergeMode ? 'Cancel' : 'Merge'}
        </button>
        <button
          onClick={scan}
          disabled={scanning}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: '#242118', color: '#bfb8a8' }}
        >
          {scanning ? 'Scanning…' : '↻ Rescan'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">🧱</div>
          <p className="text-sm font-medium" style={{ color: '#eae5dc' }}>No Checkpoints found</p>
          <p className="text-xs" style={{ color: '#635c48' }}>Set your Checkpoints folder in Settings to auto-import.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(m => {
            const isSelected = selected.has(m.id)
            return (
              <motion.div
                key={m.id}
                onClick={() => mergeMode ? toggleSelect(m.id) : navigate(`/models/${m.id}`)}
                className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer"
                style={{
                  background: isSelected ? '#101828' : '#1a1813',
                  border: `1px solid ${isSelected ? '#7aa0e840' : '#302c1e'}`,
                }}
                whileHover={{ backgroundColor: isSelected ? '#101828' : '#242118' }}
                transition={{ duration: 0.12 }}
              >
                {mergeMode && (
                  <div
                    className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                    style={{
                      background: isSelected ? '#7aa0e8' : 'transparent',
                      border: isSelected ? 'none' : '1.5px solid #635c48',
                    }}
                  >
                    {isSelected && <span style={{ color: '#0f0e0b', fontSize: '9px', fontWeight: 700 }}>✓</span>}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: '#eae5dc' }}>{m.name}</span>
                    {m.status === 'offline' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#242118', color: '#635c48' }}>Offline</span>
                    )}
                    {m.family ? (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(125, 170, 136, 0.14)', color: '#7daa88' }}
                        title="Model family"
                      >
                        {familyLabel(m.family)}
                      </span>
                    ) : (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'rgba(232, 200, 32, 0.14)', color: '#e8c820' }}
                        title="Needs classification — set a model family on the detail page"
                      >
                        ?
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded" style={{ background: '#101828', color: '#7aa0e8' }}>
                  {m.usage_count} uses
                </span>
                {!mergeMode && <span style={{ color: '#635c48' }}>→</span>}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Merge action bar */}
      <AnimatePresence>
        {mergeMode && selected.size >= 2 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-0 left-0 right-0 px-6 py-4 flex items-center gap-3"
            style={{ background: '#1a1813', borderTop: '1px solid #302c1e', zIndex: 50 }}
          >
            <p className="text-sm flex-1" style={{ color: '#bfb8a8' }}>
              {selected.size} Checkpoints selected
            </p>
            <button
              onClick={openMergeDialog}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#e8c820', color: '#0f0e0b' }}
            >
              Merge {selected.size} Checkpoints →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Merge dialog */}
      <AnimatePresence>
        {mergeDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-[100]"
            style={{ background: 'rgba(0,0,0,0.72)' }}
            onClick={() => setMergeDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl p-6"
              style={{ background: '#1a1813', border: '1px solid #302c1e', fontFamily: 'Figtree, sans-serif' }}
            >
              <h2 className="text-base font-semibold mb-1" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                Merge Checkpoints
              </h2>
              <p className="text-xs mb-5" style={{ color: '#635c48' }}>
                All usage history will be moved to the kept name. The others will be deleted.
              </p>

              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#635c48' }}>
                Which name to keep?
              </p>

              <div className="flex flex-col gap-2 mb-6">
                {mergeDialog.models.map(m => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                    style={{
                      background: keepId === m.id ? '#101828' : '#242118',
                      border: `1px solid ${keepId === m.id ? '#7aa0e840' : 'transparent'}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="keepModel"
                      checked={keepId === m.id}
                      onChange={() => setKeepId(m.id)}
                      style={{ accentColor: '#7aa0e8' }}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium" style={{ color: '#eae5dc' }}>{m.name}</span>
                      {m.status === 'offline' && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#302c1e', color: '#635c48' }}>Offline</span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: '#635c48' }}>{m.usage_count} uses</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setMergeDialog(null)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ background: '#242118', color: '#bfb8a8' }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMerge}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: '#e8c820', color: '#0f0e0b' }}
                >
                  Merge & Keep "{mergeDialog.models.find(m => m.id === keepId)?.name}"
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
