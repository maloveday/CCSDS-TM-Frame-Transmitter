/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          900: '#080c14',
          800: '#0d1320',
          700: '#111827',
          600: '#1a2438',
          500: '#1f2d44',
        },
        accent: {
          blue: '#38bdf8',
          green: '#4ade80',
          amber: '#fbbf24',
          red: '#f87171',
          purple: '#c084fc',
          cyan: '#22d3ee',
          orange: '#fb923c',
        },
      },
    },
  },
  plugins: [],
}
