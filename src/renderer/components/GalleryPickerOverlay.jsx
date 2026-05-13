import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { overlayBg, scaleIn } from '../lib/motion.js'

// Picks an iteration to use as an example image.
// Default-filtered to iterations using the given entity; toggle for all.
//
// Props:
//   isOpen: boolean
//   entityKind: 'lora' | 'checkpoint'
//   entityId: number
//   entityName: string
//   onPick: (iterationId) => void
//   onClose: () => void
export default function GalleryPickerOverlay({ isOpen, entityKind, entityId, entityName, onPick, onClose }) {
  const [showAll, setShowAll] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    const fetch = async () => {
      let rows
      if (showAll) {
        rows = await window.forge.iterations.listAll()
      } else if (entityKind === 'lora') {
        rows = await window.forge.loras.usage({ id: entityId })
      } else {
        rows = await window.forge.models.usage(entityId)
      }
      if (!cancelled) { setItems(rows); setLoading(false) }
    }
    fetch()
    return () => { cancelled = true }
  }, [isOpen, showAll, entityKind, entityId])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) setShowAll(false)
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          variants={overlayBg} initial="hidden" animate="visible" exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: '#1a1813', border: '1px solid #302c1e', width: 'min(960px, 90vw)', height: 'min(720px, 85vh)' }}
            variants={scaleIn} initial="hidden" animate="visible"
            onClick={e => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #302c1e' }}>
              <div>
                <h2 style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 18 }}>
                  Pick an example for {entityName}
                </h2>
                <p className="text-xs mt-1" style={{ color: '#635c48' }}>
                  Click any iteration to use its image as an example.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: '#242118' }}>
                <button
                  onClick={() => setShowAll(false)}
                  className="text-xs px-3 py-1 rounded-md"
                  style={{
                    background: !showAll ? '#e8c820' : 'transparent',
                    color: !showAll ? '#0f0e0b' : '#bfb8a8',
                    fontWeight: !showAll ? 600 : 400,
                  }}
                >Only this {entityKind === 'lora' ? 'LoRA' : 'checkpoint'}</button>
                <button
                  onClick={() => setShowAll(true)}
                  className="text-xs px-3 py-1 rounded-md"
                  style={{
                    background: showAll ? '#e8c820' : 'transparent',
                    color: showAll ? '#0f0e0b' : '#bfb8a8',
                    fontWeight: showAll ? 600 : 400,
                  }}
                >All iterations</button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
              {loading && <p className="text-sm" style={{ color: '#635c48' }}>Loading…</p>}
              {!loading && items.length === 0 && (
                <p className="text-sm" style={{ color: '#635c48' }}>
                  {showAll
                    ? 'No iterations yet — assign some from the Inbox first.'
                    : `No iterations use this ${entityKind === 'lora' ? 'LoRA' : 'checkpoint'} yet — try "All iterations".`}
                </p>
              )}
              {!loading && items.length > 0 && (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                  {items.map(iter => (
                    <motion.div
                      key={iter.id}
                      onClick={() => { onPick(iter.id); onClose() }}
                      className="relative cursor-pointer rounded-lg overflow-hidden"
                      style={{ aspectRatio: '0.85', background: '#0f0e0b', border: '1px solid #302c1e' }}
                      whileHover={{ scale: 1.04, borderColor: '#e8c820' }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      <img src={`forge://thumb${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 60%, rgba(0,0,0,0.85))' }} />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-[10px]" style={{ color: '#bfb8a8' }}>
                          {iter.main_gen_title} · #{iter.iteration_number}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
