// src/renderer/components/Sidebar.jsx
import React from 'react'
import { NavLink } from 'react-router-dom'
import { useInbox } from '../context/InboxContext.jsx'

function NavItem({ icon, label, to, end, badge }) {
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
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
          style={{ background: '#c0392b', color: '#fff' }}>
          {badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { count } = useInbox()

  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full pt-8 pb-4 px-3"
      style={{ width: '220px', background: '#141415', borderRight: '1px solid #2a2a2e' }}
    >
      <div className="px-3 mb-6">
        <h1 className="text-base font-semibold tracking-wide" style={{ color: '#f0f0f0' }}>Forge</h1>
        <p className="text-xs mt-0.5" style={{ color: '#555' }}>Generation Manager</p>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <NavItem icon="🏠" label="Dashboard" to="/" end />
        <NavItem icon="📥" label="Inbox" to="/inbox" badge={count} />
        <NavItem icon="🗂" label="Main Gens" to="/main-gens" />
        <NavItem icon="🎛" label="LoRAs" to="/loras" />
        <NavItem icon="🧱" label="Checkpoints" to="/models" />
        <NavItem icon="📝" label="Extras" to="/extras" />
      </nav>

      <div className="mt-auto">
        <div style={{ borderTop: '1px solid #2a2a2e' }} className="pt-3">
          <NavItem icon="⚙️" label="Settings" to="/settings" />
        </div>
      </div>
    </aside>
  )
}
