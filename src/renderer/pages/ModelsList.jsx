import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import { familyLabel } from '../lib/model-families.js'

export default function ModelsList() {
  const [models, setModels] = useState([])
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
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
        <motion.div
          className="flex flex-col gap-2"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {filtered.map(m => (
            <motion.div
              key={m.id}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
              }}
              onClick={() => navigate(`/models/${m.id}`)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer"
              style={{ background: '#1a1813', border: '1px solid #302c1e' }}
              whileHover={{ backgroundColor: '#242118' }}
              transition={{ duration: 0.12 }}
            >
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
              <span style={{ color: '#635c48' }}>→</span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
