export const VISUAL_THEMES = [
  {
    id: 'serenidade-costeira',
    name: 'Serenidade Costeira',
    description: 'Azul suave com presença limpa e clinica, inspirado em ambientes calmos de recuperacao.',
    primary: '#5f8fba',
    secondary: '#7ba297',
    tertiary: '#c3a26e',
    surface: '#f2f6f7',
    neutral: '#31434f',
    swatches: ['#5f8fba', '#7ba297', '#c3a26e'],
  },
  {
    id: 'jardim-terapeutico',
    name: 'Jardim Terapeutico',
    description: 'Verde herbal acolhedor, com sensacao de cuidado continuo e bem-estar.',
    primary: '#789b6f',
    secondary: '#5f8779',
    tertiary: '#c2a46b',
    surface: '#f3f5ef',
    neutral: '#37453e',
    swatches: ['#789b6f', '#5f8779', '#c2a46b'],
  },
  {
    id: 'luz-dourada',
    name: 'Luz Dourada',
    description: 'Amarelo areia equilibrado, quente sem perder a leveza de uma clinica elegante.',
    primary: '#c6a15b',
    secondary: '#7b9a84',
    tertiary: '#a98568',
    surface: '#f7f3ea',
    neutral: '#4b4135',
    swatches: ['#c6a15b', '#7b9a84', '#a98568'],
  },
  {
    id: 'terracota-suave',
    name: 'Terracota Suave',
    description: 'Terracota acinzentada com tons terrosos tranquilos para um visual humano e sofisticado.',
    primary: '#b87963',
    secondary: '#8a9a73',
    tertiary: '#c79b76',
    surface: '#f7f1ed',
    neutral: '#4d3d35',
    swatches: ['#b87963', '#8a9a73', '#c79b76'],
  },
  {
    id: 'lavanda-mineral',
    name: 'Lavanda Mineral',
    description: 'Malva mineral discreto, relaxante e refinado para uma identidade delicada.',
    primary: '#8f80a8',
    secondary: '#7f968e',
    tertiary: '#c3a07d',
    surface: '#f4f1f7',
    neutral: '#433d4d',
    swatches: ['#8f80a8', '#7f968e', '#c3a07d'],
  },
]

export function findThemeByPrimaryColor(primaryColor) {
  const normalized = normalizeHex(primaryColor)
  if (!normalized) return null
  return VISUAL_THEMES.find((theme) => theme.primary.toLowerCase() === normalized.toLowerCase()) ?? null
}

export function applyThemePalette(primaryColor) {
  const root = document.documentElement
  const theme = findThemeByPrimaryColor(primaryColor) ?? createLegacyTheme(primaryColor)
  const palette = buildThemePalette(theme)

  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, hexToRgbTriplet(value))
  }
}

function createLegacyTheme(primaryColor) {
  const primary = normalizeHex(primaryColor) || '#6366f1'
  return {
    primary,
    secondary: mix(primary, '#5f8779', 0.45),
    tertiary: mix(primary, '#c3a26e', 0.55),
    surface: mix('#ffffff', primary, 0.08),
    neutral: mix('#1f2937', primary, 0.15),
  }
}

function buildThemePalette(theme) {
  const primary = normalizeHex(theme.primary)
  const secondary = normalizeHex(theme.secondary)
  const tertiary = normalizeHex(theme.tertiary)
  const surface = normalizeHex(theme.surface)
  const neutral = normalizeHex(theme.neutral)

  const background = mix(surface, '#ffffff', 0.45)
  const surfaceLow = mix(surface, '#ffffff', 0.52)
  const surfaceHigh = mix(surface, primary, 0.1)
  const surfaceHighest = mix(surface, primary, 0.16)
  const surfaceVariant = mix(surface, secondary, 0.14)
  const outline = mix(neutral, '#ffffff', 0.35)
  const outlineVariant = mix(surface, neutral, 0.18)
  const inverseSurface = mix(neutral, '#0f172a', 0.35)

  return {
    '--color-primary-50': mix(primary, '#ffffff', 0.85),
    '--color-primary-100': mix(primary, '#ffffff', 0.72),
    '--color-primary-500': mix(primary, '#0f172a', 0.04),
    '--color-primary-600': mix(primary, '#0f172a', 0.1),
    '--color-primary-700': mix(primary, '#0f172a', 0.2),

    '--color-surface-default': surface,
    '--color-surface-subtle': background,
    '--color-surface-border': outlineVariant,
    '--color-surface-muted': mix(outline, neutral, 0.25),

    '--color-secondary': mix(secondary, '#0f172a', 0.08),
    '--color-on-secondary': '#ffffff',
    '--color-secondary-container': mix(secondary, '#ffffff', 0.74),
    '--color-on-secondary-container': mix(secondary, '#0f172a', 0.38),
    '--color-secondary-fixed': mix(secondary, '#ffffff', 0.82),
    '--color-secondary-fixed-dim': mix(secondary, '#ffffff', 0.64),
    '--color-on-secondary-fixed': mix(secondary, '#0f172a', 0.55),
    '--color-on-secondary-fixed-variant': mix(secondary, '#0f172a', 0.28),

    '--color-tertiary': mix(tertiary, '#0f172a', 0.1),
    '--color-on-tertiary': '#ffffff',
    '--color-tertiary-container': mix(tertiary, '#ffffff', 0.72),
    '--color-on-tertiary-container': mix(tertiary, '#0f172a', 0.36),
    '--color-tertiary-fixed': mix(tertiary, '#ffffff', 0.82),
    '--color-tertiary-fixed-dim': mix(tertiary, '#ffffff', 0.62),
    '--color-on-tertiary-fixed': mix(tertiary, '#0f172a', 0.55),
    '--color-on-tertiary-fixed-variant': mix(tertiary, '#0f172a', 0.3),

    '--color-background': background,
    '--color-on-background': neutral,
    '--color-on-surface': neutral,
    '--color-on-surface-variant': mix(neutral, '#64748b', 0.25),
    '--color-surface-dim': mix(surface, neutral, 0.16),
    '--color-surface-bright': '#ffffff',
    '--color-surface-tint': primary,
    '--color-surface-variant': surfaceVariant,
    '--color-surface-container': mix(surface, primary, 0.06),
    '--color-surface-container-low': surfaceLow,
    '--color-surface-container-high': surfaceHigh,
    '--color-surface-container-highest': surfaceHighest,
    '--color-surface-container-lowest': '#ffffff',
    '--color-outline': outline,
    '--color-outline-variant': outlineVariant,
    '--color-inverse-surface': inverseSurface,
    '--color-inverse-on-surface': '#f8fafc',

    '--color-primary-container': mix(primary, '#ffffff', 0.72),
    '--color-on-primary': '#ffffff',
    '--color-on-primary-container': mix(primary, '#0f172a', 0.38),
    '--color-primary-fixed': mix(primary, '#ffffff', 0.82),
    '--color-primary-fixed-dim': mix(primary, '#ffffff', 0.66),
    '--color-on-primary-fixed': mix(primary, '#0f172a', 0.55),
    '--color-on-primary-fixed-variant': mix(primary, '#0f172a', 0.28),
    '--color-inverse-primary': mix(primary, '#ffffff', 0.56),
  }
}

function normalizeHex(hex) {
  if (typeof hex !== 'string') return null
  const value = hex.trim()
  return /^#([0-9a-f]{6})$/i.test(value) ? value : null
}

function mix(baseHex, targetHex, amount) {
  const [r1, g1, b1] = hexToRgb(baseHex)
  const [r2, g2, b2] = hexToRgb(targetHex)

  return rgbToHex(
    interpolate(r1, r2, amount),
    interpolate(g1, g2, amount),
    interpolate(b1, b2, amount)
  )
}

function interpolate(a, b, amount) {
  return Math.round(a + (b - a) * amount)
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex)
  if (!normalized) return [0, 0, 0]

  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ]
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgbTriplet(hex) {
  const [r, g, b] = hexToRgb(hex)
  return `${r} ${g} ${b}`
}
