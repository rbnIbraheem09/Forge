import React, { useEffect, useRef, useState } from 'react'
import AssistantMessage from './AssistantMessage.jsx'
import { useToast } from '../../context/ToastContext.jsx'

function UserBubble({ content }) {
  return (
    <div style={{
      background: '#242118',
      borderRadius: '12px 12px 4px 12px',
      padding: '10px 14px',
      maxWidth: '70%',
      alignSelf: 'flex-end',
      fontSize: 13,
      lineHeight: 1.5,
      color: '#eae5dc',
      whiteSpace: 'pre-wrap',
    }}>
      {content}
    </div>
  )
}

function ToolCallIndicator({ recentToolCall }) {
  return (
    <div style={{
      alignSelf: 'flex-start',
      background: '#1a1813',
      border: '1px dashed #302c1e',
      borderRadius: '12px 12px 12px 4px',
      padding: '8px 12px',
      fontSize: 11,
      color: '#8a8268',
      maxWidth: '88%',
    }}>
      <span style={{ color: '#e8c820' }}>⌕</span>{' '}
      {recentToolCall ? (
        <>Searching tags for <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#e8c820' }}>{recentToolCall.query}</span>… ({recentToolCall.results_count} matches)</>
      ) : (
        <>Generating prompt…</>
      )}
    </div>
  )
}

export default function ChatTranscript({ sessionId, inFlight, recentToolCall, refreshTick, onSavePreset }) {
  const [messages, setMessages] = useState([])
  const showToast = useToast()
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!sessionId) { setMessages([]); return }
    let cancelled = false
    window.forge.prompt.messages.list(sessionId).then((rows) => {
      if (!cancelled) setMessages(rows)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [sessionId, refreshTick])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, inFlight, recentToolCall])

  const copyToClipboard = async (text) => {
    if (!text) { showToast('Nothing to copy.'); return }
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied.')
    } catch {
      showToast("Couldn't copy.")
    }
  }

  const assistantMessages = messages.filter(m => m.role === 'assistant')
  const latestAssistantId = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].id : null

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#0f0e0b',
      }}
    >
      {messages.length === 0 && !inFlight && (
        <div style={{ alignSelf: 'center', marginTop: 60, textAlign: 'center', color: '#635c48' }}>
          <p style={{ fontSize: 13 }}>Describe an image below to generate a prompt.</p>
        </div>
      )}

      {messages.map((m) => {
        if (m.role === 'user') return <UserBubble key={m.id} content={m.content || ''} />
        if (m.role === 'assistant') {
          return (
            <div key={m.id} style={{ alignSelf: 'flex-start', display: 'flex' }}>
              <AssistantMessage
                message={m}
                isLatest={m.id === latestAssistantId}
                onCopy={copyToClipboard}
                onSave={() => onSavePreset(m)}
              />
            </div>
          )
        }
        return null
      })}

      {inFlight && <ToolCallIndicator recentToolCall={recentToolCall} />}
    </div>
  )
}
