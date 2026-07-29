/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        midnight: {
          950: '#05060a',
          900: '#0a0d16',
          800: '#121627',
          700: '#1c2138',
        },
        blood: {
          500: '#8b1e2b',
          400: '#b8283a',
        },
        moonlight: {
          300: '#cbd5f5',
          200: '#e6ecff',
        },
        embergold: {
          400: '#d4af37',
          300: '#e8cf6e',
        },
      },
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
        arabic: ['"Noto Kufi Arabic"', 'sans-serif'],
      },
      backdropBlur: {
        glass: '18px',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        glow: '0 0 24px rgba(212, 175, 55, 0.35)',
      },
      keyframes: {
        'moon-rise': {
          '0%': { transform: 'translateY(40px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'sun-rise': {
          '0%': { transform: 'translateY(-40px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'moon-rise': 'moon-rise 1.2s ease-out forwards',
        'sun-rise': 'sun-rise 1.2s ease-out forwards',
      },
    },
  },
  plugins: [],
};
