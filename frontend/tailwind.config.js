/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Cor primária — será sobrescrita pelo valor do banco via CSS var
        primary: {
          50:  'rgb(var(--color-primary-50)  / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
        },
        // Urgência de follow-up
        urgency: {
          ok:      '#10b981', // verde
          soon:    '#f59e0b', // âmbar
          due:     '#f97316', // laranja
          overdue: '#ef4444', // vermelho
        },
        // Superfícies neutras premium
        surface: {
          DEFAULT: '#ffffff',
          subtle:  '#f8fafc',
          border:  '#e2e8f0',
          muted:   '#94a3b8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl':  '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card:  '0 1px 3px 0 rgb(0 0 0 / .06), 0 1px 2px -1px rgb(0 0 0 / .06)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / .10)',
        modal: '0 20px 60px -10px rgb(0 0 0 / .25)',
      },
      animation: {
        'fade-in':   'fadeIn .2s ease-out',
        'slide-up':  'slideUp .3s cubic-bezier(.16,1,.3,1)',
        'pulse-dot': 'pulseDot 2s infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:  { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: .4 } },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
