import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext.jsx'
import AddExampleMenu from './AddExampleMenu.jsx'
import GalleryPickerOverlay from './GalleryPickerOverlay.jsx'

// Props:
//   images: Array<{ id, image_path, source, sort_order }>
//   entityKind: 'lora' | 'checkpoint'
//   entityId: number
//   entityName: string
//   onChanged: () => void   // called after add/remove to refresh parent state
//
// Slice 2 version: uniform 2-col grid + simple + add pill below.
// Slice 3 will replace this with the smart 1/2/3/4 pattern + lightbox.
export default function ExamplesGrid({ images, entityKind, entityId, entityName, onChanged }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const showToast = useToast()
  const max = 4
  const namespace = entityKind === 'lora' ? 'loras' : 'models'

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
    } catch (err) {
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
    } catch {
      showToast("Couldn't save image.")
    }
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

  const remove = async (exampleId) => {
    try {
      await window.forge[namespace].removeExampleImage(exampleId)
      onChanged()
    } catch {
      showToast("Couldn't remove.")
    }
  }

  return (
    <div className="relative">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <AnimatePresence>
          {images.map(img => (
            <motion.div
              key={img.id}
              className="relative rounded-lg overflow-hidden group"
              style={{ aspectRatio: '1', background: '#0f0e0b', border: '1px solid #302c1e' }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.16,1,0.3,1] } }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
            >
              <img src={`forge://thumb${img.image_path}`} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => remove(img.id)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                style={{ background: 'rgba(15,14,11,0.85)', color: '#e87068', border: '1px solid #302c1e' }}
                title="Remove"
              >×</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {images.length < max && (
        <div className="relative mt-3">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-full py-3 rounded-lg text-sm"
            style={{
              background: 'transparent',
              border: '1px dashed #302c1e',
              color: '#635c48',
            }}
          >
            + Add example{images.length === 0 ? ' — Paste · Choose file · Pick from gallery' : ''}
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
