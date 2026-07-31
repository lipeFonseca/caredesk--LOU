import { renderMessageTemplate } from './messageTemplates.js'

// Templates de e-mail editaveis pelo admin. A sintaxe de placeholder e a mesma
// do Protocolo de Mensagens ({{chave}}) — reusa renderMessageTemplate em vez de
// criar um segundo motor com regra propria.

export const EMAIL_TEMPLATE_TYPES = Object.freeze(['password_reset', 'daily_digest'])

// Cada tipo tem seu proprio conjunto: oferecer placeholder que nao existe
// naquele contexto so gera template quebrado (o valor sairia vazio).
export const EMAIL_TEMPLATE_PLACEHOLDERS = Object.freeze({
  password_reset: [
    { key: 'agent_name', label: 'Nome de quem pediu' },
    { key: 'code', label: 'Código de 6 dígitos' },
    { key: 'expires_in_minutes', label: 'Minutos de validade' },
    { key: 'clinic_name', label: 'Nome da clínica' },
  ],
  daily_digest: [
    { key: 'agent_name', label: 'Nome do agente' },
    { key: 'today_date', label: 'Data de hoje' },
    { key: 'tomorrow_date', label: 'Data de amanhã' },
    { key: 'contacts_logged', label: 'Contatos registrados hoje' },
    { key: 'reached_count', label: 'Pacientes alcançados hoje' },
    { key: 'no_answer_count', label: 'Sem resposta hoje' },
    { key: 'callback_count', label: 'Retornos agendados hoje' },
    { key: 'today_chart', label: 'Gráfico do dia por resultado (HTML)' },
    { key: 'overdue_count', label: 'Total de pacientes atrasados' },
    { key: 'overdue_list', label: 'Lista de pacientes atrasados (HTML)' },
    { key: 'tomorrow_total', label: 'Total de pacientes de amanhã' },
    { key: 'tomorrow_list', label: 'Lista de pacientes de amanhã (HTML)' },
    { key: 'clinic_name', label: 'Nome da clínica' },
  ],
})

// Placeholders que o sistema monta como HTML (uma lista pronta, por exemplo) e
// portanto NAO podem ser escapados — o resto e sempre escapado.
const PLACEHOLDERS_DE_HTML_PRONTO = new Set(['tomorrow_list', 'overdue_list', 'today_chart'])

export function isValidEmailTemplateType(tipo) {
  return EMAIL_TEMPLATE_TYPES.includes(tipo)
}

// ── Renderizacao ─────────────────────────────────────────────
// O corpo do template e HTML escrito pelo admin, entao e confiavel. Os VALORES
// interpolados vem do banco (nome de paciente, procedimento) e sao escapados
// antes de entrar no HTML — a sanitizacao na entrada ja existe, isto e a
// segunda camada.
export function renderEmailTemplate(template, contexto) {
  const contextoSeguro = {}
  for (const [chave, valor] of Object.entries(contexto)) {
    contextoSeguro[chave] = PLACEHOLDERS_DE_HTML_PRONTO.has(chave)
      ? valor
      : escaparHtml(valor)
  }

  return {
    subject: desescaparParaAssunto(renderMessageTemplate(template.subject, contextoSeguro)),
    html: renderMessageTemplate(template.body_html, contextoSeguro),
  }
}

export function escaparHtml(valor) {
  if (valor == null) return ''
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Assunto de e-mail e texto puro: a entidade HTML apareceria literal ("&amp;")
// pra quem le. Como o escape acontece antes por causa do corpo, desfaz aqui.
function desescaparParaAssunto(texto) {
  return String(texto ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// ── Validacao do que o admin salva ───────────────────────────
const MAX_SUBJECT_LENGTH = 200
const MAX_BODY_LENGTH    = 20000

export function validateEmailTemplatePayload({ subject, body_html }) {
  const assunto = typeof subject === 'string' ? subject.trim() : ''
  const corpo   = typeof body_html === 'string' ? body_html.trim() : ''

  if (!assunto) return { error: 'Informe o assunto do e-mail', status: 400 }
  if (assunto.length > MAX_SUBJECT_LENGTH) {
    return { error: `Assunto deve ter no máximo ${MAX_SUBJECT_LENGTH} caracteres`, status: 400 }
  }
  if (!corpo) return { error: 'Informe o corpo do e-mail', status: 400 }
  if (corpo.length > MAX_BODY_LENGTH) {
    return { error: `Corpo deve ter no máximo ${MAX_BODY_LENGTH} caracteres`, status: 400 }
  }

  // O admin escreve HTML livre (decisao do usuario), mas <script> nunca roda em
  // cliente de e-mail e so serviria pro preview do painel. Bloquear aqui evita
  // que um template salvo vire vetor caso o preview mude de implementacao.
  if (/<\s*script/i.test(corpo)) {
    return { error: 'O corpo não pode conter <script> — clientes de e-mail ignoram scripts', status: 400 }
  }

  return { subject: assunto, body_html: corpo }
}

// ── Leitura ──────────────────────────────────────────────────
export async function loadEmailTemplate(db, tipo) {
  return db.prepare(
    'SELECT tipo, subject, body_html, is_enabled FROM email_templates WHERE tipo = ?'
  ).bind(tipo).first()
}
