// src/renderer/pages/PromptBuilder.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../context/ToastContext.jsx'

export default function PromptBuilder() {
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const showToast = useToast()

  const reloadSessions = useCallback(async () => {
    const list = await window.forge.prompt.sessions.list()
    setSessions(list)
    if (!activeSessionId && list.length > 0) {
      setActiveSessionId(list[0].id)
    }
  }, [activeSessionId])

  useEffect(() => { reloadSessions() }, [reloadSessions])

  const newChat = async () => {
    const s = await window.forge.prompt.sessions.new()
    await reloadSessions()
    setActiveSessionId(s.id)
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0f0e0b' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between flex-shrink-0 px-5 py-3" style={{ borderBottom: '1px solid #302c1e' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Prompt Builder
          </h1>
          <p className="text-[10px]" style={{ color: '#635c48' }}>DeepSeek · Danbooru tag style</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={newChat}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ↺ New chat
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ⎘ Saved
          </button>
        </div>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Tag Library */}
        <div className="flex flex-col flex-shrink-0" style={{ width: '220px', background: '#0f0e0b', borderRight: '1px solid #302c1e' }}>
          <div className="p-4 text-xs" style={{ color: '#635c48' }}>Tag Library</div>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ color: '#635c48' }}>(placeholder)</div>
        </div>

        {/* Center: Chat */}
        <div className="flex flex-col flex-1 min-w-0" style={{ background: '#0f0e0b' }}>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ color: '#635c48' }}>
            {activeSessionId ? `Chat session ${activeSessionId} (placeholder transcript)` : 'No session — click "New chat" to start.'}
          </div>
          <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: '#302c1e' }}>
            <div className="text-xs" style={{ color: '#635c48' }}>Input dock (placeholder)</div>
          </div>
        </div>

        {/* Right: LoRA Picker */}
        <div className="flex flex-col flex-shrink-0" style={{ width: '270px', background: '#0f0e0b', borderLeft: '1px solid #302c1e' }}>
          <div className="p-4 text-xs" style={{ color: '#635c48' }}>LoRAs</div>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ color: '#635c48' }}>(placeholder)</div>
        </div>
      </div>
    </div>
  )
}
