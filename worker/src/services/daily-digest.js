// Resumo noturno enviado a cada agente: o que ele fez hoje + quem ele precisa
// contatar amanha. Roda no cron das 20h de Fortaleza.

import { getNextPendingMilestone, resolvePatientProtocol } from '../utils/protocols.js'
import { loadEmailTemplate, renderEmailTemplate, escaparHtml } from '../utils/emailTemplates.js'
import { sendEmail } from './email.js'

// ASSUME: fuso America/Fortaleza (UTC-3 o ano inteiro, sem horario de verao).
// O cron dispara 23:00 UTC = 20:00 local, entao "hoje" precisa ser calculado no
// fuso local — em UTC ja seria o dia seguinte a partir das 21h local.
const FORTALEZA_OFFSET_HORAS = -3

export async function runDailyDigest(env) {
  console.log('[Digest] Iniciando resumo noturno —', new Date().toISOString())

  const template = await loadEmailTemplate(env.DB, 'daily_digest')
  if (!template || !template.is_enabled) {
    console.log('[Digest] template daily_digest ausente ou desativado; nada a enviar.')
    return { enviados: 0, pulados: 0 }
  }

  const hoje = dataLocalIso(0)
  const amanha = dataLocalIso(1)
  const nomeDaClinica = await lerNomeDaClinica(env.DB)

  const { results: agentes } = await env.DB.prepare(
    'SELECT id, name, email FROM agents WHERE is_active = 1'
  ).all()

  let enviados = 0
  let pulados = 0

  for (const agente of agentes ?? []) {
    // Coluna `email` do agente e o login e pode nao ser endereco real (foi o
    // caso do admin default ate 2026-07-25).
    if (!agente.email?.includes('@')) {
      console.warn(`[Digest] agente ${agente.id} sem e-mail valido; pulando.`)
      pulados += 1
      continue
    }

    try {
      const contexto = await montarContextoDoAgente(env.DB, agente, { hoje, amanha, nomeDaClinica })
      const { subject, html } = renderEmailTemplate(template, contexto)

      await sendEmail(env, { to: agente.email, subject, html })
      enviados += 1
    } catch (falha) {
      // Um agente falhar nao pode impedir os outros de receber.
      console.error(`[Digest] falha ao enviar para ${agente.id}`, falha)
      pulados += 1
    }
  }

  console.log(`[Digest] Concluído. ${enviados} enviado(s), ${pulados} pulado(s).`)
  return { enviados, pulados }
}

// ── Envio avulso (botao de teste no painel) ──────────────────
// Mesmo conteudo do cron, para um agente so. Sem isso, conferir o resultado de
// uma edicao de template exigiria esperar as 20h.
export async function sendDigestToAgent(env, agentId) {
  const agente = await env.DB.prepare(
    'SELECT id, name, email FROM agents WHERE id = ? AND is_active = 1'
  ).bind(agentId).first()

  if (!agente) throw new Error('Agente não encontrado ou inativo')
  if (!agente.email?.includes('@')) {
    throw new Error('Sua conta não tem um e-mail válido cadastrado')
  }

  const template = await loadEmailTemplate(env.DB, 'daily_digest')
  if (!template) throw new Error('Template do resumo diário não encontrado')

  const contexto = await montarContextoDoAgente(env.DB, agente, {
    hoje: dataLocalIso(0),
    amanha: dataLocalIso(1),
    nomeDaClinica: await lerNomeDaClinica(env.DB),
  })

  const { subject, html } = renderEmailTemplate(template, contexto)
  const resultado = await sendEmail(env, { to: agente.email, subject, html })

  return { sentTo: agente.email, remainingQuota: resultado?.remainingQuota ?? null }
}

// ── Contexto de um agente ────────────────────────────────────

async function montarContextoDoAgente(db, agente, { hoje, amanha, nomeDaClinica }) {
  const [desempenho, pacientesDeAmanha] = await Promise.all([
    contarContatosDoDia(db, agente.id, hoje),
    listarPacientesDeAmanha(db, agente.id, amanha),
  ])

  return {
    agent_name:         agente.name,
    today_date:         formatarDataBr(hoje),
    tomorrow_date:      formatarDataBr(amanha),
    contacts_logged:    desempenho.total,
    reached_count:      desempenho.reached,
    no_answer_count:    desempenho.no_answer,
    callback_count:     desempenho.callback_scheduled,
    tomorrow_total:     pacientesDeAmanha.length,
    tomorrow_list:      montarListaHtml(pacientesDeAmanha),
    clinic_name:        nomeDaClinica,
  }
}

// `contact_date` e a data que o agente informou no registro, nao o created_at —
// e ela que representa quando o contato aconteceu de fato.
async function contarContatosDoDia(db, agentId, hoje) {
  const { results } = await db.prepare(`
    SELECT outcome, COUNT(*) AS total
    FROM followup_logs
    WHERE agent_id = ? AND contact_date = ?
    GROUP BY outcome
  `).bind(agentId, hoje).all()

  const porResultado = Object.fromEntries((results ?? []).map((linha) => [linha.outcome, linha.total]))

  return {
    total:              (results ?? []).reduce((soma, linha) => soma + linha.total, 0),
    reached:            porResultado.reached ?? 0,
    no_answer:          porResultado.no_answer ?? 0,
    callback_scheduled: porResultado.callback_scheduled ?? 0,
  }
}

// Reusa a mesma resolucao de protocolo do scheduler: quem vence amanha e quem
// tem o proximo marco pendente caindo naquela data.
async function listarPacientesDeAmanha(db, agentId, amanha) {
  const { results: pacientes } = await db.prepare(`
    SELECT
      p.*,
      cp.days AS protocol_days_json,
      cp.name AS protocol_name,
      (
        SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id AND is_extra_contact = 0
      ) AS followup_count
    FROM patients p
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    WHERE p.status = 'active' AND p.assigned_agent_id = ?
  `).bind(agentId).all()

  const deAmanha = []
  for (const paciente of pacientes ?? []) {
    const resolucao = resolvePatientProtocol(paciente)
    const proximoMarco = getNextPendingMilestone(
      paciente.surgery_date,
      resolucao.days,
      paciente.followup_count
    )

    if (proximoMarco?.dateStr === amanha) {
      deAmanha.push({
        nome: paciente.name,
        telefone: paciente.phone,
        procedimento: paciente.procedure,
        marco: proximoMarco.day,
      })
    }
  }

  return deAmanha
}

// Devolve HTML pronto — e o unico placeholder que nao passa pelo escape, por
// isso os valores sao escapados um a um aqui dentro.
function montarListaHtml(pacientes) {
  if (!pacientes.length) {
    return '<p style="color: #6b6b6b;">Nenhum paciente com contato previsto para amanhã.</p>'
  }

  const itens = pacientes.map((paciente) => {
    const telefone = paciente.telefone ? ` — ${escaparHtml(paciente.telefone)}` : ''
    return `<li><strong>${escaparHtml(paciente.nome)}</strong>${telefone}<br>` +
           `<span style="color: #6b6b6b;">${escaparHtml(paciente.procedimento)} · ${paciente.marco} dia(s) de pós-operatório</span></li>`
  }).join('')

  return `<ul style="padding-left: 18px;">${itens}</ul>`
}

// ── Datas ────────────────────────────────────────────────────

function dataLocalIso(somarDias = 0) {
  const agora = new Date()
  const local = new Date(agora.getTime() + FORTALEZA_OFFSET_HORAS * 60 * 60 * 1000)
  local.setUTCDate(local.getUTCDate() + somarDias)
  return local.toISOString().split('T')[0]
}

function formatarDataBr(iso) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

async function lerNomeDaClinica(db) {
  const linha = await db.prepare("SELECT value FROM app_settings WHERE key = 'clinic_name'").first()
  return linha?.value || 'CareDesk'
}
