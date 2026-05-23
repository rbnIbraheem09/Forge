// src/renderer/components/prompt/SavedPresetsDrawer.jsx
import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../../context/ToastContext.jsx'

export default function SavedPresetsDrawer({ isOpen, onClose }) {
  const [presets, setPresets] = useState([])
  const [renamingId, setRenamingId] = useState(null)
  const [renameText, setRenameText] = useState('')
  const showToast = useToast()

  const reload = () => {
    window.forge.prompt.presets.list().then(setPresets).catch(() => {})
  }

  useEffect(() => { if (isOpen) reload() }, [isOpen])

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied.')
    } catch { showToast("Couldn't copy.") }
  }

  const remove = async (id, name) => {
    if (!window.confirm(`Delete preset "${name}"?`)) return
    await window.forge.prompt.presets.delete(id)
    reload()
    showToast('Deleted.')
  }

  const startRename = (p) => {
    setRenamingId(p.id)
    setRenameText(p.name)
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameText('')
  }

  const commitRename = async (id) => {
    const next = renameText.trim()
    if (!next) { cancelRename(); return }
    await window.forge.prompt.presets.rename(id, next)
    setRenamingId(null)
    setRenameText('')
    reload()
    showToast('Renamed.')
  }

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
          onClick={onClose}
        >
          <motion.div
            className="rounded-xl p-6 w-[640px] max-h-[80vh] overflow-y-auto shadow-2xl"
            style={{ background: '#1a1813', border: '1px solid #302c1e' }}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold mb-1" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              Saved Presets
            </h2>
            <p className="text-xs mb-5" style={{ color: '#635c48' }}>
              Generated prompts you've archived. Click Copy Positive to send the prompt to your clipboard.
            </p>

            {presets.length === 0 ? (
              <p className="text-sm" style={{ color: '#635c48' }}>No presets yet — click Save on a generated prompt to start.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {presets.map(p => (
                  <div key={p.id} className="rounded-lg p-4" style={{ background: '#242118', border: '1px solid #302c1e' }}>
                    <div className="flex items-center justify-between mb-2 gap-2">
                      {renamingId === p.id ? (
                        <input
                          autoFocus
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(p.id)
                            if (e.key === 'Escape') cancelRename()
                          }}
                          onBlur={() => commitRename(p.id)}
                          className="flex-1 px-2 py-1 rounded text-sm"
                          style={{ background: '#0f0e0b', border: '1px solid #4a4530', color: '#eae5dc', outline: 'none' }}
                        />
                      ) : (
                        <p
                          className="text-sm font-medium flex-1 cursor-text"
                          style={{ color: '#eae5dc' }}
                          onDoubleClick={() => startRename(p)}
                          title="Double-click to rename"
                        >
                          {p.name}
                        </p>
                      )}
                      <p className="text-[10px] flex-shrink-0" style={{ color: '#635c48' }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-[11px] font-mono mb-2" style={{ color: '#bfb8a8', lineHeight: 1.5 }}>
                      {p.positive_text.length > 220 ? p.positive_text.slice(0, 220) + '…' : p.positive_text}
                    </p>
                    {p.loras && p.loras.length > 0 && (
                      <p className="text-[10px] mb-3" style={{ color: '#635c48' }}>
                        🎛 {p.loras.map(l => l.lora_filename_snapshot).join(' · ')}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => copy(p.positive_text)}
                        className="px-3 py-1.5 rounded text-xs"
                        style={{ background: '#e8c820', color: '#0f0e0b', fontWeight: 600 }}
                      >
                        Copy positive
                      </button>
                      <button
                        onClick={() => copy(p.negative_text)}
                        className="px-3 py-1.5 rounded text-xs"
                        style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
                      >
                        Copy negative
                      </button>
                      <button
                        onClick={() => startRename(p)}
                        className="px-3 py-1.5 rounded text-xs"
                        style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => remove(p.id, p.name)}
                        className="px-3 py-1.5 rounded text-xs ml-auto"
                        style={{ background: '#2a1010', color: '#e87068' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
