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

// ── Theme Store (dark mode) ───────────────────────────────────
export const useThemeStore = create(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set((s) => ({ dark: !s.dark })),
    }),
    { name: 'caredesk-theme' }
  )
)

const DEFAULT_PROTOCOL = '[-2,0,2,5,15,30,60,90,120,180]'

// ── App Settings Store ────────────────────────────────────────
export const useSettingsStore = create((set, get) => ({
  settings: {
    clinic_name:           'CareDesk',
    clinic_tagline:        'Acompanhamento pos-cirurgico com presenca e previsibilidade.',
    hero_title:            'Cuidado premium em cada etapa da jornada do paciente.',
    hero_subtitle:         'Organize contatos, acompanhe protocolos e conduza o retorno com uma interface mais humana, elegante e clara.',
    primary_color:         '#5f8fba',
    logo_url:              '',
    background_image_url:  '',
    favicon_url:           '',
    timezone:              'America/Fortaleza',
    contact_protocol_days: DEFAULT_PROTOCOL,
  },
  setSettings: (incoming) => {
    const mergedSettings = { ...get().settings, ...incoming }
    set({ settings: mergedSettings })
  },
  getProtocolDays: () => {
    try {
      const raw = get().settings.contact_protocol_days || DEFAULT_PROTOCOL
      return JSON.parse(raw)
    } catch {
      return [-2, 0, 2, 5, 15, 30, 60, 90, 120, 180]
    }
  },
}))
