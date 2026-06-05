import React, { useState, useEffect, useRef } from 'react'
import { colorsForDanbooru } from '../../lib/prompt-tag-categories.js'

export default function RelevancyStrip({ tags, onAdd }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const names = tags.map(t => t.tag).join('|') // stable dependency key

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (tags.length === 0) { setSuggestions([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await window.forge.prompt.relatedTags(tags.map(t => t.tag), { limit: 20 })
        setSuggestions(r || [])
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names])

  if (tags.length === 0) return null

  return (
    <div style={{
      padding: '8px 10px', borderRadius: 10,
      background: 'rgba(232,200,32,0.04)', border: '1px solid #242118', marginBottom: 10,
    }}>
      <div style={{
        fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px',
        color: '#8a8268', fontWeight: 600, marginBottom: 6,
      }}>
        Related tags {loading ? '· finding…' : ''}
      </div>
      {suggestions.length === 0 && !loading ? (
        <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic' }}>No related tags yet — add a few more.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {suggestions.map((s) => {
            const c = colorsForDanbooru(s.category)
            return (
              <span
                key={s.id}
                onClick={() => onAdd({ tag: s.name, category: s.category })}
                title={`${(s.post_count || 0).toLocaleString()} posts · click to add`}
                style={{
                  padding: '3px 7px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  background: c.bg, color: c.fg,
                  border: '1px solid transparent',
                }}
              >+ {s.name}</span>
            )
          })}
        </div>
      )}
    </div>
  )
}
