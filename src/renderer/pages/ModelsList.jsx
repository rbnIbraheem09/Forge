import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'

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
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold flex-1" style={{ color: '#f0f0f0' }}>Checkpoints</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0', width: '160px' }}
        />
        <button
          onClick={scan}
          disabled={scanning}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: '#2a2a2e', color: '#888' }}
        >
          {scanning ? 'Scanning…' : '↻ Rescan'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">🧱</div>
          <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No Checkpoints found</p>
          <p className="text-xs" style={{ color: '#555' }}>Set your Checkpoints folder in Settings to auto-import.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(m => (
            <div
              key={m.id}
              onClick={() => navigate(`/models/${m.id}`)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer"
              style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#f0f0f0' }}>{m.name}</span>
                  {m.status === 'offline' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a1a1a', color: '#888' }}>Offline</span>
                  )}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ background: '#2a2a2e', color: '#4a9a6e' }}>
                {m.usage_count} uses
              </span>
              <span style={{ color: '#555' }}>→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
