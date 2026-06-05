// src/renderer/pages/PromptBuilder.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import ChatTranscript from '../components/prompt/ChatTranscript.jsx'
import InputDock from '../components/prompt/InputDock.jsx'
import LoRAPicker from '../components/prompt/LoRAPicker.jsx'
import TagLibraryPanel from '../components/prompt/TagLibraryPanel.jsx'
import SavedPresetsDrawer from '../components/prompt/SavedPresetsDrawer.jsx'
import ManualPromptComposer from '../components/prompt/ManualPromptComposer.jsx'

export default function PromptBuilder() {
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedLoraIds, setSelectedLoraIds] = useState(() => new Set())
  const [loraNamesById, setLoraNamesById] = useState(() => new Map())
  const [inFlight, setInFlight] = useState(false)
  const [recentToolCall, setRecentToolCall] = useState(null)
  const [defaultTemp, setDefaultTemp] = useState(1.0)
  const [transcriptTick, setTranscriptTick] = useState(0)
  const [libraryReady, setLibraryReady] = useState(true)
  const [apiKeySet, setApiKeySet] = useState(true)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [mode, setMode] = useState('ai') // 'ai' | 'manual'
  const showToast = useToast()
  const insertTagRef = useRef(null)

  useEffect(() => {
    window.forge.settings.get('prompt_default_temperature').then((v) => {
      if (v) setDefaultTemp(parseFloat(v))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.forge.prompt.libraryStatus().then((s) => setLibraryReady(s.indexed && s.count > 0)).catch(() => setLibraryReady(false))
    window.forge.prompt.hasApiKey().then(setApiKeySet).catch(() => setApiKeySet(false))
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

  useEffect(() => {
    window.forge.settings.get('prompt_builder_mode').then((v) => {
      if (v === 'manual' || v === 'ai') setMode(v)
    }).catch(() => {})
  }, [])

  const changeMode = (m) => {
    setMode(m)
    window.forge.settings.set('prompt_builder_mode', m)
  }

  const reloadSessions = useCallback(async () => {
    const list = await window.forge.prompt.sessions.list()
    setSessions(list)
  }, [])

  const newChat = () => {
    // Just clear the active session — the backend lazy-creates one on the first send.
    setActiveSessionId(null)
    setSelectedLoraIds(new Set())
    setTranscriptTick(t => t + 1)
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

  const handleSavePreset = async (assistantMessage) => {
    console.log('[handleSavePreset] called with message id:', assistantMessage && assistantMessage.id)
    let structured = null
    try { structured = JSON.parse(assistantMessage.structured_response || 'null') } catch {}
    if (!structured) { showToast('Cannot save — malformed response.'); return }

    const positive = structured.positive || []
    const negative = structured.negative || []
    const loraTriggers = positive.filter(t => t.type === 'lora_trigger')

    // Auto-name: use the original user description (truncated) if we can fetch it,
    // otherwise fall back to a date-stamped name.
    let autoName = null
    let userDescription = null
    try {
      const sessionId = assistantMessage.session_id || activeSessionId
      if (sessionId) {
        const messages = await window.forge.prompt.messages.list(sessionId)
        // Find the user message immediately preceding this assistant message.
        const idx = messages.findIndex(m => m.id === assistantMessage.id)
        for (let i = idx - 1; i >= 0; i--) {
          if (messages[i].role === 'user' && messages[i].content) {
            userDescription = messages[i].content
            autoName = messages[i].content.trim().slice(0, 60).replace(/\s+/g, ' ')
            if (messages[i].content.length > 60) autoName += '…'
            break
          }
        }
      }
    } catch {}
    if (!autoName) {
      const ts = new Date().toISOString().slice(0, 16).replace('T', ' ')
      autoName = `Preset ${ts}`
    }

    const lorasSnapshot = loraTriggers.map(t => {
      const row = loraNamesById.get(t.lora_id)
      return {
        lora_id: t.lora_id,
        filename: row ? (row.file_path ? row.file_path.split('/').pop() : row.name) : '(unknown)',
        trigger_words: t.tag,
      }
    })

    try {
      const r = await window.forge.prompt.presets.save({
        name: autoName,
        sourceMessageId: assistantMessage.id,
        userDescription,
        positiveText: positive.map(t => t.tag).join(', '),
        negativeText: negative.map(t => t.tag).join(', '),
        positiveStructured: JSON.stringify(positive),
        negativeStructured: JSON.stringify(negative),
        modelFamily: assistantMessage.model_family || null,
        checkpointId: null,
        temperature: assistantMessage.temperature,
        loras: lorasSnapshot,
      })
      if (r && r.ok) {
        showToast(`Saved as "${autoName}" — rename via Saved drawer if you want.`)
        console.log('[handleSavePreset] saved with id:', r.id)
      } else {
        const reason = (r && r.reason) || 'unknown — see DevTools console'
        showToast(`Save failed: ${reason}`)
        console.error('[handleSavePreset] save returned not-ok:', r)
      }
    } catch (err) {
      showToast(`Save error: ${err.message || err}`)
    }
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
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #302c1e' }}>
            {[['ai', '✨ AI'], ['manual', '✍️ Manual']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  background: mode === m ? '#e8c820' : '#242118',
                  color: mode === m ? '#0f0e0b' : '#bfb8a8',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={newChat}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ↺ New chat
          </button>
          <button
            onClick={() => setPresetsOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#242118', color: '#bfb8a8', border: '1px solid #302c1e' }}
          >
            ⎘ Saved
          </button>
        </div>
      </div>

      {!libraryReady ? (
        <div className="flex flex-1 items-center justify-center" style={{ background: '#0f0e0b' }}>
          <div style={{ background: '#1a1813', border: '1px solid #302c1e', borderRadius: 12, padding: 28, maxWidth: 460, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 600, color: '#eae5dc', marginBottom: 8 }}>
              Tag library not downloaded
            </p>
            <p style={{ fontSize: 13, color: '#bfb8a8', marginBottom: 18, lineHeight: 1.5 }}>
              The Prompt Builder needs the local Danbooru tag library to ground the AI's choices. It's a one-time ~500 MB download and ~5 minute index.
            </p>
            <a
              href="#/settings"
              style={{
                display: 'inline-block',
                background: '#e8c820',
                color: '#0f0e0b',
                padding: '8px 16px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Go to Settings →
            </a>
          </div>
        </div>
      ) : (
        <>
          {!apiKeySet && (
            <div style={{ flexShrink: 0, padding: '10px 18px', background: 'rgba(232, 200, 32, 0.08)', borderBottom: '1px solid rgba(232, 200, 32, 0.3)' }}>
              <p style={{ fontSize: 12, color: '#e8c820' }}>
                ⚠ No DeepSeek API key set. <a href="#/settings" style={{ color: '#e8c820', textDecoration: 'underline' }}>Add one in Settings</a> to start generating prompts.
              </p>
            </div>
          )}

          <div className="flex flex-1 min-h-0">
            <div className="flex-shrink-0" style={{ width: '220px', background: '#0f0e0b', borderRight: '1px solid #302c1e' }}>
              <TagLibraryPanel onInsertTag={handleInsertTag} />
            </div>

            <div className="flex flex-col flex-1 min-w-0" style={{ background: '#0f0e0b' }}>
              {mode === 'ai' ? (
                <>
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
                </>
              ) : (
                <ManualPromptComposer
                  selectedLoras={selectedLorasArray}
                  onRemoveLora={removeLora}
                  insertTagRef={insertTagRef}
                />
              )}
            </div>

            <div className="flex-shrink-0" style={{ width: '270px', background: '#0f0e0b', borderLeft: '1px solid #302c1e' }}>
              <LoRAPicker
                selectedIds={selectedLoraIds}
                onToggle={toggleLora}
              />
            </div>
          </div>
        </>
      )}
      <SavedPresetsDrawer isOpen={presetsOpen} onClose={() => setPresetsOpen(false)} />
    </div>
  )
}
