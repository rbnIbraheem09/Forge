// src/renderer/App.jsx
import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inbox from './pages/Inbox.jsx'
import MainGensList from './pages/MainGensList.jsx'
import MainGenDetail from './pages/MainGenDetail.jsx'
import LoRAsList from './pages/LoRAsList.jsx'
import LoRADetail from './pages/LoRADetail.jsx'
import ModelsList from './pages/ModelsList.jsx'
import ModelDetail from './pages/ModelDetail.jsx'
import PromptBuilder from './pages/PromptBuilder.jsx'
import Settings from './pages/Settings.jsx'
import SearchOverlay from './components/SearchOverlay.jsx'
import OnboardingModal from './pages/OnboardingModal.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { InboxProvider } from './context/InboxContext.jsx'
import { ImageViewerProvider } from './context/ImageViewerContext.jsx'

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [onboardingFolders, setOnboardingFolders] = useState({ output_folder: null, checkpoints_folder: null, loras_folder: null })

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    window.forge.settings.getAll().then((all) => {
      if (!all.output_folder && !all.onboarding_done) {
        setOnboardingFolders(f => ({ ...f, ...all }))
        setOnboarding(true)
      }
    })
  }, [])

  const handleOnboardingBrowse = async (key) => {
    const path = await window.forge.settings.openFolderPicker()
    if (!path) return
    await window.forge.settings.set(key, path)
    setOnboardingFolders(f => ({ ...f, [key]: path }))
    if (key === 'output_folder') window.forge.scanner.restart()
  }

  const finishOnboarding = async () => {
    await window.forge.settings.set('onboarding_done', 'true')
    setOnboarding(false)
  }

  return (
    <HashRouter>
      <ToastProvider>
        <InboxProvider>
         <ImageViewerProvider>
          <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: '#0e0e0f' }}>
            {/* Invisible drag region — grab anywhere here to move the window.
                Sits behind the traffic lights (system UI; still clickable). */}
            <div style={{ height: 28, flexShrink: 0, WebkitAppRegion: 'drag' }} />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/inbox" element={<Inbox />} />
                  <Route path="/main-gens" element={<MainGensList />} />
                  <Route path="/main-gens/:id" element={<MainGenDetail />} />
                  <Route path="/loras" element={<LoRAsList />} />
                  <Route path="/loras/:id" element={<LoRADetail />} />
                  <Route path="/models" element={<ModelsList />} />
                  <Route path="/models/:id" element={<ModelDetail />} />
                  <Route path="/prompt" element={<PromptBuilder />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </main>
            </div>
            <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
            {onboarding && (
              <OnboardingModal
                onDone={finishOnboarding}
                folders={onboardingFolders}
                onBrowse={handleOnboardingBrowse}
              />
            )}
          </div>
         </ImageViewerProvider>
        </InboxProvider>
      </ToastProvider>
    </HashRouter>
  )
}
