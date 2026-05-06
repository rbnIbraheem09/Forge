// src/renderer/context/InboxContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react'

const InboxContext = createContext(0)

export function InboxProvider({ children }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    window.forge.inbox.count().then(setCount)
    const handler = ({ count: n }) => setCount(n)
    window.forge.on('inbox:new-item', handler)
    return () => window.forge.off('inbox:new-item', handler)
  }, [])

  return <InboxContext.Provider value={{ count, setCount }}>{children}</InboxContext.Provider>
}

export function useInbox() {
  return useContext(InboxContext)
}
