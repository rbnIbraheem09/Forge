import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import GenerationsList from './pages/GenerationsList.jsx'
import ModelsList from './pages/ModelsList.jsx'
import LoRAsList from './pages/LoRAsList.jsx'
import Extras from './pages/Extras.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0e0e0f' }}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/generations" element={<GenerationsList />} />
            <Route path="/models" element={<ModelsList />} />
            <Route path="/loras" element={<LoRAsList />} />
            <Route path="/extras" element={<Extras />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
