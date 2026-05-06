/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/renderer/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
      },
      colors: {
        forge: {
          bg:         '#0f0e0b',
          surface:    '#1a1813',
          elevated:   '#242118',
          border:     '#302c1e',
          muted:      '#635c48',
          text:       '#bfb8a8',
          contrast:   '#eae5dc',
          yellow:     '#e8c820',
          'yellow-dim': '#2a2710',
          blue:       '#7aa0e8',
          'blue-dim': '#101828',
          sage:       '#7daa88',
          'sage-dim': '#112018',
          red:        '#e87068',
          'red-dim':  '#2a1010',
          star:       '#f0c840',
        },
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up':  'fade-up 0.26s cubic-bezier(0.16,1,0.3,1) forwards',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.16,1,0.3,1) forwards',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.16,1,0.3,1) forwards',
      },
    },
  },
  plugins: [],
}
