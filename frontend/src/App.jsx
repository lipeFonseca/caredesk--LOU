import { useEffect, useLayoutEffect } from 'react'
import Router from '@/router'
import { useSettingsStore, useAuthStore, useThemeStore } from '@/store'
import { api } from '@/services/api'
import { applyThemePaletteWithMode } from '@/darkPalette'
import { getBranding, normalizeBrandingSettings, sanitizePrimaryColor } from '@/theme/branding'

export default function App() {
  const setSettings    = useSettingsStore(s => s.setSettings)
  const markSettingsLoaded = useSettingsStore(s => s.markLoaded)
  const settings       = useSettingsStore(s => s.settings)
  const settingsLoaded = useSettingsStore(s => s.isLoaded)
  const primaryColor   = useSettingsStore(s => sanitizePrimaryColor(s.settings.primary_color))
  const isAuthenticated = useAuthStore(s => Boolean(s.agent))
  const { dark } = useThemeStore()

  // Aplica paleta (light ou dark) sempre que mudar tema ou modo
  useLayoutEffect(() => {
    applyThemePaletteWithMode(primaryColor, dark)
  }, [primaryColor, dark])

  useEffect(() => {
    const loadSettings = isAuthenticated ? api.settings.get : api.settings.getPublic

    loadSettings()
      .then(data => { if (data) setSettings(normalizeBrandingSettings(data)) })
      .catch(() => {
        markSettingsLoaded()
      })
  }, [isAuthenticated, markSettingsLoaded, setSettings])

  useEffect(() => {
    const branding = getBranding(settings)
    applyFavicon(branding.faviconUrl, branding.clinicName)
    document.title = branding.clinicName
    document.documentElement.style.setProperty('--brand-background-image', branding.backgroundImageUrl ? `url("${branding.backgroundImageUrl}")` : 'none')
  }, [settings])

  if (!settingsLoaded) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center">
        <div className="rounded-2xl border border-outline-variant bg-surface px-6 py-5 shadow-card">
          <p className="text-sm uppercase tracking-[0.24em] text-on-surface-variant">CareDesk</p>
          <p className="mt-2 text-lg text-on-surface">
            {isAuthenticated ? 'Carregando ambiente...' : 'Carregando identidade visual...'}
          </p>
        </div>
      </div>
    )
  }

  return <Router />
}

function applyFavicon(url, clinicName) {
  const normalizedUrl = typeof url === 'string' && url.trim()
    ? url.trim()
    : buildFallbackFavicon(clinicName)

  const links = [
    ensureHeadLink('icon'),
    ensureHeadLink('shortcut icon'),
    ensureHeadLink('apple-touch-icon'),
  ]
  const iconType = inferIconType(normalizedUrl)

  for (const link of links) {
    link.setAttribute('href', normalizedUrl)
    if (iconType) link.setAttribute('type', iconType)
    else link.removeAttribute('type')
  }
}

function ensureHeadLink(rel) {
  let link = document.querySelector(`link[rel='${rel}']`)
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', rel)
    document.head.appendChild(link)
  }
  return link
}

function inferIconType(url) {
  const normalized = String(url || '').toLowerCase()
  if (normalized.startsWith('data:image/svg+xml')) return 'image/svg+xml'
  if (normalized.startsWith('data:image/png')) return 'image/png'
  if (normalized.startsWith('data:image/jpeg')) return 'image/jpeg'
  if (normalized.startsWith('data:image/webp')) return 'image/webp'
  if (normalized.startsWith('data:image/x-icon') || normalized.startsWith('data:image/vnd.microsoft.icon')) return 'image/x-icon'
  if (normalized.includes('.svg')) return 'image/svg+xml'
  if (normalized.includes('.png')) return 'image/png'
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) return 'image/jpeg'
  if (normalized.includes('.webp')) return 'image/webp'
  if (normalized.includes('.ico')) return 'image/x-icon'
  return ''
}

function buildFallbackFavicon(clinicName) {
  const initials = String(clinicName || 'CareDesk')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'C'

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="28" fill="#f4ecdc" />
      <rect x="8" y="8" width="80" height="80" rx="24" fill="#284b40" opacity="0.12" />
      <circle cx="48" cy="48" r="30" fill="#284b40" />
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
