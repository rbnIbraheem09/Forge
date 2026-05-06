import React from 'react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { icon: '🏠', label: 'Dashboard', to: '/' },
  { icon: '🖼', label: 'Generations', to: '/generations' },
  { icon: '🧱', label: 'Checkpoints', to: '/models' },
  { icon: '🎛', label: 'LoRAs', to: '/loras' },
  { icon: '📝', label: 'Extras', to: '/extras' },
]

const settingsItem = { icon: '⚙️', label: 'Settings', to: '/settings' }

function NavItem({ icon, label, to, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-100 ${
          isActive
            ? 'bg-[#7c6ff7]/15 text-[#7c6ff7] font-medium'
            : 'text-[#888] hover:text-[#f0f0f0] hover:bg-white/5'
        }`
      }
    >
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full pt-8 pb-4 px-3"
      style={{
        width: '220px',
        background: '#141415',
        borderRight: '1px solid #2a2a2e',
      }}
    >
      {/* App name — pushed down to clear the traffic lights */}
      <div className="px-3 mb-6">
        <h1 className="text-base font-semibold tracking-wide" style={{ color: '#f0f0f0' }}>
          Forge
        </h1>
        <p className="text-xs mt-0.5" style={{ color: '#555' }}>
          Generation Manager
        </p>
      </div>

      {/* Top nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} end={item.to === '/'} />
        ))}
      </nav>

      {/* Settings pinned to bottom */}
      <div className="mt-auto">
        <div style={{ borderTop: '1px solid #2a2a2e' }} className="pt-3">
          <NavItem {...settingsItem} />
        </div>
      </div>
    </aside>
  )
}
