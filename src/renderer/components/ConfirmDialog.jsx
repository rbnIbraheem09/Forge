// src/renderer/components/ConfirmDialog.jsx
import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onCancel}
        >
          <motion.div
            className="rounded-xl p-6 w-80 shadow-2xl"
            style={{ background: '#1a1813', border: '1px solid #302c1e' }}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1" style={{ color: '#eae5dc' }}>{title}</h3>
            <p className="text-sm mb-5" style={{ color: '#bfb8a8' }}>{message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: '#242118', color: '#bfb8a8', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#2a1010', color: '#e87068', border: 'none', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
