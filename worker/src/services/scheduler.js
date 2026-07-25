import {
  getNextPendingMilestone,
  resolvePatientProtocol,
} from '../utils/protocols.js'
import { purgeOldErrorLogs, RETENTION_DAYS } from './error-log.js'
import { purgeExpiredResetCodes } from '../utils/passwordReset.js'
import { runArquivamento } from './arquivamento.js'
import { reconciliarProximosMarcos } from '../utils/proximoMarco.js'

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

// ── Faxina noturna (cron da meia-noite, Fortaleza) ────────────
// Mantem no banco so o que ainda serve: log dentro da janela de retencao e
// codigo de reset de pedido em curso. Cada limpeza e isolada da outra — uma
// falhar nao pode impedir a seguinte de rodar.
export async function runNightlyCleanup(env) {
  console.log('[Faxina] Iniciando limpeza noturna —', new Date().toISOString())

  const logsRemovidos = await limparComTolerancia(
    'error_logs',
    () => purgeOldErrorLogs(env)
  )
  const codigosRemovidos = await limparComTolerancia(
    'password_reset_codes',
    () => purgeExpiredResetCodes(env)
  )
  const contadoresRemovidos = await limparComTolerancia(
    'login_rate_limit',
    () => purgeStaleRateLimits(env)
  )

  // Arquiva quem passou da janela de acompanhamento. Fica na faxina porque o
  // efeito e o mesmo: tirar da operacao o que ja nao serve a ela.
  const arquivados = await limparComTolerancia(
    'arquivamento',
    async () => (await runArquivamento(env)).arquivados
  )

  // Rede de seguranca do next_followup_date: cobre o backfill das linhas que
  // nasceram NULL na migration e conserta qualquer divergencia que um caminho
  // de escrita venha a deixar passar. Lote fixo por noite, priorizando quem
  // nunca foi calculado — custo constante independente do tamanho da base.
  const marcosReconciliados = await limparComTolerancia(
    'next_followup_date',
    () => reconciliarProximosMarcos(env.DB)
  )

  // Sem estatistica atualizada o planner do SQLite escolhe indice por heuristica
  // fixa — e com a tabela crescendo 100-300 linhas/dia isso passa a errar. O
  // ANALYZE e barato e mantem a escolha alinhada ao volume real. Roda por
  // ultimo, pra ja refletir o que o arquivamento mudou.
  await limparComTolerancia('ANALYZE', async () => {
    await env.DB.prepare('ANALYZE').run()
    return 0
  })

  console.log(`[Faxina] ${arquivados} paciente(s) arquivado(s), ${marcosReconciliados} próximo(s) marco(s) reconciliado(s).`)

  console.log(`[Faxina] Concluída. ${logsRemovidos} log(s) além de ${RETENTION_DAYS} dias, ${codigosRemovidos} código(s) de reset expirado(s) e ${contadoresRemovidos} contador(es) de rate limit vencido(s) removido(s). Estatísticas do banco atualizadas.`)
  return { logsRemovidos, codigosRemovidos, contadoresRemovidos }
}

// ── Rate limit vencido ───────────────────────────────────────
// A tabela nunca era limpa: chave de tentativa antiga (inclusive de varredura
// automatizada, que gera uma linha por e-mail testado) ficava pra sempre.
//
// So sai o que ja nao protege mais: bloqueio expirado ou contador parado ha
// mais de um dia. Contador ativo e bloqueio em curso ficam — apagar um bloqueio
// vigente seria destravar um ataque em andamento.
export async function purgeStaleRateLimits(env) {
  // `datetime(locked_until)` pelo mesmo motivo de purgeExpiredResetCodes:
  // locked_until vem do JS em ISO, updated_at vem do proprio SQLite. Comparar
  // texto ISO com texto SQLite falha silenciosamente — linha com bloqueio
  // gravado nunca era considerada vencida. `updated_at` dispensa a conversao
  // porque ja e escrito por datetime('now').
  const { meta } = await env.DB.prepare(`
    DELETE FROM login_rate_limit
    WHERE (locked_until IS NULL OR datetime(locked_until) < datetime('now'))
      AND updated_at < datetime('now', '-1 day')
  `).run()

  return meta?.changes ?? 0
}

async function limparComTolerancia(nomeDaTabela, executarLimpeza) {
  try {
    return await executarLimpeza()
  } catch (falha) {
    console.error(`[Faxina] falha ao limpar ${nomeDaTabela}`, falha)
    return 0
  }
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
