// src/renderer/components/TagChips.jsx
import React, { useState } from 'react'

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
      {list.map(tag => (
        <span
          key={tag}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
          style={{ background: '#2a2a2e', color: '#aaa' }}
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="ml-0.5 leading-none"
            style={{ color: '#555' }}
          >×</button>
        </span>
      ))}
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
        style={{ color: '#888', minWidth: '70px', maxWidth: '120px' }}
      />
    </div>
  )
}
