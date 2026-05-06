import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

function MainGenCard({ mg, onDelete, onTogglePin }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const timeAgo = getTimeAgo(mg.updated_at)

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer relative group"
      style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
      onClick={() => navigate(`/main-gens/${mg.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hero */}
      <div className="h-32 relative">
        {mg.hero_image_path ? (
          <img src={`forge://${mg.hero_image_path}`} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: mg.hero_color || '#2a2a2e' }} />
        )}
        {hovered && (
          <div
            className="absolute top-2 right-2 flex gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onTogglePin(mg)}
              className="w-6 h-6 rounded flex items-center justify-center text-xs"
              style={{ background: 'rgba(0,0,0,0.7)' }}
              title={mg.pinned ? 'Unpin' : 'Pin'}
            >
              {mg.pinned ? '📌' : '📍'}
            </button>
            <button
              onClick={() => onDelete(mg)}
              className="w-6 h-6 rounded flex items-center justify-center text-xs"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#ff6b6b' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>{mg.title}</p>
        <p className="text-xs mt-0.5" style={{ color: '#555' }}>
          {mg.iteration_count} iteration{mg.iteration_count !== 1 ? 's' : ''} · {timeAgo}
        </p>
      </div>
    </div>
  )
}

function getTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MainGensList() {
  const [allGens, setAllGens] = useState([])
  const [search, setSearch] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const showToast = useToast()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const gens = await window.forge.mainGens.list()
    setAllGens(gens)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = allGens.filter(mg => mg.title.toLowerCase().includes(search.toLowerCase()))
  const pinned = filtered.filter(mg => mg.pinned)
  const rest = filtered.filter(mg => !mg.pinned)

  const createNew = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const mg = await window.forge.mainGens.create(newTitle)
    setCreating(false)
    setNewTitle('')
    navigate(`/main-gens/${mg.id}`)
  }

  const handleDelete = async () => {
    await window.forge.mainGens.delete(toDelete.id)
    showToast(`Deleted "${toDelete.title}".`)
    setToDelete(null)
    load()
  }

  const togglePin = async (mg) => {
    await window.forge.mainGens.update({ id: mg.id, pinned: !mg.pinned })
    showToast(mg.pinned ? 'Unpinned.' : 'Pinned.')
    load()
  }

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold flex-1" style={{ color: '#f0f0f0' }}>Main Gens</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: '#1c1c1e', border: '1px solid #2a2a2e', color: '#f0f0f0', width: '180px' }}
        />
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: '#7c6ff7', color: '#fff' }}
        >
          + New
        </button>
      </div>

      {creating && (
        <form onSubmit={createNew} className="flex gap-2 mb-6">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Main Gen title…"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: '#1c1c1e', border: '1px solid #7c6ff7', color: '#f0f0f0' }}
          />
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#7c6ff7', color: '#fff' }}>Create</button>
          <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 rounded-lg text-sm" style={{ background: '#2a2a2e', color: '#888' }}>Cancel</button>
        </form>
      )}

      {allGens.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">🗂</div>
          <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>No Main Gens yet</p>
          <p className="text-xs" style={{ color: '#555' }}>Assign images from the Inbox to create your first Main Gen.</p>
        </div>
      )}

      {pinned.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: '#555' }}>📌 Pinned</p>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {pinned.map(mg => (
              <MainGenCard key={mg.id} mg={mg} onDelete={setToDelete} onTogglePin={togglePin} />
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          {pinned.length > 0 && <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: '#555' }}>All</p>}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {rest.map(mg => (
              <MainGenCard key={mg.id} mg={mg} onDelete={setToDelete} onTogglePin={togglePin} />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        title={`Delete "${toDelete?.title}"?`}
        message="This will permanently delete all iterations inside. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
