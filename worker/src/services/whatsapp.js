const DEFAULT_COUNTRY_CODE = '55'
const DEFAULT_OPEN_DELAY_MS = 800

const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: 'tpl-followup-friendly',
    name: 'Lembrete de acompanhamento',
    description: 'Mensagem acolhedora para lembrar o paciente do próximo contato.',
    content: 'Olá, {primeiro_nome}. Aqui é da {clinica}. Passando para lembrar do seu acompanhamento de {procedimento}. Seu próximo contato está previsto para {data_contato}. Se precisar, estamos à disposição.',
    is_default: true,
    is_active: true,
  },
  {
    id: 'tpl-surgery-day',
    name: 'Mensagem para o dia da cirurgia',
    description: 'Contato rápido para o grande dia.',
    content: 'Olá, {primeiro_nome}. Hoje é o dia do seu procedimento de {procedimento}. Desejamos que tudo corra bem e seguimos à disposição no {clinica}.',
    is_default: false,
    is_active: true,
  },
  {
    id: 'tpl-post-op-checkin',
    name: 'Check-in pós-cirúrgico',
    description: 'Mensagem simples para saber como o paciente está na recuperação.',
    content: 'Olá, {primeiro_nome}. Como você está se sentindo após a cirurgia de {procedimento}? Este é o seu acompanhamento previsto para {data_contato}. Se precisar, pode responder por aqui.',
    is_default: false,
    is_active: true,
  },
]

const VARIABLE_OPTIONS = [
  { key: '{nome}', label: 'Nome completo do paciente' },
  { key: '{primeiro_nome}', label: 'Primeiro nome do paciente' },
  { key: '{telefone}', label: 'Telefone do paciente' },
  { key: '{procedimento}', label: 'Procedimento / cirurgia' },
  { key: '{data_cirurgia}', label: 'Data da cirurgia' },
  { key: '{dia_contato}', label: 'Dia do marco do contato' },
  { key: '{data_contato}', label: 'Data prevista do contato' },
  { key: '{status_contato}', label: 'Status atual do contato' },
  { key: '{protocolo}', label: 'Nome do protocolo' },
  { key: '{clinica}', label: 'Nome da clínica' },
  { key: '{link_paciente}', label: 'Link do paciente no sistema' },
  { key: '{{paciente.nome}}', label: 'Compatibilidade: nome do paciente' },
  { key: '{{paciente.procedimento}}', label: 'Compatibilidade: procedimento' },
  { key: '{{paciente.cirurgia_data}}', label: 'Compatibilidade: data da cirurgia' },
  { key: '{{contato.data}}', label: 'Compatibilidade: data do contato' },
  { key: '{{contato.status}}', label: 'Compatibilidade: status do contato' },
  { key: '{{clinica.nome}}', label: 'Compatibilidade: nome da clínica' },
  { key: '{{link.paciente}}', label: 'Compatibilidade: link do paciente' },
]

export function getWhatsAppConfig(settingsMap = {}) {
  const countryCode = normalizePhone(settingsMap.whatsapp_country_code || DEFAULT_COUNTRY_CODE) || DEFAULT_COUNTRY_CODE
  const openDelay = parseDelay(settingsMap.whatsapp_open_delay_ms)
  const enabledRaw = settingsMap.whatsapp_enabled

  return {
    mode: 'manual_link',
    enabled: enabledRaw == null ? true : enabledRaw === '1',
    countryCode,
    openDelayMs: openDelay,
    defaultTemplateId: String(settingsMap.whatsapp_default_template_id || '').trim(),
  }
}

export function getWhatsAppVariableOptions() {
  return VARIABLE_OPTIONS
}

export function getWhatsAppTemplates(settingsMap = {}) {
  const parsed = parseTemplates(settingsMap.whatsapp_message_templates)
  if (parsed.length === 0) {
    return ensureDefaultTemplate(DEFAULT_WHATSAPP_TEMPLATES.map(template => ({
      ...template,
      created_at: null,
      updated_at: null,
    })))
  }

  return ensureDefaultTemplate(parsed)
}

export function normalizeWhatsAppTemplates(input) {
  if (!Array.isArray(input)) return []

  const normalized = input
    .map((item) => normalizeTemplateRecord(item))
    .filter(Boolean)

  return ensureDefaultTemplate(normalized)
}

export function renderWhatsAppTemplate(template, context) {
  const source = String(template || '').trim()
  if (!source) return ''

  let rendered = source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = rawKey.trim()
    return resolvePath(context, key) ?? ''
  })

  rendered = rendered.replace(/\{([a-z_]+)\}/gi, (_, rawKey) => {
    const value = resolveAlias(context, rawKey.trim().toLowerCase())
    return value ?? ''
  })

  return rendered.trim()
}

export function buildTemplateContext({ settingsMap = {}, patient, protocol, milestone, appUrl = '', status = '' }) {
  return {
    clinica: {
      nome: settingsMap.clinic_name || 'CareDesk',
    },
    paciente: {
      nome: patient?.name || '',
      primeiro_nome: getFirstName(patient?.name),
      telefone: patient?.phone || '',
      procedimento: patient?.procedure || '',
      cirurgia_data: formatDate(patient?.surgery_date),
    },
    contato: {
      dia: milestone?.day ?? '',
      data: formatDate(milestone?.dateStr),
      status,
    },
    protocolo: {
      nome: protocol?.name || '',
    },
    link: {
      paciente: appUrl && patient?.id ? `${appUrl}/patients/${patient.id}` : '',
    },
  }
}

export function serializeWhatsAppTemplates(templates) {
  return JSON.stringify(normalizeWhatsAppTemplates(templates))
}

function parseTemplates(raw) {
  if (!raw) return []

  try {
    return normalizeWhatsAppTemplates(JSON.parse(raw))
  } catch {
    return []
  }
}

function normalizeTemplateRecord(item) {
  if (!item || typeof item !== 'object') return null

  const name = String(item.name || '').trim()
  const content = String(item.content || '').trim()
  if (!name || !content) return null

  return {
    id: String(item.id || crypto.randomUUID()),
    name,
    description: String(item.description || '').trim(),
    content,
    is_default: Boolean(item.is_default),
    is_active: 'is_active' in item ? Boolean(item.is_active) : true,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null,
  }
}

function ensureDefaultTemplate(templates) {
  if (!templates.length) return []

  let foundDefault = false
  return templates.map((template, index) => {
    if (!foundDefault && template.is_default) {
      foundDefault = true
      return template
    }

    if (!foundDefault && index === 0) {
      foundDefault = true
      return { ...template, is_default: true }
    }

    return foundDefault && template.is_default
      ? { ...template, is_default: false }
      : template
  })
}

function parseDelay(value) {
  const numeric = Number.parseInt(String(value || ''), 10)
  if (Number.isNaN(numeric) || numeric < 200) return DEFAULT_OPEN_DELAY_MS
  return Math.min(numeric, 5000)
}

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '')
}

function resolvePath(source, key) {
  return key.split('.').reduce((acc, part) => (acc && part in acc ? acc[part] : undefined), source)
}

function resolveAlias(context, key) {
  const aliases = {
    nome: context?.paciente?.nome,
    primeiro_nome: context?.paciente?.primeiro_nome || getFirstName(context?.paciente?.nome),
    telefone: context?.paciente?.telefone,
    procedimento: context?.paciente?.procedimento,
    data_cirurgia: context?.paciente?.cirurgia_data,
    dia_contato: context?.contato?.dia,
    data_contato: context?.contato?.data,
    status_contato: context?.contato?.status,
    protocolo: context?.protocolo?.nome,
    clinica: context?.clinica?.nome,
    link_paciente: context?.link?.paciente,
  }

  return aliases[key]
}

function getFirstName(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = String(dateStr).split('-')
  if (!year || !month || !day) return String(dateStr)
  return `${day}/${month}/${year}`
}
