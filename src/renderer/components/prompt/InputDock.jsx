// src/renderer/components/prompt/InputDock.jsx
import React, { useState, useEffect } from 'react'

export default function InputDock({ selectedLoras, onRemoveLora, onSend, inFlight, defaultTemp, insertTagRef }) {
  const [text, setText] = useState('')
  const [temp, setTemp] = useState(defaultTemp || 1.0)

  // Sync slider with the default temp from settings on mount/change.
  useEffect(() => {
    setTemp(defaultTemp || 1.0)
  }, [defaultTemp])

  // Expose tag-insertion to the parent via ref.
  useEffect(() => {
    if (!insertTagRef) return
    insertTagRef.current = (tag) => {
      setText((prev) => (prev ? prev + ', ' : '') + tag)
    }
    return () => { insertTagRef.current = null }
  }, [insertTagRef])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || inFlight) return
    onSend({ userMessage: trimmed, temperature: temp })
    setText('')
  }

  const handleKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ padding: '14px 18px 18px', borderTop: '1px solid #302c1e', background: '#0d0c09' }}>
      {selectedLoras && selectedLoras.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {selectedLoras.map((l) => (
            <span
              key={l.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 9px',
                background: 'rgba(125, 170, 136, 0.18)',
                color: '#7daa88',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              🎛 {l.name}
              <span
                onClick={() => onRemoveLora(l.id)}
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 13, lineHeight: 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = 1 }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6 }}
              >
                ×
              </span>
            </span>
          ))}
        </div>
      )}

      <div style={{ background: '#1a1813', border: '1px solid #302c1e', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe your image in any way — narrative, paragraph, vibe, whatever feels natural… (⌘/Ctrl+Enter to send)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 0,
              color: '#eae5dc',
              fontSize: 13,
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              minHeight: 38,
              maxHeight: 200,
              fontFamily: 'Figtree, sans-serif',
            }}
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || inFlight}
            style={{
              background: !text.trim() || inFlight ? '#302c1e' : '#e8c820',
              color: !text.trim() || inFlight ? '#635c48' : '#0f0e0b',
              fontWeight: 700,
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 6,
              border: 0,
              cursor: !text.trim() || inFlight ? 'not-allowed' : 'pointer',
            }}
          >
            {inFlight ? 'Sending…' : 'Send ▸'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #302c1e' }}>
          <span style={{ display: 'inline-flex', gap: 4, fontSize: 10, color: '#bfb8a8' }}>
            ⬡ DeepSeek
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#8a8268', fontWeight: 600 }}>Temp</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temp}
              onChange={(e) => setTemp(parseFloat(e.target.value))}
              style={{ accentColor: '#e8c820', width: 90 }}
            />
            <span style={{ fontSize: 10, color: '#e8c820', fontFamily: "'JetBrains Mono', monospace", minWidth: 28 }}>
              {temp.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
