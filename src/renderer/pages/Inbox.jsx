import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'
import { useInbox } from '../context/InboxContext.jsx'

export default function Inbox() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [mainGens, setMainGens] = useState([])
  const [loading, setLoading] = useState(true)
  const [newGenTitle, setNewGenTitle] = useState('')
  const [showNewGenInput, setShowNewGenInput] = useState(false)
  const showToast = useToast()
  const { setCount } = useInbox()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const [inboxItems, gens] = await Promise.all([
      window.forge.inbox.list(),
      window.forge.mainGens.list(),
    ])
    setItems(inboxItems)
    setMainGens(gens)
    setCount(inboxItems.length)
    setLoading(false)
  }, [setCount])

  useEffect(() => { load() }, [load])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(items.map(i => i.id)))
  }

  const assign = async (args) => {
    const itemIds = [...selected]
    const result = await window.forge.inbox.assign({ itemIds, ...args })
    showToast(`Assigned ${itemIds.length} image${itemIds.length > 1 ? 's' : ''}.`)
    setSelected(new Set())
    await load()
    navigate(`/main-gens/${result.mainGenId}`)
  }

  const dismiss = async () => {
    await window.forge.inbox.dismiss({ ids: [...selected] })
    showToast('Dismissed.')
    setSelected(new Set())
    await load()
  }

  if (loading) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-2xl">📥</div>
        <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>Inbox is empty</p>
        <p className="text-xs" style={{ color: '#555' }}>New images from your ComfyUI output folder will appear here.</p>
      </div>
    )
  }

  const selectedArr = [...selected]

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#f0f0f0' }}>Inbox</h1>
          <p className="text-xs mt-0.5" style={{ color: '#555' }}>{items.length} new image{items.length !== 1 ? 's' : ''} detected</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ background: '#2a2a2e', color: '#888' }}
          >
            Select All
          </button>
          <button
            onClick={() => {}}
            disabled={selectedArr.length === 0}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity"
            style={{
              background: '#7c6ff7',
              color: '#fff',
              opacity: selectedArr.length === 0 ? 0.4 : 1,
              cursor: selectedArr.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Assign Selected ({selectedArr.length})
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {items.map(item => {
          const meta = item.extracted_metadata ? JSON.parse(item.extracted_metadata) : {}
          const isSelected = selected.has(item.id)
          return (
            <div
              key={item.id}
              onClick={() => toggleSelect(item.id)}
              className="relative cursor-pointer rounded-xl overflow-hidden"
              style={{
                border: `2px solid ${isSelected ? '#7c6ff7' : '#2a2a2e'}`,
                aspectRatio: '1',
              }}
            >
              <img
                src={`forge://${item.image_path}`}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }}
              />
              {/* Checkbox */}
              <div
                className="absolute top-2 left-2 w-5 h-5 rounded flex items-center justify-center"
                style={{
                  background: isSelected ? '#7c6ff7' : 'rgba(0,0,0,0.5)',
                  border: isSelected ? 'none' : '1.5px solid #555',
                }}
              >
                {isSelected && <span className="text-white text-xs">✓</span>}
              </div>
              {/* Meta overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                {meta.seed && <p className="text-[10px]" style={{ color: '#ccc' }}>seed {meta.seed}</p>}
                {meta.steps && <p className="text-[10px]" style={{ color: '#aaa' }}>{meta.steps} steps</p>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Assign panel */}
      {selectedArr.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#1c1c1e', border: '1px solid #7c6ff7' }}
        >
          <p className="text-sm font-medium mb-3" style={{ color: '#f0f0f0' }}>
            Assign {selectedArr.length} image{selectedArr.length !== 1 ? 's' : ''} to:
          </p>
          <div className="flex flex-wrap gap-2">
            {showNewGenInput ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newGenTitle.trim()) assign({ newTitle: newGenTitle })
                }}
              >
                <input
                  autoFocus
                  value={newGenTitle}
                  onChange={(e) => setNewGenTitle(e.target.value)}
                  placeholder="New Main Gen title…"
                  className="rounded-lg px-3 py-1.5 text-sm outline-none"
                  style={{ background: '#0e0e0f', border: '1px solid #7c6ff7', color: '#f0f0f0', width: '200px' }}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: '#7c6ff7', color: '#fff' }}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGenInput(false)}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: '#2a2a2e', color: '#888' }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowNewGenInput(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: '#7c6ff7', color: '#fff' }}
              >
                + New Main Gen
              </button>
            )}
            {mainGens.map(mg => (
              <button
                key={mg.id}
                onClick={() => assign({ mainGenId: mg.id })}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: '#2a2a2e', color: '#aaa' }}
              >
                {mg.title} <span style={{ color: '#555' }}>{mg.iteration_count} iters</span>
              </button>
            ))}
            <button
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg text-sm ml-auto"
              style={{ background: '#1a1a1c', color: '#555', border: '1px solid #2a2a2e' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
