/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,jsx,ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#0e0e0f',
          sidebar: '#141415',
          surface: '#1c1c1e',
          border: '#2a2a2e',
          text: '#f0f0f0',
          muted: '#888888',
          accent: '#7c6ff7',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
