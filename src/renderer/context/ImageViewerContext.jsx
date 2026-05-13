import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import ImageViewerOverlay from '../components/ImageViewerOverlay.jsx'

const ImageViewerContext = createContext(null)

// Payload shape:
//   { imagePath: string,
//     iterationId?: number,    — when present, sidebar shows full iteration metadata
//     mainGenId?: number,      — used for the "Open Main Gen →" button
//     onChange?: () => void }  — called after star toggle / metadata edits so the parent can refetch
export function ImageViewerProvider({ children }) {
  const [payload, setPayload] = useState(null)

  const open = useCallback((p) => setPayload(p), [])
  const close = useCallback(() => setPayload(null), [])

  useEffect(() => {
    if (!payload) return
    const handler = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [payload, close])

  return (
    <ImageViewerContext.Provider value={{ open, close }}>
      {children}
      <ImageViewerOverlay payload={payload} onClose={close} />
    </ImageViewerContext.Provider>
  )
}

export function useImageViewer() {
  const ctx = useContext(ImageViewerContext)
  if (!ctx) throw new Error('useImageViewer must be used within ImageViewerProvider')
  return ctx
}
