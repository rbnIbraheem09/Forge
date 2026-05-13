import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Three-option dropdown attached to the "+ Add example" tile.
//
// Props:
//   isOpen: boolean
//   anchor: 'right' | 'left'  — which side of the trigger to align to
//   onPaste: () => void
//   onPickFile: () => void
//   onPickGallery: () => void
//   onClose: () => void
export default function AddExampleMenu({ isOpen, anchor = 'right', onPaste, onPickFile, onPickGallery, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const escHandler = (e) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [isOpen, onClose])

  const items = [
    { label: 'Paste screenshot', desc: 'From clipboard', action: onPaste },
    { label: 'Choose file…',     desc: 'PNG, JPG, WEBP', action: onPickFile },
    { label: 'Pick from gallery',desc: 'An existing iteration', action: onPickGallery },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          className="absolute z-30 rounded-xl overflow-hidden"
          style={{
            background: '#242118',
            border: '1px solid #302c1e',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            top: 'calc(100% + 6px)',
            [anchor]: 0,
            minWidth: 220,
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.16,1,0.3,1] } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
        >
          {items.map(it => (
            <button
              key={it.label}
              onClick={() => { it.action(); onClose() }}
              className="block w-full text-left px-4 py-2.5 hover:bg-[#302c1e] transition-colors"
            >
              <div className="text-sm" style={{ color: '#eae5dc' }}>{it.label}</div>
              <div className="text-[10px] mt-0.5" style={{ color: '#635c48' }}>{it.desc}</div>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
