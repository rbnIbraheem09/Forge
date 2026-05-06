// src/renderer/components/ConfirmDialog.jsx
import React, { useEffect } from 'react'

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl p-6 w-80 shadow-2xl"
        style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1" style={{ color: '#f0f0f0' }}>{title}</h3>
        <p className="text-sm mb-5" style={{ color: '#888' }}>{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ background: '#2a2a2e', color: '#888' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: '#c0392b', color: '#fff' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
