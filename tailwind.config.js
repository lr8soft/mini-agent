/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a0f',
          panel: '#12121a',
          card: '#1a1a26',
          hover: '#22222e'
        },
        border: {
          DEFAULT: '#2a2a3a',
          hover: '#3a3a4a'
        },
        text: {
          primary: '#e0e0e8',
          secondary: '#9090a0',
          muted: '#606070'
        },
        accent: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          glow: '#a78bfa'
        },
        ok: '#22c55e',
        warn: '#f59e0b',
        err: '#ef4444'
      },
      fontFamily: {
        mono: ['Consolas', 'Monaco', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
