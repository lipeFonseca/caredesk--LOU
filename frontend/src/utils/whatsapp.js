function resolvePath(source, key) {
  return key.split('.').reduce((acc, part) => (acc && part in acc ? acc[part] : undefined), source)
}

function firstName(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

export function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '')
}

export function formatDateBr(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = String(dateStr).split('-')
  if (!year || !month || !day) return String(dateStr)
  return `${day}/${month}/${year}`
}

export function buildWhatsAppContext(patient, clinicName = 'CareDesk') {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return {
    clinica: {
      nome: clinicName || 'CareDesk',
    },
    paciente: {
      nome: patient?.name || '',
      primeiro_nome: firstName(patient?.name),
      telefone: patient?.phone || '',
      procedimento: patient?.procedure || '',
      cirurgia_data: formatDateBr(patient?.surgery_date),
    },
    contato: {
      dia: patient?.followup_urgency || '',
      data: patient?.surgery_date ? formatDateBr(patient.surgery_date) : '',
      status: patient?.followup_urgency || '',
    },
    protocolo: {
      nome: patient?.protocol_name || '',
    },
    link: {
      paciente: origin && patient?.id ? `${origin}/patients/${patient.id}` : '',
    },
  }
}

export function renderWhatsAppMessage(template, context) {
  const source = String(template || '').trim()
  if (!source) return ''

  let rendered = source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = rawKey.trim()
    return resolvePath(context, key) ?? ''
  })

  rendered = rendered.replace(/\{([a-z_]+)\}/gi, (_, rawKey) => {
    const key = rawKey.trim().toLowerCase()
    const aliases = {
      nome: context?.paciente?.nome,
      primeiro_nome: context?.paciente?.primeiro_nome || firstName(context?.paciente?.nome),
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

    return aliases[key] ?? ''
  })

  return rendered.trim()
}

export function buildWhatsAppUrl({ phone, message, countryCode = '55' }) {
  const localPhone = normalizePhone(phone)
  const normalizedCountryCode = normalizePhone(countryCode || '55') || '55'
  if (!localPhone) return ''

  const fullNumber = localPhone.startsWith(normalizedCountryCode)
    ? localPhone
    : `${normalizedCountryCode}${localPhone}`

  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(message || '')}`
}
