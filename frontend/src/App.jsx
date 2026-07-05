import { useEffect, useLayoutEffect } from 'react'
import Router from '@/router'
import { useSettingsStore, useAuthStore, useThemeStore } from '@/store'
import { api } from '@/services/api'
import { applyThemePaletteWithMode } from '@/darkPalette'
import { getBranding } from '@/theme/branding'

export default function App() {
  const setSettings    = useSettingsStore(s => s.setSettings)
  const settings       = useSettingsStore(s => s.settings)
  const primaryColor   = useSettingsStore(s => s.settings.primary_color)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const { dark } = useThemeStore()

  // Aplica paleta (light ou dark) sempre que mudar tema ou modo
  useLayoutEffect(() => {
    applyThemePaletteWithMode(primaryColor, dark)
  }, [primaryColor, dark])

  useEffect(() => {
    if (!isAuthenticated()) return
    api.settings.get()
      .then(data => { if (data) setSettings(data) })
      .catch(() => {})
  }, [isAuthenticated()])

  useEffect(() => {
    const branding = getBranding(settings)
    const favicon = ensureFavicon()
    favicon.href = branding.faviconUrl
    document.title = branding.clinicName
    document.documentElement.style.setProperty('--brand-background-image', branding.backgroundImageUrl ? `url("${branding.backgroundImageUrl}")` : 'none')
  }, [settings])

  return <Router />
}

function ensureFavicon() {
  let favicon = document.querySelector("link[rel='icon']")
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.setAttribute('rel', 'icon')
    document.head.appendChild(favicon)
  }
  return favicon
}
