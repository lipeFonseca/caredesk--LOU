import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Auth Store ────────────────────────────────────────────────
export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      agent: null,

      login: (token, agent) => set({ token, agent }),

      logout: () => {
        set({ token: null, agent: null })
        window.location.href = '/login'
      },

      isAdmin: () => get().agent?.role === 'admin',
      isAuthenticated: () => !!get().token,
    }),
    { name: 'caredesk-auth', partialize: (s) => ({ token: s.token, agent: s.agent }) }
  )
)

// ── Notifications Store ───────────────────────────────────────
export const useNotifStore = create((set) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications, unreadCount) =>
    set({ notifications, unreadCount }),

  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n),
      unreadCount: Math.max(0, s.unreadCount - 1),
    })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map(n => ({ ...n, is_read: 1 })),
      unreadCount: 0,
    })),
}))

// ── App Settings Store ────────────────────────────────────────
export const useSettingsStore = create((set) => ({
  settings: {
    clinic_name:   'CareDesk',
    primary_color: '#6366f1',
    logo_url:      '',
  },
  setSettings: (settings) => {
    set({ settings })
    // Aplicar cor primária como CSS var
    applyPrimaryColor(settings.primary_color)
  },
}))

function applyPrimaryColor(hex) {
  if (!hex) return
  const [r, g, b] = hexToRgb(hex)
  if (r === null) return
  const root = document.documentElement
  root.style.setProperty('--color-primary-500', `${r} ${g} ${b}`)
  root.style.setProperty('--color-primary-600', adjustBrightness(r, g, b, -20))
  root.style.setProperty('--color-primary-700', adjustBrightness(r, g, b, -40))
  root.style.setProperty('--color-primary-100', adjustBrightness(r, g, b, 120))
  root.style.setProperty('--color-primary-50',  adjustBrightness(r, g, b, 150))
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [null, null, null]
}

function adjustBrightness(r, g, b, amount) {
  const clamp = (v) => Math.min(255, Math.max(0, v))
  return `${clamp(r + amount)} ${clamp(g + amount)} ${clamp(b + amount)}`
}
