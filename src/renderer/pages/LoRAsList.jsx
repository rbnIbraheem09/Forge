import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'

export default function LoRAsList() {
  const [loras, setLoras] = useState([])
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoras(await window.forge.loras.list())
  }, [])

  useEffect(() => { load() }, [load])

  const scan = async () => {
    setScanning(true)
    const result = await window.forge.loras.scan()
    await load()
    setScanning(false)
    showToast(`Scan complete: +${result.added} new, ${result.offlined} offline.`)
  }

  const filtered = loras.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold flex-1" style={{ color: '#f0f0f0' }}>LoRAs</h1>
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
          <div className="text-3xl">🎛</div>
          <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No LoRAs found</p>
          <p className="text-xs" style={{ color: '#555' }}>Set your LoRAs folder in Settings to auto-import.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(l => (
            <div
              key={l.id}
              onClick={() => navigate(`/loras/${l.id}`)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer"
              style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#f0f0f0' }}>{l.name}</span>
                  {l.status === 'offline' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a1a1a', color: '#888' }}>Offline</span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>default weight {l.default_weight}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ background: '#2a2a2e', color: '#7c6ff7' }}>
                {l.usage_count} uses
              </span>
              <span style={{ color: '#555' }}>→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
