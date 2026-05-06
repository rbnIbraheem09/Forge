import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import { useInbox } from '../context/InboxContext.jsx'
import { fadeUp, stagger } from '../lib/motion.js'

export default function Inbox() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [mainGens, setMainGens] = useState([])
  const [loading, setLoading] = useState(true)
  const [newGenTitle, setNewGenTitle] = useState('')
  const [showNewGenInput, setShowNewGenInput] = useState(false)
  const showToast = useToast()
  const { setCount } = useInbox()
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

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(items.map(i => i.id)))
  }

  const assign = async (args) => {
    const itemIds = [...selected]
    const result = await window.forge.inbox.assign({ itemIds, ...args })
    showToast(`Assigned ${itemIds.length} image${itemIds.length > 1 ? 's' : ''}.`)
    setSelected(new Set())
    await load()
    navigate(`/main-gens/${result.mainGenId}`)
  }

  const dismiss = async () => {
    await window.forge.inbox.dismiss({ ids: [...selected] })
    showToast('Dismissed.')
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
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0f0e0b', fontFamily: 'Figtree, sans-serif' }}>
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
        <div className="flex gap-2">
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

      {/* Thumbnail grid with stagger entrance */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid gap-3 mb-6"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
      >
        {items.map(item => {
          const meta = item.extracted_metadata ? JSON.parse(item.extracted_metadata) : {}
          const isSelected = selected.has(item.id)
          return (
            <motion.div
              key={item.id}
              variants={fadeUp}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => toggleSelect(item.id)}
              className="relative cursor-pointer rounded-xl overflow-hidden"
              style={{
                border: `2px solid ${isSelected ? '#e8c820' : '#302c1e'}`,
                aspectRatio: '1',
              }}
            >
              <img
                src={`forge://${item.image_path}`}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              {/* Gradient overlay */}
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }}
              />
              {/* Selected bg tint */}
              {isSelected && (
                <div
                  className="absolute inset-0"
                  style={{ background: 'rgba(232, 200, 32, 0.08)' }}
                />
              )}
              {/* Checkbox */}
              <div
                className="absolute top-2 left-2 w-5 h-5 rounded flex items-center justify-center"
                style={{
                  background: isSelected ? '#e8c820' : 'rgba(0,0,0,0.5)',
                  border: isSelected ? 'none' : `1.5px solid #635c48`,
                }}
              >
                {isSelected && <span style={{ color: '#0f0e0b', fontSize: '11px', fontWeight: 700 }}>✓</span>}
              </div>
              {/* Seed/steps meta overlay */}
              <div
                className="absolute bottom-0 left-0 right-0 p-2"
                style={{ background: 'rgba(15, 14, 11, 0.72)' }}
              >
                {meta.seed && <p className="text-[10px]" style={{ color: '#bfb8a8' }}>seed {meta.seed}</p>}
                {meta.steps && <p className="text-[10px]" style={{ color: '#bfb8a8' }}>{meta.steps} steps</p>}
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Assign panel — slides up from bottom with AnimatePresence */}
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
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (newGenTitle.trim()) assign({ newTitle: newGenTitle })
                  }}
                >
                  <input
                    autoFocus
                    value={newGenTitle}
                    onChange={(e) => setNewGenTitle(e.target.value)}
                    placeholder="New Main Gen title…"
                    className="rounded-lg px-3 py-1.5 text-sm outline-none"
                    style={{
                      background: '#0f0e0b',
                      border: '1px solid #e8c820',
                      color: '#eae5dc',
                      width: '200px',
                      fontFamily: 'Figtree, sans-serif',
                    }}
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                    style={{ background: '#e8c820', color: '#0f0e0b' }}
                  >
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
                  style={{
                    background: '#242118',
                    color: '#bfb8a8',
                    border: '1px solid #302c1e',
                    fontFamily: 'Figtree, sans-serif',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#302c1e'
                    e.currentTarget.style.color = '#e8c820'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#242118'
                    e.currentTarget.style.color = '#bfb8a8'
                  }}
                >
                  {mg.title} <span style={{ color: '#635c48' }}>{mg.iteration_count} iters</span>
                </button>
              ))}
              <button
                onClick={dismiss}
                className="px-3 py-1.5 rounded-lg text-sm ml-auto"
                style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#302c1e' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#242118' }}
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
