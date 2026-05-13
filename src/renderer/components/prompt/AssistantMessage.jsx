// src/renderer/components/prompt/AssistantMessage.jsx
import React from 'react'
import { colorsFor } from '../../lib/prompt-tag-categories.js'

function TagChip({ item, isNegative = false }) {
  const c = colorsFor(item, isNegative)
  const style = {
    background: c.bg,
    color: c.fg,
    padding: '3px 7px',
    fontSize: '10px',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    margin: '2px',
    display: 'inline-block',
    border: c.border ? `1px dashed ${c.border}` : '1px solid transparent',
    fontWeight: item.type === 'lora_trigger' ? 600 : 400,
  }
  return <span style={style}>{item.tag}</span>
}

function GhostButton({ icon, label, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: 'transparent',
        border: 0,
        color: '#8a8268',
        padding: '4px 6px',
        borderRadius: '6px',
        fontSize: '11px',
        cursor: 'pointer',
        transition: 'all .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(232,200,32,0.08)'; e.currentTarget.style.color = '#e8c820' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8a8268' }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
)

const SaveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
  </svg>
)

export default function AssistantMessage({ message, isLatest, onCopy, onSave }) {
  let structured = null
  try {
    structured = JSON.parse(message.structured_response || 'null')
  } catch {}

  if (!structured) {
    return (
      <div style={{
        background: '#1a1813',
        border: '1px solid #302c1e',
        borderRadius: '12px 12px 12px 4px',
        padding: 14,
        maxWidth: '88%',
      }}>
        <p style={{ fontSize: 12, color: '#e87068' }}>{message.content || 'Empty response'}</p>
      </div>
    )
  }

  const positive = structured.positive || []
  const negative = structured.negative || []
  const appliedLoras = positive.filter(t => t.type === 'lora_trigger')

  const positiveText = positive.map(t => t.tag).join(', ')
  const negativeText = negative.map(t => t.tag).join(', ')

  const highlightStyle = isLatest
    ? { borderColor: 'rgba(232,200,32,0.4)', boxShadow: '0 0 0 1px rgba(232,200,32,0.15)' }
    : {}

  return (
    <div style={{
      background: '#1a1813',
      border: '1px solid #302c1e',
      borderRadius: '12px 12px 12px 4px',
      padding: 14,
      maxWidth: '88%',
      ...highlightStyle,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e8c820', fontWeight: 600 }}>
          + Positive{isLatest ? ' · latest' : ''}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <GhostButton icon={<CopyIcon />} label="Copy" onClick={() => onCopy(positiveText)} title="Copy positive prompt" />
          <GhostButton icon={<SaveIcon />} label="Save" onClick={onSave} title="Save as preset" />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        {positive.map((item, i) => (
          <TagChip key={i} item={item} isNegative={false} />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#e06c75', fontWeight: 600 }}>
          − Negative
        </span>
        <GhostButton icon={<CopyIcon />} label="Copy" onClick={() => onCopy(negativeText)} title="Copy negative prompt" />
      </div>

      <div>
        {negative.map((item, i) => (
          <TagChip key={i} item={item} isNegative={true} />
        ))}
      </div>

      {appliedLoras.length > 0 && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px dashed #302c1e',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#635c48', fontWeight: 600 }}>
            LoRAs applied:
          </span>
          {appliedLoras.map((t, i) => (
            <span key={i} style={{
              fontSize: 10, color: '#8a8268', fontFamily: "'JetBrains Mono', monospace",
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <span>🎛</span>
              <span>{t.tag}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
