import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useToast } from '../context/ToastContext.jsx'
import { useInbox } from '../context/InboxContext.jsx'
import { useImageViewer } from '../context/ImageViewerContext.jsx'
import { fadeUp } from '../lib/motion.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function Inbox() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [mainGens, setMainGens] = useState([])
  const [loading, setLoading] = useState(true)
  const [newGenTitle, setNewGenTitle] = useState('')
  const [showNewGenInput, setShowNewGenInput] = useState(false)
  const [cols, setCols] = useState(5)
  const [sortDir, setSortDir] = useState('desc')
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const scrollRef = useRef(null)
  const showToast = useToast()
  const { setCount } = useInbox()
  const { open: openViewer } = useImageViewer()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const [inboxItems, gens] = await Promise.all([
      window.forge.inbox.list(),
      window.forge.mainGens.list(),
    ])
    setItems(inboxItems)
    setMainGens(gens)
    setCount(inboxItems.length)
    setLoading(false)
  }, [setCount])

  useEffect(() => { load() }, [load])

  // Measure container width → derive column count
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      // subtract 48px (p-6 = 24px × 2); 172px slot = 160px min + 12px gap
      const w = entry.contentRect.width - 48
      setCols(Math.max(1, Math.floor(w / 172)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Sort + chunk items into rows
  const sorted = sortDir === 'desc' ? [...items] : [...items].reverse()
  const rows = []
  for (let i = 0; i < sorted.length; i += cols) rows.push(sorted.slice(i, i + cols))

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 180,
    overscan: 2,
  })

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleTileClick = (item) => {
    if (selectMode) toggleSelect(item.id)
    else openViewer({ imagePath: item.image_path })
  }

  const selectAll = () => {
    setSelectMode(true)
    setSelected(new Set(items.map(i => i.id)))
  }

  const toggleSelectMode = () => {
    setSelectMode(m => {
      if (m) setSelected(new Set())  // exiting select mode clears selection
      return !m
    })
  }

  const assign = async (args) => {
    const itemIds = [...selected]
    const result = await window.forge.inbox.assign({ itemIds, ...args })
    showToast(`Assigned ${itemIds.length} image${itemIds.length > 1 ? 's' : ''}.`)
    setSelected(new Set())
    await load()
    navigate(`/main-gens/${result.mainGenId}`)
  }

  const requestDismiss = () => {
    if (selected.size === 0) return
    setConfirmDismiss(true)
  }

  const confirmDismissAction = async () => {
    setConfirmDismiss(false)
    const count = selected.size
    await window.forge.inbox.dismiss({ ids: [...selected] })
    showToast(`Removed ${count} image${count !== 1 ? 's' : ''} from inbox.`)
    setSelected(new Set())
    await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#bfb8a8' }}>
      Loading…
    </div>
  )

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#635c48' }}>
        <div style={{ fontSize: '2.5rem' }}>📥</div>
        <p style={{ fontFamily: 'Bricolage Grotesque, sans-serif', color: '#eae5dc', fontSize: '1rem', fontWeight: 600 }}>
          Inbox is clear
        </p>
        <p style={{ fontSize: '13px', color: '#635c48', textAlign: 'center', maxWidth: '280px' }}>
          New images from your ComfyUI output folder will appear here automatically.
        </p>
      </div>
    )
  }

  const selectedArr = [...selected]

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto p-6"
      style={{ background: '#0f0e0b', fontFamily: 'Figtree, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', color: '#eae5dc', fontSize: '1.25rem', fontWeight: 600 }}>
            Inbox
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#635c48' }}>
            {items.length} new image{items.length !== 1 ? 's' : ''} detected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ background: '#242118', color: '#bfb8a8' }}
            onMouseEnter={e => e.currentTarget.style.background = '#302c1e'}
            onMouseLeave={e => e.currentTarget.style.background = '#242118'}
          >
            {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
          <button
            onClick={toggleSelectMode}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: selectMode ? '#e8c820' : '#242118',
              color: selectMode ? '#0f0e0b' : '#bfb8a8',
            }}
            title={selectMode ? 'Click images to deselect; toggle off to view images' : 'Switch to select mode for assigning'}
          >
            {selectMode ? '☑ Selecting' : '☐ Select'}
          </button>
          <button
            onClick={selectAll}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ background: '#242118', color: '#bfb8a8' }}
            onMouseEnter={e => e.currentTarget.style.background = '#302c1e'}
            onMouseLeave={e => e.currentTarget.style.background = '#242118'}
          >
            Select All
          </button>
        </div>
      </div>

      {/* Virtualized grid */}
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', marginBottom: '24px' }}>
        {virtualizer.getVirtualItems().map(vRow => (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: '12px',
              paddingBottom: '12px',
            }}
          >
            {rows[vRow.index].map(item => {
              const meta = item.extracted_metadata ? JSON.parse(item.extracted_metadata) : {}
              const isSelected = selected.has(item.id)
              return (
                <motion.div
                  key={item.id}
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => handleTileClick(item)}
                  className="relative cursor-pointer rounded-xl overflow-hidden"
                  style={{
                    border: `2px solid ${isSelected ? '#e8c820' : '#302c1e'}`,
                    aspectRatio: '1',
                  }}
                >
                  <img
                    src={`forge://thumb${item.image_path}`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  {/* Gradient overlay */}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }}
                  />
                  {/* Selected tint */}
                  {isSelected && (
                    <div className="absolute inset-0" style={{ background: 'rgba(232, 200, 32, 0.08)' }} />
                  )}
                  {/* Checkbox — only shown in select mode */}
                  {selectMode && (
                    <div
                      className="absolute top-2 left-2 w-5 h-5 rounded flex items-center justify-center"
                      style={{
                        background: isSelected ? '#e8c820' : 'rgba(0,0,0,0.5)',
                        border: isSelected ? 'none' : '1.5px solid #635c48',
                      }}
                    >
                      {isSelected && <span style={{ color: '#0f0e0b', fontSize: '11px', fontWeight: 700 }}>✓</span>}
                    </div>
                  )}
                  {/* Metadata */}
                  <div className="absolute bottom-0 left-0 right-0 p-2" style={{ background: 'rgba(15, 14, 11, 0.72)' }}>
                    {meta.seed && <p className="text-[10px]" style={{ color: '#bfb8a8' }}>seed {meta.seed}</p>}
                    {meta.steps && <p className="text-[10px]" style={{ color: '#bfb8a8' }}>{meta.steps} steps</p>}
                  </div>
                </motion.div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Assign panel */}
      <AnimatePresence>
        {selectedArr.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-0 left-0 right-0 p-4"
            style={{ background: '#1a1813', borderTop: '1px solid #302c1e', zIndex: 50 }}
          >
            <p className="text-sm font-medium mb-3" style={{ color: '#eae5dc', fontFamily: 'Figtree, sans-serif' }}>
              Assign {selectedArr.length} image{selectedArr.length !== 1 ? 's' : ''} to:
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              {showNewGenInput ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => { e.preventDefault(); if (newGenTitle.trim()) assign({ newTitle: newGenTitle }) }}
                >
                  <input
                    autoFocus
                    value={newGenTitle}
                    onChange={(e) => setNewGenTitle(e.target.value)}
                    placeholder="New Main Gen title…"
                    className="rounded-lg px-3 py-1.5 text-sm outline-none"
                    style={{ background: '#0f0e0b', border: '1px solid #e8c820', color: '#eae5dc', width: '200px', fontFamily: 'Figtree, sans-serif' }}
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: '#e8c820', color: '#0f0e0b' }}>
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewGenInput(false)}
                    className="px-3 py-1.5 rounded-lg text-sm"
                    style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#302c1e' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#242118' }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowNewGenInput(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                  style={{ background: '#e8c820', color: '#0f0e0b' }}
                >
                  + New Main Gen
                </button>
              )}
              {mainGens.map(mg => (
                <button
                  key={mg.id}
                  onClick={() => assign({ mainGenId: mg.id })}
                  className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e', fontFamily: 'Figtree, sans-serif' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#302c1e'; e.currentTarget.style.color = '#e8c820' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#242118'; e.currentTarget.style.color = '#bfb8a8' }}
                >
                  {mg.title} <span style={{ color: '#635c48' }}>{mg.iteration_count} iters</span>
                </button>
              ))}
              <button
                onClick={requestDismiss}
                className="px-3 py-1.5 rounded-lg text-sm ml-auto"
                style={{ background: '#2a1010', color: '#e87068', border: '1px solid #302c1e' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#3a1818' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#2a1010' }}
                title="Removes the selected images from the inbox view. The underlying PNG files on disk are not deleted."
              >
                Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDismiss}
        title="Remove from inbox?"
        message={`This removes ${selected.size} image${selected.size !== 1 ? 's' : ''} from your inbox view. The PNG file${selected.size !== 1 ? 's' : ''} on disk stay untouched — you can re-import by rescanning the output folder.`}
        onConfirm={confirmDismissAction}
        onCancel={() => setConfirmDismiss(false)}
      />
    </div>
  )
}
