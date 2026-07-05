const DEFAULT_TAGLINE = 'Acompanhamento pos-cirurgico com presenca e previsibilidade.'
const DEFAULT_HERO_TITLE = 'Cuidado premium em cada etapa da jornada do paciente.'
const DEFAULT_HERO_SUBTITLE = 'Organize contatos, acompanhe protocolos e conduza o retorno com uma interface mais humana, elegante e clara.'

export function getBranding(settings = {}) {
  const clinicName = settings.clinic_name?.trim() || 'CareDesk'
  const tagline = settings.clinic_tagline?.trim() || DEFAULT_TAGLINE
  const heroTitle = settings.hero_title?.trim() || DEFAULT_HERO_TITLE
  const heroSubtitle = settings.hero_subtitle?.trim() || DEFAULT_HERO_SUBTITLE
  const logoUrl = settings.logo_url?.trim() || buildInitialsLogo(clinicName)
  const faviconUrl = settings.favicon_url?.trim() || logoUrl

  return {
    clinicName,
    tagline,
    heroTitle,
    heroSubtitle,
    logoUrl,
    faviconUrl,
    backgroundImageUrl: settings.background_image_url?.trim() || '',
  }
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
