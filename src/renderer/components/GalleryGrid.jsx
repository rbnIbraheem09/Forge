// src/renderer/components/GalleryGrid.jsx
import React from 'react'

const SIZE_COLS = { S: 6, M: 4, L: 2 }

export default function GalleryGrid({
  items,
  size = 'M',
  selectedId,
  compareMode = false,
  compareSelected = new Set(),
  onSelect,
  onCompareToggle,
  renderOverlay,
}) {
  const cols = SIZE_COLS[size] || 4

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const isSelected = item.id === selectedId
        const inCompare = compareSelected.has(item.id)

        return (
          <div
            key={item.id}
            onClick={() => {
              if (compareMode) onCompareToggle?.(item.id)
              else onSelect?.(item.id)
            }}
            className="relative cursor-pointer rounded-lg overflow-hidden group"
            style={{
              aspectRatio: '0.85',
              border: `2px solid ${isSelected && !compareMode ? '#7c6ff7' : inCompare ? '#7c6ff7' : 'transparent'}`,
              background: '#1c1c1e',
            }}
          >
            <img
              src={`forge://${item.image_path}`}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.background = '#2a2a2e'; e.target.style.display = 'none' }}
            />

            {/* Compare checkbox */}
            {compareMode && (
              <div
                className="absolute top-1.5 left-1.5 w-4 h-4 rounded flex items-center justify-center"
                style={{
                  background: inCompare ? '#7c6ff7' : 'rgba(0,0,0,0.6)',
                  border: inCompare ? 'none' : '1.5px solid #666',
                }}
              >
                {inCompare && <span className="text-white text-[9px]">✓</span>}
              </div>
            )}

            {/* Iteration badge */}
            <div
              className="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium leading-none"
              style={{
                background: 'rgba(0,0,0,0.65)',
                color: '#ccc',
                display: compareMode ? 'none' : 'block',
              }}
            >
              #{item.iteration_number}
            </div>

            {/* Custom overlay slot */}
            {renderOverlay && renderOverlay(item)}
          </div>
        )
      })}
    </div>
  )
}
