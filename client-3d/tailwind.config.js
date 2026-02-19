/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        toxic: {
          green: '#39ff14',
          dark: '#1a3d1a',
          glow: 'rgba(57, 255, 20, 0.5)',
        },
        rave: {
          pink: '#ff0080',
          cyan: '#00ffff',
          magenta: '#ff00ff',
        },
        grunge: {
          black: '#0a0a0a',
          dark: '#1a1a1a',
          muted: '#333333',
        },
      },
      keyframes: {
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'drip': {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.6' },
          '50%': { transform: 'translateY(15px)', opacity: '0.2' },
        },
        'pulse-glow': {
          '0%, 100%': { filter: 'drop-shadow(0 0 8px rgba(57, 255, 20, 0.5))' },
          '50%': { filter: 'drop-shadow(0 0 16px rgba(57, 255, 20, 0.8))' },
        },
        'bob': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
      animation: {
        'fade-in-down': 'fade-in-down 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'drip': 'drip 2s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'bob': 'bob 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
