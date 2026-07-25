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

// Sessao agora vive em cookie httpOnly (nao acessivel via JS) — o fetch so
// precisa mandar `credentials: 'include'`. Em qualquer 401 fora do proprio
// login/refresh, tenta renovar o access token uma vez antes de deslogar.
let refreshInFlight = null

function requestRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

async function request(path, options = {}, isRetry = false) {
  const isFormData = options.body instanceof FormData
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers,
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  const isAuthEndpoint = path.startsWith('/auth/login') || path.startsWith('/auth/refresh')
  if (res.status === 401 && !isAuthEndpoint && !isRetry) {
    const refreshed = await requestRefresh()
    if (refreshed) return request(path, options, true)
    useAuthStore.getState().logout()
    throw new Error('Sessão expirada')
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`)
  }

  return data
}

// ── Auth ──────────────────────────────────────────────────────
export const api = {
  auth: {
    login:          (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    logout:         ()     => request('/auth/logout', { method: 'POST' }),
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

    listDocuments:        (id)                     => request(`/patients/${id}/documents`),
    assignDocument:       (id, templateId, body={}) => request(`/patients/${id}/documents/${templateId}`, { method: 'PUT',    body: JSON.stringify(body) }),
    updateDocumentStatus: (id, templateId, status)  => request(`/patients/${id}/documents/${templateId}`, { method: 'PATCH',  body: JSON.stringify({ status }) }),
    unassignDocument:     (id, templateId)          => request(`/patients/${id}/documents/${templateId}`, { method: 'DELETE' }),
  },

  // ── Protocolo de Documentos ─────────────────────────────────
  documentTemplates: {
    list:   (params = {}) => request('/document-templates?' + new URLSearchParams(params)),
    get:    (id)          => request(`/document-templates/${id}`),
    create: (body)        => request('/document-templates',      { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body)    => request(`/document-templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id)          => request(`/document-templates/${id}`, { method: 'DELETE' }),
  },

  // ── Histórico / atividade ───────────────────────────────────
  activity: {
    list: (params = {}) => request('/activity?' + new URLSearchParams(params)),
  },

  // ── Logs de erro do servidor (admin) ────────────────────────
  logs: {
    list: (params = {}) => request('/logs?' + new URLSearchParams(params)),
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
    uploadAvatar:  (id, file) => {
      const form = new FormData()
      form.append('file', file)
      return request(`/agents/${id}/avatar`, { method: 'POST', body: form })
    },
    removeAvatar:  (id)       => request(`/agents/${id}/avatar`, { method: 'DELETE' }),
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

  messageProtocols: {
    list:   (params = {}) => request('/message-protocols?' + new URLSearchParams(params)),
    get:    (id)          => request(`/message-protocols/${id}`),
    create: (body)        => request('/message-protocols', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body)    => request(`/message-protocols/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id)          => request(`/message-protocols/${id}`, { method: 'DELETE' }),
    placeholders: ()      => request('/message-protocols/placeholders'),
  },

  // ── Settings ────────────────────────────────────────────────
  settings: {
    getPublic:     ()     => request('/settings/public'),
    get:           ()     => request('/settings'),
    update:        (body) => request('/settings',          { method: 'PATCH', body: JSON.stringify(body) }),
    uploadLogo:    (file) => {
      const form = new FormData()
      form.append('logo', file)
      return request('/settings/logo', { method: 'POST', body: form })
    },
    removeLogo:    ()     => request('/settings/logo',     { method: 'DELETE' }),
    uploadAsset:   (type, file) => {
      const form = new FormData()
      form.append('file', file)
      return request(`/settings/assets/${type}`, { method: 'POST', body: form })
    },
    removeAsset:   (type) => request(`/settings/assets/${type}`, { method: 'DELETE' }),
  },
}
