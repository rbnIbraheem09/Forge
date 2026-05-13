import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import { useImageViewer } from '../context/ImageViewerContext.jsx'
import AddExampleMenu from './AddExampleMenu.jsx'
import GalleryPickerOverlay from './GalleryPickerOverlay.jsx'

export default function ExamplesGrid({ images, entityKind, entityId, entityName, onChanged }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deletingIds, setDeletingIds] = useState(() => new Set())
  const { open: openViewer } = useImageViewer()
  const showToast = useToast()
  const max = 4
  const namespace = entityKind === 'lora' ? 'loras' : 'models'

  // Optimistically hide tiles being deleted so AnimatePresence can play the
  // exit animation before the parent's onChanged() refetch lands.
  const visibleImages = images.filter(img => !deletingIds.has(img.id))

  const addPaste = async () => {
    try {
      const items = await navigator.clipboard.read()
      let blob = null
      for (const item of items) {
        const pngType = item.types.find(t => t === 'image/png')
        if (pngType) { blob = await item.getType(pngType); break }
      }
      if (!blob) { showToast('No image in clipboard.'); return }
      const buf = new Uint8Array(await blob.arrayBuffer())
      await window.forge[namespace].addExampleImage({ source: 'paste', entityId, pngBuffer: buf })
      showToast('Pasted.')
      onChanged()
    } catch {
      showToast("Couldn't paste — clipboard access denied?")
    }
  }

  const addFile = async () => {
    const sourcePath = await window.forge[namespace].pickExampleImageFile()
    if (!sourcePath) return
    try {
      await window.forge[namespace].addExampleImage({ source: 'file', entityId, sourcePath })
      showToast('Added.')
      onChanged()
    } catch { showToast("Couldn't save image.") }
  }

  const addGallery = async (iterationId) => {
    try {
      await window.forge[namespace].addExampleImage({ source: 'gallery', entityId, iterationId })
      showToast('Added.')
      onChanged()
    } catch {
      showToast("Couldn't add from gallery.")
    }
  }

  const remove = async (exampleId, e) => {
    e.stopPropagation()
    setDeletingIds(prev => {
      const next = new Set(prev)
      next.add(exampleId)
      return next
    })
    try {
      await window.forge[namespace].removeExampleImage(exampleId)
      onChanged()
    } catch {
      showToast("Couldn't remove.")
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(exampleId)
        return next
      })
    }
  }

  const renderTile = (img, extraStyle = {}) => (
    <motion.div
      key={img.id}
      className="relative rounded-lg overflow-hidden group cursor-pointer"
      style={{ background: '#0f0e0b', border: '1px solid #302c1e', ...extraStyle }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.16,1,0.3,1] } }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      onClick={() => openViewer({ imagePath: img.image_path })}
    >
      <img src={`forge://thumb${img.image_path}`} alt="" className="w-full h-full object-cover" />
      <button
        onClick={(e) => remove(img.id, e)}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        style={{ background: 'rgba(15,14,11,0.85)', color: '#e87068', border: '1px solid #302c1e' }}
        title="Remove"
      >×</button>
    </motion.div>
  )

  const count = visibleImages.length

  return (
    <div className="relative">
      <AnimatePresence>
        {count === 1 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
            {renderTile(visibleImages[0], { aspectRatio: '16 / 10' })}
          </div>
        )}

        {count === 2 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {visibleImages.map(img => renderTile(img, { aspectRatio: '1' }))}
          </div>
        )}

        {count === 3 && (
          <div className="flex flex-col gap-3">
            {renderTile(visibleImages[0], { aspectRatio: '2 / 1' })}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {renderTile(visibleImages[1], { aspectRatio: '1' })}
              {renderTile(visibleImages[2], { aspectRatio: '1' })}
            </div>
          </div>
        )}

        {count === 4 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {visibleImages.map(img => renderTile(img, { aspectRatio: '1' }))}
          </div>
        )}
      </AnimatePresence>

      {count < max && (
        <div className="relative" style={{ marginTop: count === 0 ? 0 : 12 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-full py-4 rounded-lg text-sm transition-colors hover:border-[#635c48]"
            style={{
              background: 'transparent',
              border: '1px dashed #302c1e',
              color: '#635c48',
              minHeight: count === 0 ? 200 : 'auto',
            }}
          >
            + Add example{count === 0 ? ' — Paste · Choose file · Pick from gallery' : ''}
          </button>
          <AddExampleMenu
            isOpen={menuOpen}
            anchor="left"
            onClose={() => setMenuOpen(false)}
            onPaste={addPaste}
            onPickFile={addFile}
            onPickGallery={() => setPickerOpen(true)}
          />
        </div>
      )}

      <GalleryPickerOverlay
        isOpen={pickerOpen}
        entityKind={entityKind}
        entityId={entityId}
        entityName={entityName}
        onPick={addGallery}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
