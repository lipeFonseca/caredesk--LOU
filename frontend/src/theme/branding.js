export const DEFAULT_TAGLINE = 'Acompanhamento pos-cirurgico com presenca e previsibilidade.'
export const DEFAULT_HERO_TITLE = 'Cuidado premium em cada etapa da jornada do paciente.'
export const DEFAULT_HERO_SUBTITLE = 'Organize contatos, acompanhe protocolos e conduza o retorno com uma interface mais humana, elegante e clara.'
export const DEFAULT_PRIMARY_COLOR = '#5f8fba'
export const DEFAULT_TIMEZONE = 'America/Fortaleza'
export const DEFAULT_LOGIN_BORDER_COLORS = ['#0dc1fd', '#d915ef', '#ff3f2ecc']
export const DEFAULT_LOGIN_BORDER_COLOR_BACK = '#00000000'
export const DEFAULT_LOGIN_BORDER_PRESET = 'default'
export const DEFAULT_LOGIN_BORDER_INTENSITY = 0.2
export const DEFAULT_LOGIN_BORDER_SPEED = 1
export const DEFAULT_LOGIN_BORDER_THICKNESS = 0.1
export const DEFAULT_LOGIN_BORDER_BLOOM = 0.25

export function normalizeBrandingSettings(settings = {}) {
  return {
    clinic_name: coerceString(settings.clinic_name),
    clinic_tagline: coerceString(settings.clinic_tagline),
    hero_title: coerceString(settings.hero_title),
    hero_subtitle: coerceString(settings.hero_subtitle),
    primary_color: sanitizePrimaryColor(settings.primary_color),
    logo_url: sanitizeBrandUrl(settings.logo_url),
    background_image_url: sanitizeBrandUrl(settings.background_image_url),
    login_image_url: sanitizeBrandUrl(settings.login_image_url),
    login_background_image_url: sanitizeBrandUrl(settings.login_background_image_url),
    favicon_url: sanitizeBrandUrl(settings.favicon_url),
    login_border_effect_enabled: coerceBooleanish(settings.login_border_effect_enabled),
    login_border_preset: normalizeLoginBorderPreset(settings.login_border_preset),
    login_border_color_1: sanitizeColorString(settings.login_border_color_1, DEFAULT_LOGIN_BORDER_COLORS[0]),
    login_border_color_2: sanitizeColorString(settings.login_border_color_2, DEFAULT_LOGIN_BORDER_COLORS[1]),
    login_border_color_3: sanitizeColorString(settings.login_border_color_3, DEFAULT_LOGIN_BORDER_COLORS[2]),
    login_border_color_back: sanitizeColorString(settings.login_border_color_back, DEFAULT_LOGIN_BORDER_COLOR_BACK),
    login_border_intensity: coerceNumber(settings.login_border_intensity, DEFAULT_LOGIN_BORDER_INTENSITY, 0, 1),
    login_border_speed: coerceNumber(settings.login_border_speed, DEFAULT_LOGIN_BORDER_SPEED, 0, 2),
    login_border_thickness: coerceNumber(settings.login_border_thickness, DEFAULT_LOGIN_BORDER_THICKNESS, 0, 1),
    login_border_bloom: coerceNumber(settings.login_border_bloom, DEFAULT_LOGIN_BORDER_BLOOM, 0, 1),
    timezone: coerceString(settings.timezone) || DEFAULT_TIMEZONE,
  }
}

export function getBranding(settings = {}) {
  const normalized = normalizeBrandingSettings(settings)
  const clinicName = normalized.clinic_name.trim() || 'CareDesk'
  const tagline = normalized.clinic_tagline.trim() || DEFAULT_TAGLINE
  const heroTitle = normalized.hero_title.trim() || DEFAULT_HERO_TITLE
  const heroSubtitle = normalized.hero_subtitle.trim() || DEFAULT_HERO_SUBTITLE
  const logoUrl = normalized.logo_url || buildInitialsLogo(clinicName)
  const faviconUrl = normalized.favicon_url || logoUrl
  const backgroundImageUrl = normalized.background_image_url
  const loginImageUrl = normalized.login_image_url
  const loginBackgroundImageUrl = normalized.login_background_image_url
  const loginBorderColors = [
    normalized.login_border_color_1,
    normalized.login_border_color_2,
    normalized.login_border_color_3,
  ].filter(Boolean)

  return {
    clinicName,
    tagline,
    heroTitle,
    heroSubtitle,
    logoUrl,
    faviconUrl,
    backgroundImageUrl,
    loginImageUrl,
    loginBackgroundImageUrl,
    loginBorder: {
      enabled: normalized.login_border_effect_enabled,
      preset: normalized.login_border_preset,
      colors: loginBorderColors.length ? loginBorderColors : [...DEFAULT_LOGIN_BORDER_COLORS],
      colorBack: normalized.login_border_color_back,
      intensity: normalized.login_border_intensity,
      speed: normalized.login_border_speed,
      thickness: normalized.login_border_thickness,
      bloom: normalized.login_border_bloom,
    },
  }
}

export function sanitizePrimaryColor(value) {
  return /^#([0-9a-f]{6})$/i.test(String(value || '').trim())
    ? String(value).trim()
    : DEFAULT_PRIMARY_COLOR
}

export function sanitizeBrandUrl(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''

  if (normalized.startsWith('data:image/')) return normalized

  try {
    const parsed = new URL(normalized)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

export function sanitizeColorString(value, fallback = '#000000') {
  const normalized = String(value || '').trim()
  return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)
    ? normalized
    : fallback
}

export function buildInitialsLogo(name = 'CareDesk') {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'C'

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#284b40" />
          <stop offset="100%" stop-color="#b88b4a" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="28" fill="#f4ecdc" />
      <rect x="8" y="8" width="80" height="80" rx="24" fill="url(#g)" opacity="0.12" />
      <circle cx="48" cy="48" r="30" fill="url(#g)" />
      <text x="48" y="56" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#fff8ef">${escapeXml(initials)}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function coerceString(value) {
  return typeof value === 'string' ? value : ''
}

function coerceBooleanish(value) {
  if (typeof value === 'boolean') return value
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function coerceNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function normalizeLoginBorderPreset(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ['default', 'circle', 'northern-lights', 'solid-line'].includes(normalized)
    ? normalized
    : DEFAULT_LOGIN_BORDER_PRESET
}
