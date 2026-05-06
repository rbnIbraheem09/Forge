import React, { useState } from 'react'
import { motion } from 'framer-motion'

const STEPS = [
  {
    title: 'Welcome to Forge',
    body: 'Your personal ComfyUI generation journal. Log images, track LoRAs and checkpoints, and review your creative progress — all without moving a single file.',
    icon: '⚒️',
  },
  {
    title: 'Set Your Folders',
    body: 'Tell Forge where to find your ComfyUI output and model files. It will auto-detect new images and import your LoRAs and checkpoints.',
    icon: '📁',
  },
  {
    title: "You're All Set",
    body: 'Images that appear in your output folder will land in the Inbox. Assign them to a Main Gen to start your first generation journal.',
    icon: '🚀',
  },
]

export default function OnboardingModal({ onDone, folders, onBrowse }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl p-8 w-full max-w-md shadow-2xl"
        style={{ background: '#1a1813', border: '1px solid #302c1e' }}
      >
        {/* Steps indicator */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ background: i <= step ? '#e8c820' : '#302c1e' }} />
          ))}
        </div>

        <div className="text-5xl mb-4">{current.icon}</div>
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: '#eae5dc', fontFamily: 'Bricolage Grotesque, sans-serif' }}
        >
          {current.title}
        </h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: '#bfb8a8' }}>{current.body}</p>

        {step === 1 && (
          <div className="flex flex-col gap-3 mb-6">
            {[
              { key: 'output_folder', label: 'Output Folder', required: true },
              { key: 'checkpoints_folder', label: 'Checkpoints Folder', required: false },
              { key: 'loras_folder', label: 'LoRAs Folder', required: false },
            ].map(({ key, label, required }) => (
              <div key={key}>
                <p className="text-xs mb-1.5" style={{ color: '#635c48' }}>
                  {label} {required && <span style={{ color: '#e87068' }}>*</span>}
                </p>
                <div className="flex gap-2">
                  <div
                    className="flex-1 rounded-lg px-3 py-2 text-xs truncate"
                    style={{ background: '#0f0e0b', border: '1px solid #302c1e', color: folders[key] ? '#eae5dc' : '#635c48' }}
                  >
                    {folders[key] || 'Not set'}
                  </div>
                  <button
                    onClick={() => onBrowse(key)}
                    className="px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: '#e8c820', color: '#0f0e0b' }}
                  >
                    Browse
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: '#242118', color: '#635c48' }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => isLast ? onDone() : setStep(s => s + 1)}
            disabled={step === 1 && !folders.output_folder}
            className="px-5 py-2 rounded-lg text-sm font-medium"
            style={{
              background: '#e8c820',
              color: '#0f0e0b',
              opacity: step === 1 && !folders.output_folder ? 0.5 : 1,
            }}
          >
            {isLast ? 'Open Forge' : 'Continue'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
