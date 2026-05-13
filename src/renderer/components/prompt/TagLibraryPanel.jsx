// src/renderer/components/prompt/TagLibraryPanel.jsx
import React, { useState, useEffect } from 'react'

const CURATED = [
  { label: 'Subject', tags: ['1girl', 'solo', 'portrait', 'looking at viewer', 'upper body', 'full body'] },
  { label: 'Style',   tags: ['cinematic', 'photorealistic', 'moody', 'golden hour', 'soft lighting'] },
  { label: 'Camera',  tags: ['bokeh', 'depth of field', 'close-up', 'from above', 'from below'] },
  { label: 'Quality', tags: ['masterpiece', 'best quality', 'highres', 'absurdres'] },
]

export default function TagLibraryPanel({ onInsertTag }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [libraryCount, setLibraryCount] = useState(0)

  useEffect(() => {
    window.forge.prompt.libraryStatus().then((s) => setLibraryCount(s.count || 0)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    setSearching(true)
    const handle = setTimeout(async () => {
      try {
        const r = await window.forge.prompt.searchTags(search.trim(), { limit: 30 })
        setResults(r)
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [search])

  const insert = (tag) => onInsertTag && onInsertTag(tag)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, color: '#eae5dc' }}>Tag Library</div>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={libraryCount > 0 ? `Search ${libraryCount.toLocaleString()} tags…` : 'Library not downloaded'}
        disabled={libraryCount === 0}
        style={{
          width: '100%',
          background: '#1a1813',
          border: '1px solid #302c1e',
          color: '#bfb8a8',
          padding: '6px 8px',
          borderRadius: 4,
          fontSize: 11,
          marginBottom: 12,
          outline: 'none',
        }}
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {search.trim() ? (
          <div>
            {searching && <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic' }}>Searching…</p>}
            {!searching && results.length === 0 && <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic' }}>No matches.</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {results.map((t) => (
                <span
                  key={t.id}
                  onClick={() => insert(t.name)}
                  style={{
                    padding: '3px 7px',
                    fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: 'rgba(122, 160, 232, 0.18)',
                    color: '#7aa0e8',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  title={`${t.post_count.toLocaleString()} posts`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          CURATED.map((group) => (
            <div key={group.label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#8a8268', fontWeight: 600, marginBottom: 4 }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {group.tags.map((tag) => (
                  <span
                    key={tag}
                    onClick={() => insert(tag)}
                    style={{
                      padding: '3px 7px',
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      background: 'rgba(122, 160, 232, 0.18)',
                      color: '#7aa0e8',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: 10, color: '#635c48', fontStyle: 'italic', marginTop: 8 }}>
        Click any tag to drop it into your message →
      </p>
    </div>
  )
}
