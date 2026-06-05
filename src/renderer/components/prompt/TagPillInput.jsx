import React, { useState, useRef, useEffect, useCallback } from 'react'
import { colorsForDanbooru, COLORS } from '../../lib/prompt-tag-categories.js'

function pillColors(item) {
  if (item.type === 'lora_trigger') return COLORS.lora
  return colorsForDanbooru(item.category)
}

export default function TagPillInput({
  tags,
  onChange,
  placeholder = 'Type a tag…',
  inserterRef,
}) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [open, setOpen] = useState(false)
  const inputEl = useRef(null)
  const debounceRef = useRef(null)

  const hasTag = useCallback(
    (name) => tags.some(t => t.tag.toLowerCase() === name.toLowerCase()),
    [tags],
  )

  const commit = useCallback((item) => {
    if (!item.tag || !item.tag.trim()) return
    if (hasTag(item.tag)) { setInput(''); setSuggestions([]); setOpen(false); return }
    onChange([...tags, { tag: item.tag.trim(), category: item.category ?? null }])
    setInput('')
    setSuggestions([])
    setOpen(false)
    setActiveIdx(0)
  }, [tags, onChange, hasTag])

  const commitFreeform = useCallback(async (raw) => {
    const name = (raw || '').trim().replace(/,+$/, '').trim()
    if (!name) return
    if (hasTag(name)) { setInput(''); setSuggestions([]); setOpen(false); return }
    let category = null
    try {
      const map = await window.forge.prompt.resolveTags([name])
      if (map && Object.prototype.hasOwnProperty.call(map, name.toLowerCase())) {
        category = map[name.toLowerCase()]
      }
    } catch {}
    commit({ tag: name, category })
  }, [hasTag, commit])

  // Let the parent (Tag Library / LoRA panel) inject tags imperatively.
  useEffect(() => {
    if (inserterRef) inserterRef.current = (name) => commitFreeform(name)
    return () => { if (inserterRef) inserterRef.current = null }
  }, [inserterRef, commitFreeform])

  // Debounced autocomplete.
  useEffect(() => {
    clearTimeout(debounceRef.current)
    const q = input.trim()
    if (!q) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await window.forge.prompt.searchTags(q, { limit: 8 })
        setSuggestions(r || [])
        setActiveIdx(0)
        setOpen((r || []).length > 0)
      } catch {
        setSuggestions([]); setOpen(false)
      }
    }, 180)
    return () => clearTimeout(debounceRef.current)
  }, [input])

  const removeAt = (idx) => onChange(tags.filter((_, i) => i !== idx))

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (open && suggestions[activeIdx]) {
        e.preventDefault()
        const s = suggestions[activeIdx]
        commit({ tag: s.name, category: s.category })
      } else if (input.trim()) {
        e.preventDefault()
        commitFreeform(input)
      }
      return
    }
    if (e.key === ',') { e.preventDefault(); commitFreeform(input); return }
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      e.preventDefault(); removeAt(tags.length - 1); return
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => inputEl.current && inputEl.current.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
          minHeight: 96, padding: 8, borderRadius: 10,
          background: '#1a1813', border: '1px solid #302c1e',
          cursor: 'text', alignContent: 'flex-start',
        }}
      >
        {tags.map((item, i) => {
          const c = pillColors(item)
          return (
            <span key={`${item.tag}-${i}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: c.bg, color: c.fg,
              padding: '3px 6px 3px 8px', fontSize: 11, borderRadius: 4,
              fontFamily: "'JetBrains Mono', monospace",
              border: c.border ? `1px dashed ${c.border}` : '1px solid transparent',
              fontWeight: item.type === 'lora_trigger' ? 600 : 400,
            }}>
              {item.type === 'lora_trigger' && <span style={{ fontSize: 9 }}>🎛</span>}
              <span>{item.tag}</span>
              <span
                onClick={(e) => { e.stopPropagation(); removeAt(i) }}
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12, lineHeight: 1 }}
                title="Remove"
              >×</span>
            </span>
          )
        })}
        <input
          ref={inputEl}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={tags.length === 0 ? placeholder : ''}
          style={{
            flex: 1, minWidth: 80, background: 'transparent', border: 0, outline: 'none',
            color: '#eae5dc', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            padding: '3px 2px',
          }}
        />
      </div>

      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 30,
          background: '#13110c', border: '1px solid #302c1e', borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => {
            const c = colorsForDanbooru(s.category)
            return (
              <div
                key={s.id}
                onMouseDown={(e) => { e.preventDefault(); commit({ tag: s.name, category: s.category }) }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '6px 10px', cursor: 'pointer',
                  background: i === activeIdx ? 'rgba(232,200,32,0.10)' : 'transparent',
                }}
              >
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: c.fg,
                }}>{s.name}</span>
                <span style={{ fontSize: 9, color: '#635c48' }}>{(s.post_count || 0).toLocaleString()}</span>
              </div>
            )
          })}
          <div style={{ padding: '4px 10px', fontSize: 9, color: '#635c48', borderTop: '1px solid #302c1e' }}>
            Tab / Enter to add · , to add freeform
          </div>
        </div>
      )}
    </div>
  )
}
