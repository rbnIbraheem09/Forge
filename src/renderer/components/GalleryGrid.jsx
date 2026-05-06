// src/renderer/components/GalleryGrid.jsx
import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, stagger } from '../lib/motion.js'

const SIZE_COLS = { S: 6, M: 4, L: 2 }

export default function GalleryGrid({
  items,
  size = 'M',
  selectedId,
  compareMode = false,
  compareSelected = new Set(),
  onSelect,
  onCompareToggle,
  onStarToggle,
  renderOverlay,
}) {
  const cols = SIZE_COLS[size] || 4

  return (
    <motion.div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => {
        const isSelected = item.id === selectedId
        const inCompare = compareSelected.has(item.id)
        const isActiveHighlight = (isSelected && !compareMode) || inCompare

        return (
          <motion.div
            key={item.id}
            variants={fadeUp}
            onClick={() => {
              if (compareMode) onCompareToggle?.(item.id)
              else onSelect?.(item.id)
            }}
            className="relative cursor-pointer rounded-lg overflow-hidden group"
            style={{
              aspectRatio: '0.85',
              border: `2px solid ${isActiveHighlight ? '#e8c820' : 'transparent'}`,
              background: '#1a1813',
            }}
          >
            {/* Thumbnail with hover scale + brightness */}
            <motion.div
              className="w-full h-full"
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: 'center', height: '100%' }}
            >
              <img
                src={`forge://${item.image_path}`}
                alt=""
                className="w-full h-full object-cover"
                style={{ display: 'block' }}
                onError={(e) => {
                  e.target.style.background = '#302c1e'
                  e.target.style.display = 'none'
                }}
              />
            </motion.div>

            {/* Yellow checkmark overlay when selected */}
            {isActiveHighlight && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ boxShadow: 'inset 0 0 0 2px #e8c820' }}
              >
                <div
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: '#e8c820' }}
                >
                  <span style={{ color: '#1a1813', fontSize: '10px', fontWeight: 700 }}>✓</span>
                </div>
              </div>
            )}

            {/* Compare checkbox */}
            {compareMode && (
              <div
                className="absolute top-1.5 left-1.5 w-4 h-4 rounded flex items-center justify-center"
                style={{
                  background: inCompare ? '#e8c820' : 'rgba(0,0,0,0.6)',
                  border: inCompare ? 'none' : '1.5px solid #635c48',
                }}
              >
                {inCompare && (
                  <span style={{ color: '#1a1813', fontSize: '9px', fontWeight: 700 }}>✓</span>
                )}
              </div>
            )}

            {/* Iteration badge */}
            <div
              className="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium leading-none"
              style={{
                background: 'rgba(0,0,0,0.65)',
                color: '#bfb8a8',
                display: compareMode ? 'none' : 'block',
              }}
            >
              #{item.iteration_number}
            </div>

            {/* Star button */}
            {onStarToggle && (
              <motion.button
                className="absolute bottom-1.5 right-1.5 leading-none"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: item.starred ? '#f0c840' : '#635c48',
                }}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => {
                  e.stopPropagation()
                  onStarToggle?.(item.id)
                }}
              >
                {item.starred ? '★' : '☆'}
              </motion.button>
            )}

            {/* Custom overlay slot */}
            {renderOverlay && renderOverlay(item)}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
