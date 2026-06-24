/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Cor primária dinâmica via CSS vars ────────────────
        primary: {
          DEFAULT: 'rgb(var(--color-primary-600) / <alpha-value>)',
          50:  'rgb(var(--color-primary-50)  / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
        },
        // ── Superfícies legadas ───────────────────────────────
        surface: {
          DEFAULT: '#f9f9ff',
          subtle:  '#f8fafc',
          border:  '#e2e8f0',
          muted:   '#94a3b8',
        },
        // ── MD3 color roles ───────────────────────────────────
        'on-primary':                  '#ffffff',
        'primary-container':           '#6063ee',
        'on-primary-container':        '#fffbff',
        'primary-fixed':               '#e1e0ff',
        'primary-fixed-dim':           '#c0c1ff',
        'on-primary-fixed':            '#07006c',
        'on-primary-fixed-variant':    '#2f2ebe',
        'inverse-primary':             '#c0c1ff',
        'secondary':                   '#006c49',
        'on-secondary':                '#ffffff',
        'secondary-container':         '#6cf8bb',
        'on-secondary-container':      '#00714d',
        'secondary-fixed':             '#6ffbbe',
        'secondary-fixed-dim':         '#4edea3',
        'on-secondary-fixed':          '#002113',
        'on-secondary-fixed-variant':  '#005236',
        'tertiary':                    '#825100',
        'on-tertiary':                 '#ffffff',
        'tertiary-container':          '#a36700',
        'on-tertiary-container':       '#fffbff',
        'tertiary-fixed':              '#ffddb8',
        'tertiary-fixed-dim':          '#ffb95f',
        'on-tertiary-fixed':           '#2a1700',
        'on-tertiary-fixed-variant':   '#653e00',
        'error':                       '#ba1a1a',
        'on-error':                    '#ffffff',
        'error-container':             '#ffdad6',
        'on-error-container':          '#93000a',
        'background':                  '#f9f9ff',
        'on-background':               '#111c2d',
        'on-surface':                  '#111c2d',
        'on-surface-variant':          '#464554',
        'surface-dim':                 '#cfdaf2',
        'surface-bright':              '#f9f9ff',
        'surface-tint':                '#494bd6',
        'surface-variant':             '#d8e3fb',
        'surface-container':           '#e7eeff',
        'surface-container-low':       '#f0f3ff',
        'surface-container-high':      '#dee8ff',
        'surface-container-highest':   '#d8e3fb',
        'surface-container-lowest':    '#ffffff',
        'outline':                     '#767586',
        'outline-variant':             '#c7c4d7',
        'inverse-surface':             '#263143',
        'inverse-on-surface':          '#ecf1ff',
        // ── Urgência ─────────────────────────────────────────
        urgency: {
          ok:      '#10b981',
          soon:    '#f59e0b',
          due:     '#f97316',
          overdue: '#ef4444',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        'label-md':          ['Inter', 'system-ui', 'sans-serif'],
        'label-sm':          ['Inter', 'system-ui', 'sans-serif'],
        'headline-sm':       ['Inter', 'system-ui', 'sans-serif'],
        'display-md':        ['Inter', 'system-ui', 'sans-serif'],
        'display-lg':        ['Inter', 'system-ui', 'sans-serif'],
        'display-lg-mobile': ['Inter', 'system-ui', 'sans-serif'],
        'body-md':           ['Inter', 'system-ui', 'sans-serif'],
        'body-lg':           ['Inter', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        'label-sm':   ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
        'label-md':   ['14px', { lineHeight: '20px', fontWeight: '500' }],
        'body-md':    ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-lg':    ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'headline-sm':['20px', { lineHeight: '28px', fontWeight: '600' }],
        'display-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '600' }],
      },

      spacing: {
        'container-padding': '24px',
        'card-gap':          '20px',
        'sidebar-width':     '260px',
      },

      borderRadius: {
        'xl':  '0.875rem',
        '2xl': '1.25rem',
      },

      boxShadow: {
        card:        '0 1px 3px 0 rgb(0 0 0 / .06), 0 1px 2px -1px rgb(0 0 0 / .06)',
        'card-hover':'0 4px 12px 0 rgb(0 0 0 / .10)',
        modal:       '0 20px 60px -10px rgb(0 0 0 / .25)',
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
