import React, { useState } from 'react'
import AutoGrowTextarea from './AutoGrowTextarea.jsx'

// Splitting on a capturing-group regex causes the captured groups themselves
// to appear as alternating entries in the parts array — so odd-indexed parts
// that match are URLs, and even-indexed parts are plain text.
const URL_SPLIT_RE = /(\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+)/gi
const URL_TEST_RE = /^\bhttps?:\/\/[^\s]+$|^\bwww\.[^\s]+$/i

function linkify(text) {
  const parts = text.split(URL_SPLIT_RE)
  return parts.map((part, i) => {
    if (URL_TEST_RE.test(part)) {
      const href = part.startsWith('www.') ? 'https://' + part : part
      return (
        <a
          key={i}
          href={href}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.forge.system.openExternal(href)
          }}
          style={{
            color: '#7daa88',
            textDecoration: 'underline',
            cursor: 'pointer',
            overflowWrap: 'anywhere',
          }}
        >
          {part}
        </a>
      )
    }
    return part
  })
}

const READ_STYLE = {
  background: '#1a1813',
  border: '1px solid transparent',
  color: '#eae5dc',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  cursor: 'text',
}

const EDIT_STYLE = {
  background: '#1a1813',
  border: '1px solid #635c48',
  color: '#eae5dc',
}

export default function NotesField({
  value,
  onChange,
  placeholder,
  minRows = 5,
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <AutoGrowTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minRows={minRows}
        autoFocus
        onBlur={() => setEditing(false)}
        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
        style={EDIT_STYLE}
      />
    )
  }

  const isEmpty = !value || !value.trim()

  return (
    <div
      onClick={() => setEditing(true)}
      className="rounded-xl px-4 py-3 text-sm transition-colors"
      style={{
        ...READ_STYLE,
        minHeight: minRows * 22 + 'px',
      }}
    >
      {isEmpty ? (
        <span style={{ color: '#635c48' }}>{placeholder}</span>
      ) : (
        linkify(value)
      )}
    </div>
  )
}
