const BASE = 'https://api.telegram.org/bot'

// ── Enviar mensagem para um chat_id ──────────────────────────
export async function sendTelegramMessage(botToken, chatId, text) {
  const url = `${BASE}${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  })
  const data = await res.json()
  if (!data.ok) {
    console.error('[Telegram] Erro ao enviar:', data)
    return false
  }
  return true
}

// ── Montar mensagem de alerta de follow-up ────────────────────
export function buildFollowupMessage(patient, daysSince, appUrl = '') {
  const emoji = daysSince >= 0 ? '🔴' : '🟡'
  const status = daysSince >= 0 ? `*${daysSince} dias em atraso*` : 'Vence hoje'
  const link = appUrl ? `\n\n👉 [Ver paciente](${appUrl}/patients/${patient.id})` : ''

  return `${emoji} *CareDesk · Alerta de Follow-up*

📋 *Paciente:* ${patient.name}
🔪 *Procedimento:* ${patient.procedure}
📅 *Cirurgia:* ${formatDate(patient.surgery_date)}
⏰ *Status:* ${status}
📞 *Telefone:* ${patient.phone || 'não informado'}${link}`
}

// ── Enviar para múltiplos destinos ────────────────────────────
export async function notifyMultiple(botToken, chatIds, text) {
  const results = await Promise.allSettled(
    chatIds.filter(Boolean).map(id => sendTelegramMessage(botToken, id, text))
  )
  return results.filter(r => r.status === 'fulfilled' && r.value).length
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}
