// src/renderer/components/Sidebar.jsx
import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useInbox } from '../context/InboxContext.jsx'

const NAV_ITEMS = [
  { icon: '🏠', label: 'Dashboard', to: '/', end: true },
  { icon: '📥', label: 'Inbox',     to: '/inbox' },
  { icon: '🗂',  label: 'Main Gens', to: '/main-gens' },
  { icon: '🎛',  label: 'LoRAs',     to: '/loras' },
  { icon: '🧱',  label: 'Checkpoints', to: '/models' },
  { icon: '📝',  label: 'Extras',    to: '/extras' },
]

function NavItem({ icon, label, to, end, badge, isActive }) {
  return (
    <NavLink
      to={to}
      end={end}
      className="relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm select-none"
      style={{ transition: 'color 150ms' }}
    >
      {({ isActive: routerActive }) => {
        const active = routerActive
        return (
          <>
            {/* Sliding pill — rendered per-item so layoutId works across siblings */}
            {active && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg"
                style={{ background: '#2a2710' }}
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              />
            )}

            {/* Hover fill — only when not active */}
            {!active && (
              <span
                className="absolute inset-0 rounded-lg opacity-0 hover:opacity-100"
                style={{ background: '#242118', transition: 'opacity 150ms' }}
                aria-hidden
              />
            )}

            <span
              className="relative text-base leading-none z-10"
              style={{ color: active ? '#e8c820' : '#bfb8a8' }}
            >
              {icon}
            </span>

            <span
              className="relative flex-1 z-10 font-medium"
              style={{ color: active ? '#e8c820' : '#bfb8a8' }}
            >
              {label}
            </span>

            {badge > 0 && (
              <span
                className="relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none badge-pulse"
                style={{ background: '#e8c820', color: '#0f0e0b' }}
              >
                {badge}
              </span>
            )}
          </>
        )
      }}
    </NavLink>
  )
}

export default function Sidebar() {
  const { count } = useInbox()

  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full pt-4 pb-4 px-3"
      style={{ width: '200px', background: '#0f0e0b', borderRight: '1px solid #302c1e' }}
    >
      {/* Wordmark */}
      <div className="px-3 mb-6">
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: '#eae5dc' }}
        >
          Forge
        </h1>
        <p className="text-xs mt-0.5" style={{ color: '#635c48', fontFamily: 'Figtree, sans-serif' }}>
          Generation Manager
        </p>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV_ITEMS.map(item => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
            end={item.end}
            badge={item.to === '/inbox' ? count : undefined}
          />
        ))}
      </nav>

      {/* Settings pinned to bottom */}
      <div className="mt-auto" style={{ borderTop: '1px solid #302c1e' }}>
        <div className="pt-3">
          <NavItem icon="⚙️" label="Settings" to="/settings" />
        </div>
      </div>

      <style>{`
        @keyframes badge-pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.15); }
        }
        .badge-pulse {
          animation: badge-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </aside>
  )
}
