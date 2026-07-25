// Manutencao de `patients.next_followup_date`, a data do proximo marco de
// acompanhamento.
//
// Coluna derivada: nao e fonte da verdade, e cache do que
// getNextPendingMilestone() calcularia. Toda escrita que possa mudar o
// resultado precisa passar por aqui, senao o Dashboard mostra numero errado.
//
// Muda quando: surgery_date, protocol_id ou status do paciente mudam; um
// followup nao-extra e criado, editado ou apagado; ou os dias do protocolo sao
// editados (af eta todos os pacientes vinculados).

import { getNextPendingMilestone, resolvePatientProtocol } from './protocols.js'

// Expressao SQL que deriva urgencia da data materializada. Fica aqui, e nao
// espalhada nas rotas, pra que a regra viva num lugar so — os limiares tem que
// bater com calcProtocolUrgency() do frontend.
export const SQL_URGENCIA = `
  CASE
    WHEN p.status <> 'active' OR p.next_followup_date IS NULL THEN 'none'
    WHEN p.next_followup_date <  date('now') THEN 'overdue'
    WHEN p.next_followup_date =  date('now') THEN 'due'
    WHEN julianday(p.next_followup_date) - julianday(date('now')) <= 2 THEN 'soon'
    ELSE 'ok'
  END
`

// ── Recalculo de um paciente ─────────────────────────────────
export async function recalcularProximoMarco(db, patientId) {
  const paciente = await db.prepare(`
    SELECT
      p.id, p.surgery_date, p.status, p.protocol_id,
      cp.days AS protocol_days_json,
      (SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id AND is_extra_contact = 0) AS followup_count
    FROM patients p
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    WHERE p.id = ?
  `).bind(patientId).first()

  if (!paciente) return null

  const proximaData = calcularProximaData(paciente)

  await db.prepare('UPDATE patients SET next_followup_date = ? WHERE id = ?')
    .bind(proximaData, patientId).run()

  return proximaData
}

// Paciente fora de `active` nao tem proximo contato previsto — a urgencia dele
// e 'none' independentemente de datas.
function calcularProximaData(paciente) {
  if (paciente.status !== 'active' || !paciente.surgery_date) return null

  const resolucao = resolvePatientProtocol(paciente)
  const marco = getNextPendingMilestone(
    paciente.surgery_date,
    resolucao.days,
    paciente.followup_count
  )

  return marco?.dateStr ?? null
}

// ── Recalculo em lote ────────────────────────────────────────
// Usado quando um protocolo e editado (muda o marco de todos os vinculados) e
// pela reconciliacao noturna.
export async function recalcularLote(db, patientIds) {
  let atualizados = 0
  for (const id of patientIds) {
    await recalcularProximoMarco(db, id)
    atualizados += 1
  }
  return atualizados
}

export async function recalcularPorProtocolo(db, protocolId) {
  const { results } = await db.prepare(
    'SELECT id FROM patients WHERE protocol_id = ? AND archived_at IS NULL'
  ).bind(protocolId).all()

  return recalcularLote(db, (results ?? []).map((linha) => linha.id))
}

// ── Reconciliacao noturna ────────────────────────────────────
// Rede de seguranca: cobre o backfill inicial (linhas que nasceram NULL na
// migration) e qualquer caminho de escrita que venha a esquecer o recalculo.
// Prioriza quem nunca foi calculado; depois varre o resto em rodizio, pra que
// o custo por noite seja fixo mesmo com a base grande.
export async function reconciliarProximosMarcos(db, limite = 2000) {
  const { results } = await db.prepare(`
    SELECT id FROM patients
    WHERE archived_at IS NULL AND status = 'active'
    ORDER BY (next_followup_date IS NOT NULL), updated_at
    LIMIT ?
  `).bind(limite).all()

  return recalcularLote(db, (results ?? []).map((linha) => linha.id))
}
