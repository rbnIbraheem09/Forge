// src/renderer/components/TagChips.jsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const easeOutExpo = [0.16, 1, 0.3, 1]

export default function TagChips({ tags = '', onChange }) {
  const [input, setInput] = useState('')
  const list = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []

  const addTag = (tag) => {
    const t = tag.trim()
    if (!t || list.includes(t)) return
    onChange([...list, t].join(','))
    setInput('')
  }

  const removeTag = (tag) => {
    onChange(list.filter(t => t !== tag).join(','))
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <AnimatePresence initial={false}>
        {list.map(tag => (
          <motion.span
            key={tag}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
            style={{ background: '#2a2710', color: '#e8c820' }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.18, ease: easeOutExpo }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 leading-none"
              style={{ color: '#bfb8a8', background: 'none', border: 'none', cursor: 'pointer' }}
            >×</button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addTag(input)
          }
        }}
        placeholder="Add tag…"
        className="text-xs outline-none bg-transparent"
        style={{ color: '#bfb8a8', minWidth: '70px', maxWidth: '120px' }}
      />
    </div>
  )
}
