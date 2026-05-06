import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
      <div className="text-3xl font-bold mb-1" style={{ color: accent || '#7c6ff7' }}>{value}</div>
      <div className="text-xs" style={{ color: '#555' }}>{label}</div>
    </div>
  )
}

function BarChart({ items, maxCount, onClickItem, accent }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 cursor-pointer" onClick={() => onClickItem(item.id)}>
          <span className="text-xs truncate" style={{ color: '#7c6ff7', width: '120px' }}>{item.name}</span>
          <div className="flex-1 rounded-full h-1.5" style={{ background: '#2a2a2e' }}>
            <div
              className="h-full rounded-full"
              style={{ background: accent || '#7c6ff7', width: `${(item.usage_count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-xs w-6 text-right" style={{ color: '#555' }}>{item.usage_count}</span>
        </div>
      ))}
    </div>
  )
}

function getTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [topLoras, setTopLoras] = useState([])
  const [topCheckpoints, setTopCheckpoints] = useState([])
  const [pinnedMgs, setPinnedMgs] = useState([])
  const [starredIters, setStarredIters] = useState([])
  const [recentMgs, setRecentMgs] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      window.forge.dashboard.stats(),
      window.forge.dashboard.topLoras(),
      window.forge.dashboard.topCheckpoints(),
      window.forge.dashboard.pinnedMainGens(),
      window.forge.dashboard.starredIterations(),
      window.forge.dashboard.recentMainGens(),
    ]).then(([s, tl, tc, pm, si, rm]) => {
      setStats(s); setTopLoras(tl); setTopCheckpoints(tc)
      setPinnedMgs(pm); setStarredIters(si); setRecentMgs(rm)
    })
  }, [])

  if (!stats) return <div className="flex items-center justify-center h-full" style={{ color: '#555' }}>Loading…</div>

  const maxLora = Math.max(...topLoras.map(l => l.usage_count), 1)
  const maxCkpt = Math.max(...topCheckpoints.map(c => c.usage_count), 1)

  if (stats.mainGensCount === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3" style={{ background: '#0e0e0f' }}>
        <div className="text-3xl">🏠</div>
        <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>Welcome to Forge</p>
        <p className="text-xs text-center" style={{ color: '#555', maxWidth: '280px' }}>
          Set your ComfyUI output folder in Settings, then assign images from the Inbox to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: '#0e0e0f' }}>
      <h1 className="text-xl font-semibold mb-6" style={{ color: '#f0f0f0' }}>Dashboard</h1>

      {/* Stats row */}
      <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <StatCard label="Main Gens" value={stats.mainGensCount} />
        <StatCard label="Iterations" value={stats.iterationsCount} />
        <StatCard label="LoRAs" value={stats.lorasCount} />
        <StatCard label="Checkpoints" value={stats.checkpointsCount} />
        <StatCard label="⭐ Starred" value={stats.starredCount} accent="#f5a623" />
      </div>

      {/* Insights */}
      {(topLoras.length > 0 || topCheckpoints.length > 0) && (
        <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {topLoras.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
              <p className="text-xs uppercase tracking-wider mb-4" style={{ color: '#555' }}>Most Used LoRAs</p>
              <BarChart items={topLoras} maxCount={maxLora} onClickItem={(id) => navigate(`/loras/${id}`)} />
            </div>
          )}
          {topCheckpoints.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}>
              <p className="text-xs uppercase tracking-wider mb-4" style={{ color: '#555' }}>Most Used Checkpoints</p>
              <BarChart items={topCheckpoints} maxCount={maxCkpt} onClickItem={(id) => navigate(`/models/${id}`)} accent="#4a9a6e" />
            </div>
          )}
        </div>
      )}

      {/* Pinned Main Gens */}
      {pinnedMgs.length > 0 && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>📌 Pinned Main Gens</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {pinnedMgs.map(mg => (
              <div
                key={mg.id}
                onClick={() => navigate(`/main-gens/${mg.id}`)}
                className="flex-shrink-0 rounded-xl overflow-hidden cursor-pointer"
                style={{ width: '120px', background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <div className="h-16" style={{ background: mg.hero_image_path ? `url(forge://${mg.hero_image_path}) center/cover` : mg.hero_color }} />
                <div className="p-2">
                  <p className="text-xs font-medium truncate" style={{ color: '#f0f0f0' }}>{mg.title}</p>
                  <p className="text-[10px]" style={{ color: '#555' }}>{mg.iteration_count} iters</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Starred Iterations */}
      {starredIters.length > 0 && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>⭐ Starred Iterations</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {starredIters.map(iter => (
              <div
                key={iter.id}
                onClick={() => navigate(`/main-gens/${iter.main_gen_id}`)}
                className="flex-shrink-0 relative rounded-lg overflow-hidden cursor-pointer"
                style={{ width: '80px', aspectRatio: '0.85', background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <img src={`forge://${iter.image_path}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.7))' }} />
                <div className="absolute bottom-1 left-1 right-1">
                  <p className="text-[9px] leading-tight" style={{ color: '#aaa' }}>{iter.main_gen_title} #{iter.iteration_number}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Main Gens */}
      {recentMgs.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#555' }}>Recent Main Gens</p>
          <div className="flex flex-col gap-2">
            {recentMgs.map(mg => (
              <div
                key={mg.id}
                onClick={() => navigate(`/main-gens/${mg.id}`)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                style={{ background: '#1c1c1e', border: '1px solid #2a2a2e' }}
              >
                <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: mg.hero_image_path ? `url(forge://${mg.hero_image_path}) center/cover` : mg.hero_color }} />
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>{mg.title}</p>
                  <p className="text-xs" style={{ color: '#555' }}>{mg.iteration_count} iterations · {getTimeAgo(mg.updated_at)}</p>
                </div>
                <span style={{ color: '#555' }}>→</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
