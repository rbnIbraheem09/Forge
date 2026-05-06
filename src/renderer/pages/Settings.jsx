import React, { useState, useEffect, useCallback } from 'react'

const FOLDER_SETTINGS = [
  {
    key: 'output_folder',
    label: 'ComfyUI Output Folder',
    description: 'Where ComfyUI saves your generated images.',
  },
  {
    key: 'checkpoints_folder',
    label: 'Checkpoints Folder',
    description: 'Folder containing your .safetensors / .ckpt checkpoint models.',
  },
  {
    key: 'loras_folder',
    label: 'LoRAs Folder',
    description: 'Folder containing your LoRA model files.',
  },
]

function FolderRow({ label, description, value, onBrowse, onClear }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
    >
      <div className="mb-3">
        <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>
          {label}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#888' }}>
          {description}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value || ''}
          placeholder="Not set"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none truncate"
          style={{
            background: '#0e0e0f',
            border: '1px solid #2a2a2e',
            color: value ? '#f0f0f0' : '#555',
          }}
        />
        <button
          onClick={onBrowse}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-100"
          style={{
            background: '#7c6ff7',
            color: '#fff',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#6b5fe6')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#7c6ff7')}
        >
          Browse…
        </button>
        {value && (
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-100"
            style={{
              background: '#2a2a2e',
              color: '#888',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f0f0f0')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const [folders, setFolders] = useState({
    output_folder: null,
    checkpoints_folder: null,
    loras_folder: null,
  })
  const [toast, setToast] = useState(null)

  useEffect(() => {
    window.forge.settings.getAll().then((all) => {
      setFolders((prev) => ({ ...prev, ...all }))
    })
  }, [])

  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const handleBrowse = useCallback(
    async (key) => {
      const path = await window.forge.settings.openFolderPicker()
      if (!path) return
      await window.forge.settings.set(key, path)
      setFolders((prev) => ({ ...prev, [key]: path }))
      showToast('Folder saved.')
    },
    [showToast]
  )

  const handleClear = useCallback(
    async (key) => {
      await window.forge.settings.set(key, null)
      setFolders((prev) => ({ ...prev, [key]: null }))
      showToast('Folder cleared.')
    },
    [showToast]
  )

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0e0e0f' }}>
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: '#f0f0f0' }}>
            Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>
            Configure your folder paths. Forge never moves or copies your files.
          </p>
        </div>

        {/* Folder rows */}
        <div className="flex flex-col gap-4">
          {FOLDER_SETTINGS.map(({ key, label, description }) => (
            <FolderRow
              key={key}
              label={label}
              description={description}
              value={folders[key]}
              onBrowse={() => handleBrowse(key)}
              onClear={() => handleClear(key)}
            />
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg"
          style={{
            background: '#7c6ff7',
            color: '#fff',
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
