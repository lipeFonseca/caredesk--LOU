import { useEffect } from 'react'
import Router from '@/router'
import { useSettingsStore, useAuthStore } from '@/store'
import { api } from '@/services/api'

export default function App() {
  const setSettings = useSettingsStore(s => s.setSettings)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated()) return
    api.settings.get()
      .then(data => { if (data) setSettings(data) })
      .catch(() => {})
  }, [isAuthenticated()])

  return <Router />
}
