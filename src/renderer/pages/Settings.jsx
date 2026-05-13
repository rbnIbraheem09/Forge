import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const FOLDER_SETTINGS = [
  { key: 'output_folder', label: 'ComfyUI Output Folder', description: 'Where ComfyUI saves your generated images.' },
  { key: 'checkpoints_folder', label: 'Checkpoints Folder', description: 'Folder containing your checkpoint models.' },
  { key: 'loras_folder', label: 'LoRAs Folder', description: 'Folder containing your LoRA model files.' },
]

function FolderRow({ label, description, value, onBrowse, onClear }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
      <div className="mb-3">
        <p className="text-sm font-medium" style={{ color: '#eae5dc' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: '#bfb8a8' }}>{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly value={value || ''}
          placeholder="Not set"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none truncate"
          style={{ background: '#0f0e0b', border: '1px solid #302c1e', color: value ? '#eae5dc' : '#635c48' }}
        />
        <button
          onClick={onBrowse}
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: '#e8c820', color: '#0f0e0b' }}
        >Browse…</button>
        {value && (
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: '#242118', color: '#635c48' }}
          >Clear</button>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const [folders, setFolders] = useState({ output_folder: null, checkpoints_folder: null, loras_folder: null })
  const [gallerySize, setGallerySize] = useState('M')
  const [autoScan, setAutoScan] = useState(true)
  const [scanning, setScanning] = useState({ loras: false, checkpoints: false })
  const [libStatus, setLibStatus] = useState(null)
  const [libProgress, setLibProgress] = useState(null)
  const [libRefreshing, setLibRefreshing] = useState(false)
  const [libDeleting, setLibDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const showToast = useToast()

  useEffect(() => {
    window.forge.settings.getAll().then((all) => {
      setFolders(prev => ({ ...prev, ...all }))
      if (all.gallery_size) setGallerySize(all.gallery_size)
      if (all.auto_scan !== undefined) setAutoScan(all.auto_scan !== 'false')
    })
  }, [])

  useEffect(() => {
    window.forge.prompt.libraryStatus().then(setLibStatus).catch(() => {})
    const handler = (payload) => setLibProgress(payload)
    window.forge.on('prompt:library-progress', handler)
    return () => window.forge.off('prompt:library-progress', handler)
  }, [])

  const handleBrowse = useCallback(async (key) => {
    const path = await window.forge.settings.openFolderPicker()
    if (!path) return
    try {
      await window.forge.settings.set(key, path)
      setFolders(prev => ({ ...prev, [key]: path }))
      if (key === 'output_folder') window.forge.scanner.restart()
      if (key === 'loras_folder') { const r = await window.forge.loras.scan(); showToast(`LoRAs scanned: +${r.added} new, ${r.offlined} offline.`); return }
      if (key === 'checkpoints_folder') { const r = await window.forge.models.scan(); showToast(`Checkpoints scanned: +${r.added} new, ${r.offlined} offline.`); return }
      showToast('Folder saved.')
    } catch (err) {
      showToast('Error saving folder.')
    }
  }, [showToast])

  const handleClear = useCallback(async (key) => {
    await window.forge.settings.set(key, null)
    setFolders(prev => ({ ...prev, [key]: null }))
    showToast('Folder cleared.')
  }, [showToast])

  const rescanLoras = async () => {
    setScanning(s => ({ ...s, loras: true }))
    try {
      const r = await window.forge.loras.scan()
      showToast(`LoRAs: +${r.added} new, ${r.offlined} offline.`)
    } catch {
      showToast('LoRA scan failed.')
    } finally {
      setScanning(s => ({ ...s, loras: false }))
    }
  }

  const rescanCheckpoints = async () => {
    setScanning(s => ({ ...s, checkpoints: true }))
    try {
      const r = await window.forge.models.scan()
      showToast(`Checkpoints: +${r.added} new, ${r.offlined} offline.`)
    } catch {
      showToast('Checkpoint scan failed.')
    } finally {
      setScanning(s => ({ ...s, checkpoints: false }))
    }
  }

  const setGalleryDefault = async (size) => {
    setGallerySize(size)
    await window.forge.settings.set('gallery_size', size)
    showToast(`Default gallery size set to ${size}.`)
  }

  const refreshTagLibrary = async () => {
    setLibRefreshing(true)
    setLibProgress(null)
    try {
      const result = await window.forge.prompt.libraryRefresh()
      if (result.ok) {
        showToast(`Tag library refreshed: ${result.inserted} tags indexed.`)
      } else {
        showToast(`Refresh failed: ${result.reason}`)
      }
      const fresh = await window.forge.prompt.libraryStatus()
      setLibStatus(fresh)
    } catch (err) {
      showToast(`Refresh error: ${err.message || err}`)
    } finally {
      setLibRefreshing(false)
      setLibProgress(null)
    }
  }

  const deleteTagLibrary = async () => {
    setConfirmDelete(false)
    setLibDeleting(true)
    try {
      const result = await window.forge.prompt.libraryDelete()
      if (result.ok) {
        showToast(`Tag library deleted (${result.deleted_rows.toLocaleString()} tags removed).`)
      } else {
        showToast(`Delete failed: ${result.reason}`)
      }
      const fresh = await window.forge.prompt.libraryStatus()
      setLibStatus(fresh)
    } catch (err) {
      showToast(`Delete error: ${err.message || err}`)
    } finally {
      setLibDeleting(false)
    }
  }

  const toggleAutoScan = async () => {
    const next = !autoScan
    setAutoScan(next)
    await window.forge.settings.set('auto_scan', String(next))
    if (next) window.forge.scanner.restart()
    showToast(`Auto-scan ${next ? 'enabled' : 'disabled'}.`)
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0f0e0b' }}>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1
            className="text-2xl font-semibold"
            style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
          >
            Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: '#bfb8a8' }}>Configure your folder paths. Forge never moves or copies your files.</p>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          {FOLDER_SETTINGS.map(({ key, label, description }) => (
            <FolderRow
              key={key} label={label} description={description}
              value={folders[key]}
              onBrowse={() => handleBrowse(key)}
              onClear={() => handleClear(key)}
            />
          ))}
        </div>

        {/* Rescan buttons */}
        <div className="rounded-xl p-5 mb-4" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#eae5dc' }}>Rescan Libraries</p>
          <p className="text-xs mb-4" style={{ color: '#bfb8a8' }}>Re-reads your LoRA and Checkpoint folders to pick up new or removed files.</p>
          <div className="flex gap-3">
            <button
              onClick={rescanLoras}
              disabled={scanning.loras}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ background: '#242118', color: '#bfb8a8' }}
              onMouseEnter={e => e.currentTarget.style.background = '#302c1e'}
              onMouseLeave={e => e.currentTarget.style.background = '#242118'}
            >
              {scanning.loras ? 'Scanning…' : '↻ Rescan LoRAs'}
            </button>
            <button
              onClick={rescanCheckpoints}
              disabled={scanning.checkpoints}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ background: '#242118', color: '#bfb8a8' }}
              onMouseEnter={e => e.currentTarget.style.background = '#302c1e'}
              onMouseLeave={e => e.currentTarget.style.background = '#242118'}
            >
              {scanning.checkpoints ? 'Scanning…' : '↻ Rescan Checkpoints'}
            </button>
          </div>
        </div>

        {/* Gallery size */}
        <div className="rounded-xl p-5 mb-4" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#eae5dc' }}>Default Gallery Size</p>
          <p className="text-xs mb-4" style={{ color: '#bfb8a8' }}>Default thumbnail size in the iteration gallery.</p>
          <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: '1px solid #302c1e' }}>
            {['S', 'M', 'L'].map(s => (
              <button
                key={s}
                onClick={() => setGalleryDefault(s)}
                className="px-5 py-2 text-sm font-medium"
                style={{
                  background: gallerySize === s ? '#e8c820' : '#1a1813',
                  color: gallerySize === s ? '#0f0e0b' : '#635c48',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-scan toggle */}
        <div className="rounded-xl p-5" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: '#eae5dc' }}>Auto-scan Output Folder</p>
              <p className="text-xs mt-0.5" style={{ color: '#bfb8a8' }}>Automatically detect new images in your ComfyUI output folder.</p>
            </div>
            <button
              onClick={toggleAutoScan}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{ background: autoScan ? '#e8c820' : '#302c1e' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                style={{ background: '#fff', transform: autoScan ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        </div>

        {/* Prompt Builder — Tag Library */}
        <div className="rounded-xl p-5 mt-4" style={{ background: '#1a1813', border: '1px solid #302c1e' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#eae5dc' }}>Prompt Builder — Tag Library</p>
          <p className="text-xs mb-4" style={{ color: '#bfb8a8' }}>
            Local Danbooru tag library used by the AI prompt builder. Includes ~150k tags with semantic embeddings.
          </p>

          {libStatus && libStatus.count > 0 ? (
            <div className="flex items-center justify-between mb-3 text-xs" style={{ color: '#bfb8a8' }}>
              <div>
                <span style={{ color: '#7daa88', fontWeight: 600 }}>{libStatus.count.toLocaleString()}</span>
                {' tags · '}
                {libStatus.indexed ? (
                  <span style={{ color: '#7daa88' }}>indexed</span>
                ) : (
                  <span style={{ color: '#e8c820' }}>
                    {(libStatus.indexed_count ?? 0).toLocaleString()} / {libStatus.count.toLocaleString()} indexed
                  </span>
                )}
                {libStatus.version && ' · last refreshed ' + new Date(libStatus.version).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <p className="text-xs mb-3" style={{ color: '#e8c820' }}>Not yet downloaded.</p>
          )}

          {libRefreshing && libProgress && (
            <div className="mb-3">
              <p className="text-xs mb-1" style={{ color: '#635c48' }}>
                {libProgress.phase === 'download' && `Downloading… ${(libProgress.current / 1_000_000).toFixed(1)} MB`}
                {libProgress.phase === 'parse' && `Parsing… ${libProgress.current.toLocaleString()} tags`}
                {libProgress.phase === 'embed' && `Indexing embeddings… ${libProgress.current.toLocaleString()} / ${libProgress.total.toLocaleString()}`}
                {libProgress.phase === 'done' && 'Done.'}
                {libProgress.phase === 'error' && `Error: ${libProgress.message}`}
              </p>
              {libProgress.total > 0 && libProgress.phase !== 'done' && libProgress.phase !== 'error' && (
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#302c1e' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: '#e8c820',
                      width: `${Math.min(100, (libProgress.current / libProgress.total) * 100)}%`,
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={refreshTagLibrary}
              disabled={libRefreshing || libDeleting}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{
                background: (libRefreshing || libDeleting) ? '#302c1e' : '#242118',
                color: (libRefreshing || libDeleting) ? '#635c48' : '#bfb8a8',
                cursor: (libRefreshing || libDeleting) ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (!libRefreshing && !libDeleting) e.currentTarget.style.background = '#302c1e' }}
              onMouseLeave={e => { if (!libRefreshing && !libDeleting) e.currentTarget.style.background = '#242118' }}
            >
              {libRefreshing ? 'Refreshing…' : libStatus && libStatus.count > 0 ? '↻ Refresh tag library' : '⇩ Download tag library'}
            </button>

            {libStatus && libStatus.count > 0 && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={libRefreshing || libDeleting}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: (libRefreshing || libDeleting) ? '#1a0d0d' : '#2a1010',
                  color: (libRefreshing || libDeleting) ? '#5a3030' : '#e87068',
                  cursor: (libRefreshing || libDeleting) ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={e => { if (!libRefreshing && !libDeleting) e.currentTarget.style.background = '#3a1818' }}
                onMouseLeave={e => { if (!libRefreshing && !libDeleting) e.currentTarget.style.background = '#2a1010' }}
              >
                {libDeleting ? 'Deleting…' : '🗑 Delete tag library'}
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete tag library?"
        message="This removes ~500 MB of indexed tags and embeddings from disk. You can re-download anytime."
        onConfirm={deleteTagLibrary}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
