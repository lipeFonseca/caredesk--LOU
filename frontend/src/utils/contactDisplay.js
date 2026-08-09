// Configuracao de exibicao de contato/status compartilhada entre PatientDetail.jsx
// e PatientPanel.jsx — fonte unica para nao divergir entre as duas telas.

export const CONTACT_TYPES = [
  { value: 'call',      label: 'Ligação',    icon: 'call',      color: 'text-primary' },
  { value: 'whatsapp',  label: 'WhatsApp',   icon: 'chat',      color: 'text-primary' },
  { value: 'email',     label: 'Email',      icon: 'mail',      color: 'text-primary' },
  { value: 'in_person', label: 'Presencial', icon: 'handshake', color: 'text-primary' },
]

export const CONTACT_TYPE_CONFIG = Object.fromEntries(
  CONTACT_TYPES.map(({ value, ...rest }) => [value, rest])
)

export const OUTCOMES = [
  { value: 'reached',            label: 'Contactado' },
  { value: 'no_answer',          label: 'Sem resposta' },
  { value: 'callback_scheduled', label: 'Retorno agendado' },
]

export const OUTCOME_CONFIG = {
  reached:            { cls: 'bg-secondary-container/20 text-on-secondary-container', icon: 'check_circle', label: 'Contato realizado' },
  no_answer:          { cls: 'bg-surface-container-high text-on-surface-variant',     icon: 'phone_missed',  label: 'Sem resposta' },
  callback_scheduled: { cls: 'bg-[#fff8e1] text-[#f57f17]',                           icon: 'schedule',      label: 'Retorno agendado' },
}

export const STATUS_LABEL = {
  active:     'Ativo',
  paused:     'Pausado',
  discharged: 'Alta',
}

export const URGENCY_BADGE = {
  overdue: { cls: 'bg-error-container text-on-error-container border border-error/30',   label: 'Atrasado' },
  due:     { cls: 'bg-[#fff8e1] text-[#f57f17] border border-[#ffecb3]',                label: 'Vence hoje' },
  soon:    { cls: 'bg-[#fff3e0] text-[#ef6c00] border border-[#ffe0b2]',                label: 'Em breve' },
  ok:      { cls: 'bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9]',               label: 'Em dia' },
  none:    { cls: 'bg-surface-container-highest text-on-surface-variant border border-outline-variant', label: '—' },
}

export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

// Backend guarda so-digitos (mesma logica de phone_digits); mascara e so
// exibicao.
export function formatCpf(cpf = '') {
  const digitos = String(cpf).replace(/\D/g, '')
  if (digitos.length !== 11) return cpf || ''
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}
