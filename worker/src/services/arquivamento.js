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

  const ids = aArquivar.map((paciente) => paciente.id)
  await env.DB.prepare(`
    UPDATE patients SET archived_at = datetime('now')
    WHERE id IN (${ids.map(() => '?').join(',')})
  `).bind(...ids).run()

  // Arquivar tira o paciente da contagem de ativos.
  const ativosArquivados = aArquivar.filter((paciente) => paciente.status === 'active').length
  await ajustarContador(env.DB, CONTADOR_PACIENTES_ATIVOS, -ativosArquivados)

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
