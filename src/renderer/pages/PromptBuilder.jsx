// src/renderer/pages/PromptBuilder.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import ChatTranscript from '../components/prompt/ChatTranscript.jsx'
import InputDock from '../components/prompt/InputDock.jsx'
import LoRAPicker from '../components/prompt/LoRAPicker.jsx'
import TagLibraryPanel from '../components/prompt/TagLibraryPanel.jsx'

export default function PromptBuilder() {
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedLoraIds, setSelectedLoraIds] = useState(() => new Set())
  const [loraNamesById, setLoraNamesById] = useState(() => new Map())
  const [inFlight, setInFlight] = useState(false)
  const [recentToolCall, setRecentToolCall] = useState(null)
  const [defaultTemp, setDefaultTemp] = useState(1.0)
  const [transcriptTick, setTranscriptTick] = useState(0)
  const showToast = useToast()
  const insertTagRef = useRef(null)

  useEffect(() => {
    window.forge.prompt.sessions.list().then((list) => {
      setSessions(list)
      if (list.length > 0) setActiveSessionId(list[0].id)
    }).catch(() => {})
    window.forge.settings.get('prompt_default_temperature').then((v) => {
      if (v) setDefaultTemp(parseFloat(v))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.forge.loras.list().then((rows) => {
      const m = new Map()
      for (const r of rows) m.set(r.id, r)
      setLoraNamesById(m)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (payload) => {
      setRecentToolCall({ query: payload.query, results_count: payload.results_count })
    }
    window.forge.on('prompt:tool-call', handler)
    return () => window.forge.off('prompt:tool-call', handler)
  }, [])

  const reloadSessions = useCallback(async () => {
    const list = await window.forge.prompt.sessions.list()
    setSessions(list)
  }, [])

  const newChat = async () => {
    const s = await window.forge.prompt.sessions.new()
    setActiveSessionId(s.id)
    setSelectedLoraIds(new Set())
    await reloadSessions()
  }

  const toggleLora = (id) => {
    setSelectedLoraIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const removeLora = (id) => {
    setSelectedLoraIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleInsertTag = (tag) => {
    if (insertTagRef.current) insertTagRef.current(tag)
  }

  const handleSend = async ({ userMessage, temperature }) => {
    if (inFlight) return
    setInFlight(true)
    setRecentToolCall(null)
    try {
      const result = await window.forge.prompt.send({
        sessionId: activeSessionId,
        userMessage,
        checkpointId: null,
        loraIds: Array.from(selectedLoraIds),
        temperature,
      })

      if (result.ok) {
        if (!activeSessionId) setActiveSessionId(result.sessionId)
        await reloadSessions()
        setTranscriptTick(t => t + 1)
      } else {
        showToast(`Send failed: ${result.reason}`)
        setTranscriptTick(t => t + 1)
      }
    } catch (err) {
      showToast(`Send error: ${err.message || err}`)
    } finally {
      setInFlight(false)
      setRecentToolCall(null)
    }
  }

  const handleSavePreset = (assistantMessage) => {
    const name = window.prompt('Save this prompt as:', 'Untitled preset')
    if (!name) return
    let structured = null
    try { structured = JSON.parse(assistantMessage.structured_response || 'null') } catch {}
    if (!structured) { showToast('Cannot save — malformed response.'); return }

    const positive = structured.positive || []
    const negative = structured.negative || []
    const loraTriggers = positive.filter(t => t.type === 'lora_trigger')

    const lorasSnapshot = loraTriggers.map(t => {
      const row = loraNamesById.get(t.lora_id)
      return {
        lora_id: t.lora_id,
        filename: row ? (row.file_path ? row.file_path.split('/').pop() : row.name) : '(unknown)',
        trigger_words: t.tag,
      }
    })

    window.forge.prompt.presets.save({
      name,
      sourceMessageId: assistantMessage.id,
      userDescription: null,
      positiveText: positive.map(t => t.tag).join(', '),
      negativeText: negative.map(t => t.tag).join(', '),
      positiveStructured: JSON.stringify(positive),
      negativeStructured: JSON.stringify(negative),
      modelFamily: assistantMessage.model_family || null,
      checkpointId: null,
      temperature: assistantMessage.temperature,
      loras: lorasSnapshot,
    }).then((r) => {
      if (r.ok) showToast(`Saved "${name}".`)
      else showToast('Save failed.')
    }).catch(() => showToast('Save failed.'))
  }

  const selectedLorasArray = Array.from(selectedLoraIds).map(id => loraNamesById.get(id)).filter(Boolean)

  return (
    <div className="flex flex-col h-full" style={{ background: '#0f0e0b' }}>
      <div className="flex items-center justify-between flex-shrink-0 px-5 py-3" style={{ borderBottom: '1px solid #302c1e' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}>
            Prompt Builder
          </h1>
          <p className="text-[10px]" style={{ color: '#635c48' }}>
            DeepSeek · {sessions.length > 0 && activeSessionId ? `Session ${activeSessionId}` : 'No session yet'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={newChat}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ↺ New chat
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-shrink-0" style={{ width: '220px', background: '#0f0e0b', borderRight: '1px solid #302c1e' }}>
          <TagLibraryPanel onInsertTag={handleInsertTag} />
        </div>

        <div className="flex flex-col flex-1 min-w-0" style={{ background: '#0f0e0b' }}>
          <ChatTranscript
            sessionId={activeSessionId}
            inFlight={inFlight}
            recentToolCall={recentToolCall}
            refreshTick={transcriptTick}
            onSavePreset={handleSavePreset}
          />
          <InputDock
            selectedLoras={selectedLorasArray}
            onRemoveLora={removeLora}
            onSend={handleSend}
            inFlight={inFlight}
            defaultTemp={defaultTemp}
            insertTagRef={insertTagRef}
          />
        </div>

        <div className="flex-shrink-0" style={{ width: '270px', background: '#0f0e0b', borderLeft: '1px solid #302c1e' }}>
          <LoRAPicker
            selectedIds={selectedLoraIds}
            onToggle={toggleLora}
          />
        </div>
      </div>
    </div>
  )
}
