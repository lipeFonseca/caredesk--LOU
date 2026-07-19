import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  normalizeBrandingSettings,
  DEFAULT_TAGLINE,
  DEFAULT_HERO_TITLE,
  DEFAULT_HERO_SUBTITLE,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_TIMEZONE,
  DEFAULT_LOGIN_BORDER_COLORS,
  DEFAULT_LOGIN_BORDER_COLOR_BACK,
  DEFAULT_LOGIN_BORDER_PRESET,
  DEFAULT_LOGIN_BORDER_INTENSITY,
  DEFAULT_LOGIN_BORDER_SPEED,
  DEFAULT_LOGIN_BORDER_THICKNESS,
  DEFAULT_LOGIN_BORDER_BLOOM,
} from '@/theme/branding'

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

// ── App Settings Store ────────────────────────────────────────
export const useSettingsStore = create((set, get) => ({
  isLoaded: false,
  settings: {
    clinic_name:           'CareDesk',
    clinic_tagline:        DEFAULT_TAGLINE,
    hero_title:            DEFAULT_HERO_TITLE,
    hero_subtitle:         DEFAULT_HERO_SUBTITLE,
    primary_color:         DEFAULT_PRIMARY_COLOR,
    logo_url:              '',
    background_image_url:  '',
    login_image_url:       '',
    login_background_image_url: '',
    favicon_url:           '',
    login_border_effect_enabled: false,
    login_border_preset: DEFAULT_LOGIN_BORDER_PRESET,
    login_border_color_1: DEFAULT_LOGIN_BORDER_COLORS[0],
    login_border_color_2: DEFAULT_LOGIN_BORDER_COLORS[1],
    login_border_color_3: DEFAULT_LOGIN_BORDER_COLORS[2],
    login_border_color_back: DEFAULT_LOGIN_BORDER_COLOR_BACK,
    login_border_intensity: DEFAULT_LOGIN_BORDER_INTENSITY,
    login_border_speed: DEFAULT_LOGIN_BORDER_SPEED,
    login_border_thickness: DEFAULT_LOGIN_BORDER_THICKNESS,
    login_border_bloom: DEFAULT_LOGIN_BORDER_BLOOM,
    timezone:              DEFAULT_TIMEZONE,
  },
  setSettings: (incoming) => {
    const mergedSettings = {
      ...get().settings,
      ...normalizeBrandingSettings(incoming),
    }
    set({ settings: mergedSettings, isLoaded: true })
  },
  markLoaded: () => set({ isLoaded: true }),
}))
