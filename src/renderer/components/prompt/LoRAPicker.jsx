// src/renderer/components/prompt/LoRAPicker.jsx
import React, { useState, useEffect } from 'react'

export default function LoRAPicker({ selectedIds, onToggle }) {
  const [loras, setLoras] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.forge.loras.list().then(setLoras).catch(() => {})
  }, [])

  const filtered = loras.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.trigger_words || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, color: '#eae5dc' }}>LoRAs</div>
        <span style={{ fontSize: 10, color: '#7daa88', fontWeight: 600 }}>
          {selectedIds.size} selected
        </span>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search your LoRAs…"
        style={{
          width: '100%',
          background: '#1a1813',
          border: '1px solid #302c1e',
          color: '#bfb8a8',
          padding: '6px 8px',
          borderRadius: 4,
          fontSize: 11,
          marginBottom: 10,
          outline: 'none',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 && (
          <p style={{ fontSize: 11, color: '#635c48', fontStyle: 'italic' }}>No LoRAs match.</p>
        )}
        {filtered.map((l) => {
          const isSelected = selectedIds.has(l.id)
          const noTriggers = !(l.trigger_words || '').trim()
          return (
            <div
              key={l.id}
              onClick={() => onToggle(l.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: isSelected ? 'rgba(125, 170, 136, 0.12)' : 'transparent',
                border: isSelected ? '1px solid rgba(125, 170, 136, 0.3)' : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: l.status === 'offline' ? 0.45 : 1,
                transition: 'background .12s',
              }}
            >
              <div style={{
                width: 14, height: 14,
                border: isSelected ? 'none' : '1.5px solid #4a4530',
                borderRadius: 3,
                background: isSelected ? '#7daa88' : 'transparent',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#0f0e0b', fontSize: 10, fontWeight: 700,
              }}>
                {isSelected ? '✓' : ''}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: isSelected ? '#eae5dc' : '#bfb8a8', fontWeight: 500 }}>
                  {l.name}
                </div>
                <div style={{ fontSize: 9, color: '#635c48', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                  {noTriggers ? 'no trigger words set' : `trigger: ${l.trigger_words}`}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
