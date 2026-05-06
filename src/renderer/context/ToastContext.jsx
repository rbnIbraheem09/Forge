// src/renderer/context/ToastContext.jsx
import React, { createContext, useContext, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toastVariant } from '../lib/motion.js'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2400)
  }, [])

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse gap-2 items-center pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              variants={toastVariant}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg pointer-events-auto"
              style={{
                background: '#1a1813',
                border: '1px solid #302c1e',
                color: '#eae5dc',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                fontFamily: 'Figtree, sans-serif',
              }}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
