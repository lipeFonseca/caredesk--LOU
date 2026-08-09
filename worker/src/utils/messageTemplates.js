import { getNextPendingMilestone } from './protocols.js'

export const MESSAGE_TEMPLATE_CONTACT_TYPES = Object.freeze([
  'call',
  'email',
  'whatsapp',
  'in_person',
])

export const MESSAGE_TEMPLATE_PLACEHOLDERS = Object.freeze([
  { key: 'patient_name', label: 'Nome do paciente' },
  { key: 'patient_phone', label: 'Telefone do paciente' },
  { key: 'responsavel_name', label: 'Nome do responsável' },
  { key: 'procedure', label: 'Procedimento' },
  { key: 'surgery_date', label: 'Data da cirurgia' },
  { key: 'assigned_agent_name', label: 'Nome do agente responsável' },
  { key: 'clinic_name', label: 'Nome da clínica' },
  { key: 'protocol_name', label: 'Nome do protocolo' },
  { key: 'milestone_label', label: 'Marco do protocolo' },
  { key: 'milestone_date', label: 'Data prevista do marco' },
  { key: 'contact_date', label: 'Data do contato atual' },
])

export function isValidMessageTemplateContactType(value) {
  return MESSAGE_TEMPLATE_CONTACT_TYPES.includes(value)
}

export function renderMessageTemplate(content, context) {
  if (typeof content !== 'string' || !content.trim()) return ''

  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = context[key]
    return value == null ? '' : String(value)
  })
}

// Devolve TODOS os templates cadastrados pro proximo marco pendente — mais de
// um por marco e permitido de proposito (ver 0025), pra dar ao agente opcoes
// de texto diferentes a cada contato e evitar padrao de banimento de numero
// no WhatsApp. `templates` vem sempre em array, mesmo vazio ou com 1 item.
export async function resolveSuggestedMessageTemplate(db, patient, resolution, completedCount, clinicName = 'CareDesk') {
  const nextMilestone = getNextPendingMilestone(patient.surgery_date, resolution.days, completedCount)

  if (!nextMilestone) {
    return {
      nextMilestone: null,
      templates: [],
    }
  }

  if (!resolution.protocolId) {
    return {
      nextMilestone,
      templates: [],
    }
  }

  const { results } = await db.prepare(`
    SELECT id, protocol_id, day_offset, title, content, contact_type
    FROM protocol_message_templates
    WHERE protocol_id = ? AND day_offset = ?
    ORDER BY created_at ASC
  `).bind(resolution.protocolId, nextMilestone.day).all()

  const context = buildMessageTemplateContext({ patient, resolution, nextMilestone, clinicName })

  return {
    nextMilestone,
    templates: (results ?? []).map((row) => ({
      ...row,
      rendered_content: renderMessageTemplate(row.content, context),
      milestone_label: formatProtocolDayLabel(nextMilestone.day),
      milestone_date: formatDatePtBr(nextMilestone.dateStr),
    })),
  }
}

export function formatProtocolDayLabel(day) {
  if (day < 0) return `${Math.abs(day)} ${Math.abs(day) === 1 ? 'dia' : 'dias'} antes da cirurgia`
  if (day === 0) return 'Dia da cirurgia'
  return `${day} ${day === 1 ? 'dia' : 'dias'} após a cirurgia`
}

function buildMessageTemplateContext({ patient, resolution, nextMilestone, clinicName }) {
  return {
    patient_name: patient.name ?? '',
    patient_phone: patient.phone ?? '',
    responsavel_name: patient.responsavel ?? '',
    procedure: patient.procedure ?? '',
    surgery_date: formatDatePtBr(patient.surgery_date),
    assigned_agent_name: patient.agent_name ?? '',
    clinic_name: clinicName ?? 'CareDesk',
    protocol_name: resolution.protocolName ?? '',
    milestone_label: formatProtocolDayLabel(nextMilestone.day),
    milestone_date: formatDatePtBr(nextMilestone.dateStr),
    contact_date: formatDatePtBr(new Date().toISOString().split('T')[0]),
  }
}

function formatDatePtBr(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = String(dateStr).split('-')
  if (!year || !month || !day) return dateStr
  return `${day}/${month}/${year}`
}
