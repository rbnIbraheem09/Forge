import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { overlayBg, scaleIn } from '../lib/motion.js'

// Near-full-size image overlay. Click backdrop or press Esc to close.
//
// Props:
//   isOpen: boolean
//   imagePath: string | null   — absolute path; served via forge:///<path>
//   onClose: () => void
export default function LightboxOverlay({ isOpen, imagePath, onClose }) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && imagePath && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-8 cursor-zoom-out"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          variants={overlayBg} initial="hidden" animate="visible" exit="exit"
          onClick={onClose}
        >
          <motion.img
            src={`forge://${imagePath}`}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
            variants={scaleIn} initial="hidden" animate="visible"
            onClick={e => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
