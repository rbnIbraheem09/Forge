import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
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

  if (!mg) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#635c48' }}>
      Loading…
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#0f0e0b' }}>
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid #302c1e' }}>
          <button
            onClick={() => navigate('/main-gens')}
            className="text-sm transition-colors"
            style={{ color: '#635c48' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#eae5dc' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#635c48' }}
          >
            ← Back
          </button>

          {/* Hero thumbnail */}
          <div
            className="w-8 h-8 flex-shrink-0"
            style={{
              background: mg.hero_image_path ? `url(forge://${mg.hero_image_path}) center/cover` : mg.hero_color,
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          />

          <div className="flex-1">
            <h1
              className="text-base font-semibold"
              style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
            >
              {mg.title}
            </h1>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#242118', color: '#635c48', display: 'inline-block' }}
            >
              {mg.iteration_count} iteration{mg.iteration_count !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Pin toggle */}
          <button
            onClick={() => window.forge.mainGens.update({ id: mainGenId, pinned: !mg.pinned }).then(load)}
            className="text-sm transition-colors"
            style={{ color: mg.pinned ? '#e8c820' : '#635c48' }}
          >
            {mg.pinned ? '📌' : '📍'}
          </button>

          {/* Size toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #302c1e' }}>
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  background: size === s ? '#e8c820' : '#242118',
                  color: size === s ? '#0f0e0b' : '#635c48',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Compare toggle */}
          <button
            onClick={() => {
              setCompareMode(m => !m)
              setCompareSelected(new Set())
            }}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ background: '#242118', color: '#bfb8a8' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#302c1e' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#242118' }}
          >
            Compare
          </button>

          {compareMode && compareSelected.size === 2 && (
            <button
              onClick={openCompare}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#e8c820', color: '#0f0e0b' }}
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
              <p
                className="text-sm font-medium"
                style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
              >
                No iterations yet
              </p>
              <p className="text-xs" style={{ color: '#635c48' }}>
                Assign images from the Inbox to this Main Gen.
              </p>
              {/* Add iteration button */}
              <button
                className="mt-2 px-4 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: '#242118',
                  color: '#bfb8a8',
                  border: '1px solid #302c1e',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#302c1e' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#242118' }}
              >
                + Add iteration
              </button>
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
                  <div className="absolute top-1.5 right-1.5 text-xs" style={{ color: '#f0c840' }}>⭐</div>
                ) : null
              }
            />
          )}
        </div>
      </div>

      {/* Metadata panel with AnimatePresence for animate in/out */}
      <AnimatePresence>
        {selectedId && !compareMode && (
          <MetadataPanel
            key={selectedId}
            iterationId={selectedId}
            mainGenId={mainGenId}
            onClose={() => setSelectedId(null)}
            onStarChange={load}
          />
        )}
      </AnimatePresence>

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
