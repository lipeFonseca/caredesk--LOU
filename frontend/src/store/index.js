import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeBrandingSettings } from '@/theme/branding'

// ── Auth Store ────────────────────────────────────────────────
export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      agent: null,

      login: (token, agent) => set({ token, agent }),
      updateAgent: (partial) => set((state) => ({
        agent: state.agent ? { ...state.agent, ...partial } : state.agent,
      })),

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
  isLoaded: false,
  settings: {
    clinic_name:           'CareDesk',
    clinic_tagline:        'Acompanhamento pos-cirurgico com presenca e previsibilidade.',
    hero_title:            'Cuidado premium em cada etapa da jornada do paciente.',
    hero_subtitle:         'Organize contatos, acompanhe protocolos e conduza o retorno com uma interface mais humana, elegante e clara.',
    primary_color:         '#5f8fba',
    logo_url:              '',
    background_image_url:  '',
    login_image_url:       '',
    favicon_url:           '',
    login_border_effect_enabled: false,
    login_border_preset: 'default',
    login_border_color_1: '#0dc1fd',
    login_border_color_2: '#d915ef',
    login_border_color_3: '#ff3f2ecc',
    login_border_color_back: '#00000000',
    login_border_intensity: 0.2,
    login_border_speed: 1,
    login_border_thickness: 0.1,
    login_border_bloom: 0.25,
    timezone:              'America/Fortaleza',
    contact_protocol_days: DEFAULT_PROTOCOL,
  },
  setSettings: (incoming) => {
    const mergedSettings = {
      ...get().settings,
      ...normalizeBrandingSettings(incoming),
    }
    set({ settings: mergedSettings, isLoaded: true })
  },
  markLoaded: () => set({ isLoaded: true }),
  getProtocolDays: () => {
    try {
      const raw = get().settings.contact_protocol_days || DEFAULT_PROTOCOL
      return JSON.parse(raw)
    } catch {
      return [-2, 0, 2, 5, 15, 30, 60, 90, 120, 180]
    }
  },
}))
