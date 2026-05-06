import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fadeUp, stagger } from '../lib/motion.js'

function MainGenCard({ mg, onDelete, onTogglePin }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const timeAgo = getTimeAgo(mg.updated_at)

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl overflow-hidden cursor-pointer relative group"
      style={{ background: '#1a1813', border: '1px solid #302c1e' }}
      onClick={() => navigate(`/main-gens/${mg.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Hero */}
      <div className="h-32 relative">
        {mg.hero_image_path ? (
          <img src={`forge://${mg.hero_image_path}`} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: mg.hero_color || '#302c1e' }} />
        )}
        {hovered && (
          <div
            className="absolute top-2 right-2 flex gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onTogglePin(mg)}
              className="w-6 h-6 rounded flex items-center justify-center text-xs"
              style={{ background: 'rgba(0,0,0,0.7)', color: mg.pinned ? '#e8c820' : '#bfb8a8' }}
              title={mg.pinned ? 'Unpin' : 'Pin'}
            >
              {mg.pinned ? '📌' : '📍'}
            </button>
            <button
              onClick={() => onDelete(mg)}
              className="w-6 h-6 rounded flex items-center justify-center text-xs"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#e87068' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div className="p-3">
        <p
          className="text-sm font-medium truncate"
          style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
        >
          {mg.title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#635c48' }}>
          {mg.iteration_count} iteration{mg.iteration_count !== 1 ? 's' : ''} · {timeAgo}
        </p>
      </div>
    </motion.div>
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
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0f0e0b' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1
          className="text-xl font-semibold flex-1"
          style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
        >
          Main Gens
        </h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{
            background: '#1a1813',
            border: '1px solid #302c1e',
            color: '#eae5dc',
            width: '180px',
            '--placeholder-color': '#bfb8a8',
          }}
          onFocus={(e) => { e.target.style.borderColor = '#302c1e'; e.target.style.boxShadow = 'none' }}
          onBlur={(e) => { e.target.style.borderColor = '#302c1e' }}
        />
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: '#e8c820', color: '#0f0e0b' }}
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
            style={{ background: '#1a1813', border: '1px solid #e8c820', color: '#eae5dc' }}
          />
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#e8c820', color: '#0f0e0b' }}>Create</button>
          <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 rounded-lg text-sm" style={{ background: '#302c1e', color: '#bfb8a8' }}>Cancel</button>
        </form>
      )}

      {allGens.length === 0 && !creating && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#635c48' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🗂</div>
          <p style={{ fontFamily: 'Bricolage Grotesque, sans-serif', color: '#eae5dc', fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>No Main Gens yet</p>
          <p style={{ fontSize: '13px' }}>Assign images from the Inbox to create your first Main Gen.</p>
        </div>
      )}

      {pinned.length > 0 && (
        <div className="mb-6">
          <p
            className="text-[10px] uppercase tracking-wider mb-3"
            style={{ color: '#635c48', letterSpacing: '0.08em' }}
          >
            📌 Pinned
          </p>
          <motion.div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {pinned.map(mg => (
              <MainGenCard key={mg.id} mg={mg} onDelete={setToDelete} onTogglePin={togglePin} />
            ))}
          </motion.div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          {pinned.length > 0 && (
            <p
              className="text-[10px] uppercase tracking-wider mb-3"
              style={{ color: '#635c48', letterSpacing: '0.08em' }}
            >
              All
            </p>
          )}
          <motion.div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {rest.map(mg => (
              <MainGenCard key={mg.id} mg={mg} onDelete={setToDelete} onTogglePin={togglePin} />
            ))}

            {/* + New Main Gen dashed card */}
            <motion.div
              variants={fadeUp}
              className="rounded-xl cursor-pointer flex items-center justify-center h-32"
              style={{
                border: '2px dashed #302c1e',
                color: '#635c48',
                transition: 'border-color 0.18s, color 0.18s',
              }}
              onClick={() => setCreating(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#e8c82050'
                e.currentTarget.style.color = '#e8c820'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#302c1e'
                e.currentTarget.style.color = '#635c48'
              }}
            >
              <span className="text-sm font-medium">+ New Main Gen</span>
            </motion.div>
          </motion.div>
        </div>
      )}

      {/* Show dashed card even when rest is empty but there are pinned items */}
      {rest.length === 0 && pinned.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="rounded-xl cursor-pointer flex items-center justify-center"
          style={{
            border: '2px dashed #302c1e',
            color: '#635c48',
            height: '128px',
            marginTop: '16px',
            transition: 'border-color 0.18s, color 0.18s',
          }}
          onClick={() => setCreating(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#e8c82050'
            e.currentTarget.style.color = '#e8c820'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#302c1e'
            e.currentTarget.style.color = '#635c48'
          }}
        >
          <span className="text-sm font-medium">+ New Main Gen</span>
        </motion.div>
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
