import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'main-gens', label: 'Main Gens' },
  { key: 'iterations', label: 'Iterations' },
  { key: 'loras', label: 'LoRAs' },
  { key: 'checkpoints', label: 'Checkpoints' },
]

function highlight(text, query) {
  if (!query || !text) return text || ''
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#7c6ff7', color: '#fff', borderRadius: '2px', padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SearchOverlay({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [starred, setStarred] = useState(false)
  const [results, setResults] = useState(null)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const searchTimer = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults(null)
      setCursor(0)
    }
  }, [isOpen])

  const search = useCallback(async (q, type, star) => {
    if (!q.trim()) { setResults(null); return }
    const types = type === 'all' ? [] : [type]
    const r = await window.forge.search.query({ query: q, filters: { types, starred: star } })
    setResults(r)
    setCursor(0)
  }, [])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => search(query, typeFilter, starred), 200)
  }, [query, typeFilter, starred, search])

  const allResults = results ? [
    ...results.mainGens.map(r => ({ ...r, _type: 'main-gen' })),
    ...results.iterations.map(r => ({ ...r, _type: 'iteration' })),
    ...results.loras.map(r => ({ ...r, _type: 'lora' })),
    ...results.checkpoints.map(r => ({ ...r, _type: 'checkpoint' })),
  ] : []

  const goTo = (result) => {
    onClose()
    if (result._type === 'main-gen') navigate(`/main-gens/${result.id}`)
    else if (result._type === 'iteration') navigate(`/main-gens/${result.main_gen_id}`)
    else if (result._type === 'lora') navigate(`/loras/${result.id}`)
    else if (result._type === 'checkpoint') navigate(`/models/${result.id}`)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, allResults.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && allResults[cursor]) goTo(allResults[cursor])
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9996] flex items-start justify-center pt-24"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <span style={{ color: '#555' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search main gens, iterations, LoRAs, checkpoints…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#f0f0f0' }}
          />
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2a2a2e', color: '#555' }}>ESC</span>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid #2a2a2e' }}>
          {TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0"
              style={{ background: typeFilter === t.key ? '#7c6ff7' : '#2a2a2e', color: typeFilter === t.key ? '#fff' : '#888' }}
            >
              {t.label}
            </button>
          ))}
          <div className="w-px mx-1 flex-shrink-0" style={{ background: '#2a2a2e' }} />
          <button
            onClick={() => setStarred(s => !s)}
            className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0"
            style={{ background: starred ? '#7c6ff7' : '#2a2a2e', color: starred ? '#fff' : '#888' }}
          >
            ⭐ Starred
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!query.trim() && (
            <div className="py-12 text-center text-sm" style={{ color: '#555' }}>Type to search…</div>
          )}
          {query.trim() && results && allResults.length === 0 && (
            <div className="py-12 text-center text-sm" style={{ color: '#555' }}>No results for "{query}"</div>
          )}
          {results && allResults.length > 0 && (() => {
            const sections = [
              { type: 'main-gen', label: 'Main Gens', items: results.mainGens },
              { type: 'iteration', label: 'Iterations', items: results.iterations },
              { type: 'lora', label: 'LoRAs', items: results.loras },
              { type: 'checkpoint', label: 'Checkpoints', items: results.checkpoints },
            ].filter(s => s.items.length > 0)

            let globalIdx = 0
            return sections.map(section => (
              <div key={section.type}>
                <div className="px-4 py-2 text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>
                  {section.label}
                </div>
                {section.items.map(item => {
                  const idx = globalIdx++
                  const isFocused = idx === cursor
                  const mapped = { ...item, _type: section.type }
                  return (
                    <div
                      key={item.id}
                      onClick={() => goTo(mapped)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      style={{ background: isFocused ? '#2a2a2e' : 'transparent' }}
                    >
                      {(section.type === 'main-gen' || section.type === 'iteration') && (
                        <div
                          className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden"
                          style={{ background: item.hero_color || '#2a2a2e' }}
                        >
                          {(item.hero_image_path || item.image_path) && (
                            <img src={`forge://${item.hero_image_path || item.image_path}`} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>
                          {highlight(item.title || item.name || `Iteration #${item.iteration_number}`, query)}
                        </p>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#555' }}>
                          {section.type === 'iteration' && `${item.main_gen_title} · seed ${item.seed || '—'}`}
                          {section.type === 'main-gen' && item.tags}
                          {(section.type === 'lora' || section.type === 'checkpoint') && item.status === 'offline' && 'Offline'}
                        </p>
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>
                        {section.type === 'main-gen' && 'Main Gen'}
                        {section.type === 'iteration' && 'Iteration'}
                        {section.type === 'lora' && 'LoRA'}
                        {section.type === 'checkpoint' && 'Checkpoint'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))
          })()}
        </div>

        {/* Footer */}
        <div className="flex gap-4 px-4 py-2.5" style={{ borderTop: '1px solid #2a2a2e' }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['ESC', 'close'], ['⌘K', 'toggle']].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a2a2e', color: '#888' }}>{key}</span>
              <span className="text-[10px]" style={{ color: '#555' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
