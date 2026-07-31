import { normalizeHex, mix, hexToRgbTriplet } from './colorUtils'

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
    hero: '#1a2a3a',
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
    hero: '#1e281e',
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
    hero: '#2a241a',
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
    hero: '#2d1f1b',
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
    hero: '#1f1d26',
    swatches: ['#8f80a8', '#7f968e', '#c3a07d'],
  },
  {
    id: 'baia-profunda',
    name: 'Baia Profunda',
    description: 'Azul marinho vivido com contraste nautico, para uma presenca marcante e confiavel — a Serenidade Costeira em tom mais afirmativo.',
    primary: '#1c6fa8',
    secondary: '#2f9e8a',
    tertiary: '#e0a83e',
    surface: '#eef5f9',
    neutral: '#1f2f3d',
    hero: '#0e2a3a',
    swatches: ['#1c6fa8', '#2f9e8a', '#e0a83e'],
  },
  {
    id: 'esmeralda-vital',
    name: 'Esmeralda Vital',
    description: 'Verde esmeralda vivido, energia de crescimento e vitalidade sem perder a sobriedade clinica — o Jardim Terapeutico em tom mais vivo.',
    primary: '#2f9469',
    secondary: '#1f6b4c',
    tertiary: '#d9a94a',
    surface: '#eef7f1',
    neutral: '#1e2e24',
    hero: '#12241b',
    swatches: ['#2f9469', '#1f6b4c', '#d9a94a'],
  },
  {
    id: 'coral-vibrante',
    name: 'Coral Vibrante',
    description: 'Terracota levado ao coral: quente, vivo, presente — para uma identidade que acolhe sem ser discreta.',
    primary: '#d9603f',
    secondary: '#7a9463',
    tertiary: '#e0975a',
    surface: '#fbf0ea',
    neutral: '#3a241c',
    hero: '#331c14',
    swatches: ['#d9603f', '#7a9463', '#e0975a'],
  },
  {
    id: 'ametista',
    name: 'Ametista',
    description: 'Violeta profundo e mineral, refinado e confiante — a Lavanda Mineral em tom mais afirmativo.',
    primary: '#7d4f9e',
    secondary: '#5f8a80',
    tertiary: '#d6a34e',
    surface: '#f6f0f9',
    neutral: '#2c2333',
    hero: '#1f1729',
    swatches: ['#7d4f9e', '#5f8a80', '#d6a34e'],
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

    // Hero do Dashboard e sidebar tinham cor fixa em hex, herdada de antes do
    // seletor de tema existir — trocar de tema nunca mudava essas duas areas,
    // as mais visiveis da tela (2026-07-30). Primeira correcao derivava o tom
    // escuro matematicamente do `secondary`, mas os 5 temas usam um verde/salvia
    // parecido de proposito ali, entao a diferenca entre temas ficava sutil
    // demais. `theme.hero` e curado a mao por tema (2026-07-31, ver VISUAL_THEMES
    // acima) — cada tema tem um tom claramente diferente do vizinho. O fallback
    // matematico so entra pra cor customizada fora dos 5 presets.
    '--color-hero': theme.hero ? normalizeHex(theme.hero) : mix(secondary, '#0c1a15', 0.72),
    '--color-hero-label': mix(tertiary, '#ffffff', 0.35),
    // Texto de maior peso sobre o hero/sidebar (nome da clinica, item de menu
    // ativo) — tom claro do `primary`, nao do `tertiary`: da pra ter as duas
    // camadas de acento (rotulo dourado + nome/selecao na cor que realmente
    // distingue o tema) sem uma competir com a outra.
    '--color-hero-strong': mix(primary, '#ffffff', 0.55),
  }
}

