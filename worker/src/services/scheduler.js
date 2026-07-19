import {
  getNextPendingMilestone,
  resolvePatientProtocol,
} from '../utils/protocols.js'

// ── Entry point chamado pelo cron trigger ────────────────────
export async function runScheduler(env) {
  console.log('[Scheduler] Iniciando verificação de follow-ups —', new Date().toISOString())

  const today = new Date().toISOString().split('T')[0]
  // Buscar todos os pacientes ativos com dados do agente
  const { results: patients } = await env.DB.prepare(`
    SELECT
      p.*,
      cp.days AS protocol_days_json,
      cp.name AS protocol_name,
      (
        SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id AND is_extra_contact = 0
      ) AS followup_count
    FROM patients p
    LEFT JOIN agents a ON p.assigned_agent_id = a.id
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    WHERE p.status = 'active'
  `).all()

  let notified = 0

  for (const patient of patients) {
    const result = await processPatient(patient, today, env)
    if (result) notified++
  }

  console.log(`[Scheduler] Concluído. ${notified} de ${patients.length} pacientes notificados.`)
  return { total: patients.length, notified }
}

async function processPatient(patient, today, env) {
  const resolution = resolvePatientProtocol(patient)
  const nextMilestone = getNextPendingMilestone(patient.surgery_date, resolution.days, patient.followup_count)
  if (!nextMilestone) return false
  if (today < nextMilestone.dateStr) return false

  // Evitar duplicar notificações do mesmo dia
  const existing = await env.DB.prepare(`
    SELECT id FROM notifications
    WHERE patient_id = ? AND scheduled_for = ? AND is_read = 0
  `).bind(patient.id, today).first()

  if (existing) return false

  const daysOverdue = Math.max(
    0,
    Math.floor((new Date(`${today}T12:00:00Z`) - new Date(`${nextMilestone.dateStr}T12:00:00Z`)) / (1000 * 60 * 60 * 24))
  )

  // Criar notificação no banco
  const notifId = crypto.randomUUID()
  const type = daysOverdue > 0 ? 'followup_overdue' : 'followup_due'

  await env.DB.prepare(`
    INSERT INTO notifications (id, patient_id, agent_id, type, scheduled_for)
    VALUES (?, ?, ?, ?, ?)
  `).bind(notifId, patient.id, patient.assigned_agent_id || null, type, today).run()

  console.log(`[Scheduler] Paciente ${patient.name}: due=${nextMilestone.day}d, atraso=${daysOverdue}d`)
  return true
}
