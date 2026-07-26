// Arquivamento de pacientes que sairam da janela de acompanhamento.
//
// Nao apaga nada: marca `archived_at`. O paciente some das listagens e buscas
// operacionais porque os indices do dia a dia sao parciais
// (WHERE archived_at IS NULL) — e e isso que mantem o indice do tamanho da
// janela ativa em vez do tamanho historico da base.

import { sendEmail } from './email.js'
import { escaparHtml } from '../utils/emailTemplates.js'
import { ajustarContador, CONTADOR_PACIENTES_ATIVOS } from '../utils/contadores.js'

// 6 meses apos a cirurgia, conforme regra clinica passada pelo usuario.
export const JANELA_DE_ACOMPANHAMENTO_MESES = 6

// Teto por execucao: uma primeira rodada numa base ja grande arquivaria dezenas
// de milhares de linhas de uma vez, e o Worker tem limite de tempo/subrequest.
// O que sobrar entra na noite seguinte.
const MAX_POR_EXECUCAO = 500

// ── Arquivar / desarquivar (usado pelo cron e pelas rotas) ───
// A regra de contador mora aqui, num lugar só: arquivar e desarquivar mexem no
// total de ativos, e duplicar essa aritmética nas rotas seria pedir divergência.

export async function arquivarPacientes(db, ids) {
  if (!ids?.length) return 0
  const marcadores = ids.map(() => '?').join(',')

  const { results: alvos } = await db.prepare(
    `SELECT id, status FROM patients WHERE id IN (${marcadores}) AND archived_at IS NULL`
  ).bind(...ids).all()

  if (!alvos?.length) return 0

  const idsReais = alvos.map((p) => p.id)
  await db.prepare(
    `UPDATE patients SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE id IN (${idsReais.map(() => '?').join(',')})`
  ).bind(...idsReais).run()

  // Só quem estava em 'active' contava como ativo.
  const saemDoAtivo = alvos.filter((p) => p.status === 'active').length
  await ajustarContador(db, CONTADOR_PACIENTES_ATIVOS, -saemDoAtivo)

  return idsReais.length
}

export async function desarquivarPacientes(db, ids, { recalcular } = {}) {
  if (!ids?.length) return 0
  const marcadores = ids.map(() => '?').join(',')

  const { results: alvos } = await db.prepare(
    `SELECT id, status FROM patients WHERE id IN (${marcadores}) AND archived_at IS NOT NULL`
  ).bind(...ids).all()

  if (!alvos?.length) return 0

  const idsReais = alvos.map((p) => p.id)
  await db.prepare(
    `UPDATE patients SET archived_at = NULL, updated_at = datetime('now')
     WHERE id IN (${idsReais.map(() => '?').join(',')})`
  ).bind(...idsReais).run()

  // O próximo marco ficou defasado enquanto o paciente esteve fora — devolver
  // sem recalcular deixaria uma data vencida há meses.
  if (recalcular) {
    for (const paciente of alvos) await recalcular(db, paciente.id)
  }

  const voltamAoAtivo = alvos.filter((p) => p.status === 'active').length
  await ajustarContador(db, CONTADOR_PACIENTES_ATIVOS, voltamAoAtivo)

  return idsReais.length
}

export async function runArquivamento(env) {
  console.log('[Arquivamento] Iniciando —', new Date().toISOString())

  const { results: aArquivar } = await env.DB.prepare(`
    SELECT id, name, procedure, surgery_date, phone, email, status
    FROM patients
    WHERE archived_at IS NULL
      AND surgery_date < date('now', ?)
    ORDER BY surgery_date
    LIMIT ?
  `).bind(`-${JANELA_DE_ACOMPANHAMENTO_MESES} months`, MAX_POR_EXECUCAO).all()

  if (!aArquivar?.length) {
    console.log('[Arquivamento] Nenhum paciente fora da janela.')
    return { arquivados: 0 }
  }

  // Mesma função que as rotas de arquivamento manual usam: o ajuste do contador
  // e o filtro de "já arquivado" ficam num lugar só.
  const ids = aArquivar.map((paciente) => paciente.id)
  await arquivarPacientes(env.DB, ids)

  console.log(`[Arquivamento] ${ids.length} paciente(s) arquivado(s).`)

  // O aviso e efeito colateral do arquivamento, nao o contrario: falhar aqui
  // nao pode desfazer nem repetir o que ja foi marcado no banco.
  try {
    await avisarAdmins(env, aArquivar)
  } catch (falhaNoAviso) {
    console.error('[Arquivamento] falha ao enviar o aviso por e-mail', falhaNoAviso)
  }

  return { arquivados: ids.length }
}

async function avisarAdmins(env, pacientesArquivados) {
  const { results: admins } = await env.DB.prepare(
    "SELECT name, email FROM agents WHERE role = 'admin' AND is_active = 1"
  ).all()

  const destinatarios = (admins ?? []).filter((admin) => admin.email?.includes('@'))
  if (!destinatarios.length) {
    console.warn('[Arquivamento] nenhum admin com e-mail válido; aviso não enviado.')
    return
  }

  const html = montarAvisoHtml(pacientesArquivados)

  for (const admin of destinatarios) {
    await sendEmail(env, {
      to: admin.email,
      subject: `CareDesk — ${pacientesArquivados.length} paciente(s) saíram do acompanhamento`,
      html,
    })
  }
}

function montarAvisoHtml(pacientes) {
  const linhas = pacientes.map((paciente) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${escaparHtml(paciente.name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${escaparHtml(paciente.procedure)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${escaparHtml(formatarDataBr(paciente.surgery_date))}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${escaparHtml(paciente.phone || '—')}</td>
    </tr>
  `).join('')

  return `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#1c1b1f; line-height:1.6;">
      <p>Os pacientes abaixo completaram ${JANELA_DE_ACOMPANHAMENTO_MESES} meses de pós-operatório e saíram do acompanhamento ativo.</p>
      <p><strong>Eles continuam no sistema</strong> — apenas deixam de aparecer nas listagens e buscas do dia a dia.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;font-size:14px">
        <thead>
          <tr style="text-align:left;background:#f5f5f5">
            <th style="padding:8px 12px">Paciente</th>
            <th style="padding:8px 12px">Procedimento</th>
            <th style="padding:8px 12px">Cirurgia</th>
            <th style="padding:8px 12px">Telefone</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `.trim()
}

function formatarDataBr(iso) {
  if (!iso) return '—'
  const [ano, mes, dia] = String(iso).split('-')
  return `${dia}/${mes}/${ano}`
}
