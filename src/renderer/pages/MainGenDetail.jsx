import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import GalleryGrid from '../components/GalleryGrid.jsx'
import MetadataPanel from '../components/MetadataPanel.jsx'
import CompareOverlay from '../components/CompareOverlay.jsx'
import { useToast } from '../context/ToastContext.jsx'

const SIZES = ['S', 'M', 'L']

export default function MainGenDetail() {
  const { id } = useParams()
  const mainGenId = parseInt(id)
  const [mg, setMg] = useState(null)
  const [iterations, setIterations] = useState([])
  const [size, setSize] = useState('M')
  const [selectedId, setSelectedId] = useState(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelected, setCompareSelected] = useState(new Set())
  const [compareData, setCompareData] = useState(null)
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const [mgData, iters] = await Promise.all([
      window.forge.mainGens.get(mainGenId),
      window.forge.iterations.list(mainGenId),
    ])
    setMg(mgData)
    setIterations(iters)
  }, [mainGenId])

  useEffect(() => { load() }, [load])

  const openCompare = async () => {
    const [idA, idB] = [...compareSelected]
    const [a, b] = await Promise.all([
      window.forge.iterations.get(idA),
      window.forge.iterations.get(idB),
    ])
    setCompareData({ a, b })
  }

  const toggleCompareSelect = (itemId) => {
    setCompareSelected(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else if (next.size < 2) {
        next.add(itemId)
      }
      return next
    })
  }

  if (!mg) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#0e0e0f' }}>
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <button onClick={() => navigate('/main-gens')} className="text-sm" style={{ color: '#555' }}>← Back</button>
          <div
            className="w-8 h-8 rounded-lg flex-shrink-0"
            style={{
              background: mg.hero_image_path ? `url(forge://${mg.hero_image_path}) center/cover` : mg.hero_color,
            }}
          />
          <div className="flex-1">
            <h1 className="text-base font-semibold" style={{ color: '#f0f0f0' }}>{mg.title}</h1>
            <p className="text-xs" style={{ color: '#555' }}>{mg.iteration_count} iteration{mg.iteration_count !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => window.forge.mainGens.update({ id: mainGenId, pinned: !mg.pinned }).then(load)}
            className="text-sm"
            style={{ color: mg.pinned ? '#7c6ff7' : '#555' }}
          >
            {mg.pinned ? '📌' : '📍'}
          </button>

          {/* Size toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #2a2a2e' }}>
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  background: size === s ? '#7c6ff7' : '#1c1c1e',
                  color: size === s ? '#fff' : '#888',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setCompareMode(m => !m)
              setCompareSelected(new Set())
            }}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ background: compareMode ? '#7c6ff7' : '#2a2a2e', color: compareMode ? '#fff' : '#888' }}
          >
            Compare
          </button>

          {compareMode && compareSelected.size === 2 && (
            <button
              onClick={openCompare}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#7c6ff7', color: '#fff' }}
            >
              View Compare
            </button>
          )}
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto p-6">
          {iterations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="text-3xl">🖼</div>
              <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No iterations yet</p>
              <p className="text-xs" style={{ color: '#555' }}>Assign images from the Inbox to this Main Gen.</p>
            </div>
          ) : (
            <GalleryGrid
              items={iterations}
              size={size}
              selectedId={selectedId}
              compareMode={compareMode}
              compareSelected={compareSelected}
              onSelect={(id) => setSelectedId(prev => prev === id ? null : id)}
              onCompareToggle={toggleCompareSelect}
              renderOverlay={(item) =>
                item.starred ? (
                  <div className="absolute top-1.5 right-1.5 text-xs">⭐</div>
                ) : null
              }
            />
          )}
        </div>
      </div>

      {/* Metadata panel */}
      {selectedId && !compareMode && (
        <MetadataPanel
          iterationId={selectedId}
          mainGenId={mainGenId}
          onClose={() => setSelectedId(null)}
          onStarChange={load}
        />
      )}

      {/* Compare overlay */}
      {compareData && (
        <CompareOverlay
          iterA={compareData.a}
          iterB={compareData.b}
          onClose={() => setCompareData(null)}
        />
      )}
    </div>
  )
}
