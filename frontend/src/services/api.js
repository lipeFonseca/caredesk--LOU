import { useAuthStore } from '@/store'

const DEFAULT_PRODUCTION_API_BASE = 'https://caredesk-worker.faugusto-thecoral.workers.dev'

const BASE = `${resolveApiBase()}/api`

function resolveApiBase() {
  const configuredBase = normalizeBase(import.meta.env.VITE_API_BASE)
  if (configuredBase) return configuredBase

  if (import.meta.env.DEV) return ''

  return DEFAULT_PRODUCTION_API_BASE
}

function normalizeBase(value) {
  if (!value) return ''
  return value.trim().replace(/\/+$/, '')
}

async function request(path, options = {}) {
  const token = useAuthStore.getState().token
  const isFormData = options.body instanceof FormData
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })

  const data = await res.json().catch(() => ({}))

  if (res.status === 401) {
    const { token, logout } = useAuthStore.getState()
    if (token) logout()
    throw new Error(data.error || 'Não autorizado')
  }

  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`)
  }

  return data
}

// ── Auth ──────────────────────────────────────────────────────
export const api = {
  auth: {
    login:          (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me:             ()     => request('/auth/me'),
    changePassword: (body) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
  },

  // ── Pacientes ───────────────────────────────────────────────
  patients: {
    list:   (params = {}) => request('/patients?' + new URLSearchParams(params)),
    get:    (id)          => request(`/patients/${id}`),
    create: (body)        => request('/patients',     { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body)    => request(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id)          => request(`/patients/${id}`, { method: 'DELETE' }),
  },

  // ── Follow-ups ──────────────────────────────────────────────
  followups: {
    list:   (patient_id) => request(`/followups?patient_id=${patient_id}`),
    create: (body)       => request('/followups',     { method: 'POST',  body: JSON.stringify(body) }),
    update: (id, body)   => request(`/followups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  // ── Agentes ─────────────────────────────────────────────────
  agents: {
    list:          ()         => request('/agents'),
    create:        (body)     => request('/agents',     { method: 'POST',  body: JSON.stringify(body) }),
    update:        (id, body) => request(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    resetPassword: (id, body) => request(`/agents/${id}/reset-password`, { method: 'POST', body: JSON.stringify(body) }),
  },

  // ── Notificações ────────────────────────────────────────────
  notifications: {
    list:       (params = {}) => request('/notifications?' + new URLSearchParams(params)),
    markRead:   (id)          => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: ()           => request('/notifications/read-all',   { method: 'POST' }),
  },

  // ── Protocolos ──────────────────────────────────────────────
  protocols: {
    list:   ()         => request('/protocols'),
    get:    (id)       => request(`/protocols/${id}`),
    create: (body)     => request('/protocols',      { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body) => request(`/protocols/${id}`, { method: 'PATCH',  body: JSON.stringify(body) }),
    delete: (id)       => request(`/protocols/${id}`, { method: 'DELETE' }),
  },

  // ── Settings ────────────────────────────────────────────────
  settings: {
    get:           ()     => request('/settings'),
    update:        (body) => request('/settings',          { method: 'PATCH', body: JSON.stringify(body) }),
    uploadLogo:    (file) => {
      const form = new FormData()
      form.append('logo', file)
      return request('/settings/logo', { method: 'POST', body: form })
    },
    removeLogo:    ()     => request('/settings/logo',     { method: 'DELETE' }),
    getTelegram:    ()     => request('/settings/telegram'),
    updateTelegram: (body) => request('/settings/telegram', { method: 'PUT',   body: JSON.stringify(body) }),
    updateProtocol: (days) => request('/settings/protocol', { method: 'PATCH', body: JSON.stringify({ days }) }),
  },
}
