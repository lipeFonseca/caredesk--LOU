import { sendTelegramMessage, buildFollowupMessage, notifyMultiple } from './telegram.js'

// ── Entry point chamado pelo cron trigger ────────────────────
export async function runScheduler(env) {
  console.log('[Scheduler] Iniciando verificação de follow-ups —', new Date().toISOString())

  const today = new Date().toISOString().split('T')[0]

  // Buscar config do Telegram
  const telegramCfg = await env.DB.prepare(
    'SELECT * FROM telegram_config WHERE id = 1'
  ).first()

  const hasTelegram = telegramCfg?.bot_token && telegramCfg?.default_chat_id

  // Buscar todos os pacientes ativos com dados do agente
  const { results: patients } = await env.DB.prepare(`
    SELECT
      p.*,
      a.telegram_chat_id AS agent_telegram_id,
      (
        SELECT contact_date FROM followup_logs
        WHERE patient_id = p.id
        ORDER BY contact_date DESC LIMIT 1
      ) AS last_contact_date,
      (
        SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id
      ) AS followup_count
    FROM patients p
    LEFT JOIN agents a ON p.assigned_agent_id = a.id
    WHERE p.status = 'active'
  `).all()

  let notified = 0

  for (const patient of patients) {
    const result = await processPatient(patient, today, env, telegramCfg, hasTelegram)
    if (result) notified++
  }

  console.log(`[Scheduler] Concluído. ${notified} de ${patients.length} pacientes notificados.`)
  return { total: patients.length, notified }
}

async function processPatient(patient, today, env, telegramCfg, hasTelegram) {
  const protocols = (patient.protocol_days || '7,15,30,60,90')
    .split(',').map(Number).sort((a, b) => a - b)

  const base = patient.last_contact_date || patient.surgery_date
  if (!base) return false

  const daysSinceBase = Math.floor(
    (new Date(today) - new Date(base)) / (1000 * 60 * 60 * 24)
  )

  // Determinar qual protocolo está devido
  const dueProtocol = protocols[patient.followup_count] ?? protocols[protocols.length - 1]
  const isDue = daysSinceBase >= dueProtocol

  if (!isDue) return false

  // Evitar duplicar notificações do mesmo dia
  const existing = await env.DB.prepare(`
    SELECT id FROM notifications
    WHERE patient_id = ? AND scheduled_for = ? AND is_read = 0
  `).bind(patient.id, today).first()

  if (existing) return false

  const daysOverdue = daysSinceBase - dueProtocol

  // Criar notificação no banco
  const notifId = crypto.randomUUID()
  const type = daysOverdue > 0 ? 'followup_overdue' : 'followup_due'

  await env.DB.prepare(`
    INSERT INTO notifications (id, patient_id, agent_id, type, scheduled_for, sent_telegram)
    VALUES (?, ?, ?, ?, ?, 0)
  `).bind(notifId, patient.id, patient.assigned_agent_id || null, type, today).run()

  // Enviar Telegram
  let telegramSent = false
  if (hasTelegram) {
    const appUrl = env.FRONTEND_URL || ''
    const message = buildFollowupMessage(patient, daysOverdue, appUrl)

    // Destinos: chat do agente + default + grupo (se configurado)
    const chatIds = [
      telegramCfg.default_chat_id,
      patient.agent_telegram_id,
      telegramCfg.notify_group ? telegramCfg.group_chat_id : null,
    ].filter(Boolean)

    // Remover duplicatas
    const uniqueIds = [...new Set(chatIds)]
    const sent = await notifyMultiple(telegramCfg.bot_token, uniqueIds, message)
    telegramSent = sent > 0

    if (telegramSent) {
      await env.DB.prepare(
        'UPDATE notifications SET sent_telegram = 1 WHERE id = ?'
      ).bind(notifId).run()
    }
  }

  console.log(`[Scheduler] Paciente ${patient.name}: due=${dueProtocol}d, atraso=${daysOverdue}d, telegram=${telegramSent}`)
  return true
}
