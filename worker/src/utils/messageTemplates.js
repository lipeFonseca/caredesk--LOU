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

export async function resolveSuggestedMessageTemplate(db, patient, resolution, completedCount, clinicName = 'CareDesk') {
  const nextMilestone = getNextPendingMilestone(patient.surgery_date, resolution.days, completedCount)

  if (!nextMilestone) {
    return {
      nextMilestone: null,
      template: null,
    }
  }

  if (!resolution.protocolId) {
    return {
      nextMilestone,
      template: null,
    }
  }

  const row = await db.prepare(`
    SELECT id, protocol_id, day_offset, title, content, contact_type
    FROM protocol_message_templates
    WHERE protocol_id = ? AND day_offset = ?
    LIMIT 1
  `).bind(resolution.protocolId, nextMilestone.day).first()

  if (!row) {
    return {
      nextMilestone,
      template: null,
    }
  }

  const renderedContent = renderMessageTemplate(row.content, buildMessageTemplateContext({
    patient,
    resolution,
    nextMilestone,
    clinicName,
  }))

  return {
    nextMilestone,
    template: {
      ...row,
      rendered_content: renderedContent,
      milestone_label: formatProtocolDayLabel(nextMilestone.day),
      milestone_date: formatDatePtBr(nextMilestone.dateStr),
    },
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
