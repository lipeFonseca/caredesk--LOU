import { findThemeByPrimaryColor, applyThemePalette as applyLight } from '@/theme/visualThemes'

const BLACK = '#0c0c10'

export function applyThemePaletteWithMode(primaryColor, dark = false) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)

  if (!dark) {
    applyLight(primaryColor)
    return
  }

  const theme = findThemeByPrimaryColor(primaryColor) ?? createDarkBase(primaryColor)
  const palette = buildDarkPalette(theme)

  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, hexToRgbTriplet(value))
  }
}

function createDarkBase(primaryColor) {
  const primary = normalizeHex(primaryColor) || '#6366f1'
  return {
    primary,
    secondary: mix(primary, '#5f8779', 0.45),
    tertiary:  mix(primary, '#c3a26e', 0.55),
    neutral:   mix('#1f2937', primary, 0.15),
  }
}

function buildDarkPalette(theme) {
  const primary   = normalizeHex(theme.primary)
  const secondary = normalizeHex(theme.secondary)
  const tertiary  = normalizeHex(theme.tertiary)
  const neutral   = normalizeHex(theme.neutral)

  const bg          = mix(neutral, BLACK, 0.80)
  const surface     = mix(neutral, BLACK, 0.68)
  const surfLow     = mix(neutral, BLACK, 0.75)
  const surfHigh    = mix(neutral, BLACK, 0.60)
  const surfHighest = mix(neutral, BLACK, 0.52)
  const surfLowest  = mix(neutral, BLACK, 0.84)
  const surfCont    = mix(neutral, BLACK, 0.64)
  const surfDim     = mix(neutral, BLACK, 0.85)
  const onSurf      = mix('#f1f2fb', primary, 0.04)
  const onSurfVar   = mix('#c6cadb', neutral, 0.14)
  const primL = mix(primary,   '#ffffff', 0.44)
  const secL  = mix(secondary, '#ffffff', 0.44)
  const terL  = mix(tertiary,  '#ffffff', 0.44)

  return {
    '--color-primary-50':  mix(primary, BLACK, 0.66),
    '--color-primary-100': mix(primary, BLACK, 0.50),
    '--color-primary-500': primL,
    '--color-primary-600': primL,
    '--color-primary-700': mix(primary, '#ffffff', 0.22),
    '--color-primary-container':        mix(primary, BLACK, 0.46),
    '--color-on-primary':               '#ffffff',
    '--color-on-primary-container':     mix(primary, '#ffffff', 0.88),
    '--color-primary-fixed':            mix(primary, BLACK, 0.32),
    '--color-primary-fixed-dim':        mix(primary, BLACK, 0.48),
    '--color-on-primary-fixed':         mix(primary, '#ffffff', 0.96),
    '--color-on-primary-fixed-variant': mix(primary, '#ffffff', 0.76),
    '--color-inverse-primary':          mix(primary, BLACK, 0.16),
    '--color-secondary':                   secL,
    '--color-on-secondary':                mix(secondary, BLACK, 0.72),
    '--color-secondary-container':         mix(secondary, BLACK, 0.46),
    '--color-on-secondary-container':      mix(secondary, '#ffffff', 0.88),
    '--color-secondary-fixed':             mix(secondary, BLACK, 0.32),
    '--color-secondary-fixed-dim':         mix(secondary, BLACK, 0.48),
    '--color-on-secondary-fixed':          mix(secondary, '#ffffff', 0.96),
    '--color-on-secondary-fixed-variant':  mix(secondary, '#ffffff', 0.72),
    '--color-tertiary':                   terL,
    '--color-on-tertiary':                mix(tertiary, BLACK, 0.72),
    '--color-tertiary-container':         mix(tertiary, BLACK, 0.46),
    '--color-on-tertiary-container':      mix(tertiary, '#ffffff', 0.88),
    '--color-tertiary-fixed':             mix(tertiary, BLACK, 0.32),
    '--color-tertiary-fixed-dim':         mix(tertiary, BLACK, 0.48),
    '--color-on-tertiary-fixed':          mix(tertiary, '#ffffff', 0.96),
    '--color-on-tertiary-fixed-variant':  mix(tertiary, '#ffffff', 0.72),
    '--color-surface-default':            surface,
    '--color-surface-subtle':             bg,
    '--color-surface-border':             mix(neutral, '#ffffff', 0.16),
    '--color-surface-muted':              mix(neutral, '#ffffff', 0.40),
    '--color-background':                 bg,
    '--color-on-background':              onSurf,
    '--color-on-surface':                 onSurf,
    '--color-on-surface-variant':         onSurfVar,
    '--color-surface-dim':                surfDim,
    '--color-surface-bright':             mix(surface, '#ffffff', 0.06),
    '--color-surface-tint':               primL,
    '--color-surface-variant':            mix(surface, primary, 0.12),
    '--color-surface-container':          surfCont,
    '--color-surface-container-low':      surfLow,
    '--color-surface-container-high':     surfHigh,
    '--color-surface-container-highest':  surfHighest,
    '--color-surface-container-lowest':   surfLowest,
    '--color-outline':                    mix(neutral, '#ffffff', 0.46),
    '--color-outline-variant':            mix(neutral, '#ffffff', 0.20),
    '--color-inverse-surface':            mix(onSurf, '#ffffff', 0.86),
    '--color-inverse-on-surface':         bg,
  }
}

function normalizeHex(hex) {
  if (typeof hex !== 'string') return null
  const v = hex.trim()
  return /^#([0-9a-f]{6})$/i.test(v) ? v : null
}

function mix(baseHex, targetHex, amount) {
  const [r1, g1, b1] = hexToRgb(baseHex)
  const [r2, g2, b2] = hexToRgb(targetHex)
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * amount),
    Math.round(g1 + (g2 - g1) * amount),
    Math.round(b1 + (b2 - b1) * amount)
  )
}

function hexToRgb(hex) {
  const n = normalizeHex(hex)
  if (!n) return [0, 0, 0]
  return [parseInt(n.slice(1,3),16), parseInt(n.slice(3,5),16), parseInt(n.slice(5,7),16)]
}

function rgbToHex(r, g, b) {
  return `#${[r,g,b].map(v => v.toString(16).padStart(2,'0')).join('')}`
}

function hexToRgbTriplet(hex) {
  const [r, g, b] = hexToRgb(hex)
  return `${r} ${g} ${b}`
}
