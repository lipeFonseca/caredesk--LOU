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
    'SELECT id, name, email, role FROM agents WHERE is_active = 1'
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
    'SELECT id, name, email, role FROM agents WHERE id = ? AND is_active = 1'
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
  const [desempenho, agenda] = await Promise.all([
    contarContatosDoDia(db, agente.id, hoje),
    montarAgendaDoAgente(db, agente, { hoje, amanha }),
  ])

  return {
    agent_name:         agente.name,
    today_date:         formatarDataBr(hoje),
    tomorrow_date:      formatarDataBr(amanha),
    contacts_logged:    desempenho.total,
    reached_count:      desempenho.reached,
    no_answer_count:    desempenho.no_answer,
    callback_count:     desempenho.callback_scheduled,
    today_chart:        montarBarraHtml(desempenho),
    overdue_count:      agenda.atrasados.length,
    overdue_list:       montarListaAtrasadosHtml(agenda.atrasados),
    tomorrow_total:     agenda.deAmanha.length,
    tomorrow_list:      montarListaHtml(agenda.deAmanha),
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

// Reusa a mesma resolucao de protocolo do scheduler e busca uma vez so: quem
// esta atrasado e quem vence amanha saem da mesma passada, sem segunda leitura
// da tabela de pacientes.
//
// Escopo por papel: `admin` enxerga a clinica inteira, como o Dashboard —
// sem isso, um admin com pacientes sem agente atribuido veria o resumo sempre
// zerado mesmo com atraso real no sistema (foi o caso encontrado em producao
// em 2026-07-30: 7 pacientes ativos, nenhum com assigned_agent_id, e os dois
// unicos agentes sao admin). Agente comum continua ve so a propria carteira.
export async function montarAgendaDoAgente(db, agente, { hoje, amanha }) {
  const escopoClinicaInteira = agente.role === 'admin'
  const baseQuery = `
    SELECT
      p.*,
      cp.days AS protocol_days_json,
      cp.name AS protocol_name,
      (
        SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id AND is_extra_contact = 0
      ) AS followup_count
    FROM patients p
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    WHERE p.status = 'active'${escopoClinicaInteira ? '' : ' AND p.assigned_agent_id = ?'}
  `

  const stmt = db.prepare(baseQuery)
  const { results: pacientes } = await (escopoClinicaInteira ? stmt : stmt.bind(agente.id)).all()

  const atrasados = []
  const deAmanha = []

  for (const paciente of pacientes ?? []) {
    const resolucao = resolvePatientProtocol(paciente)
    const proximoMarco = getNextPendingMilestone(
      paciente.surgery_date,
      resolucao.days,
      paciente.followup_count
    )
    if (!proximoMarco) continue

    if (proximoMarco.dateStr < hoje) {
      atrasados.push({
        nome: paciente.name,
        telefone: paciente.phone,
        procedimento: paciente.procedure,
        diasAtraso: diasEntre(hoje, proximoMarco.dateStr),
      })
    } else if (proximoMarco.dateStr === amanha) {
      deAmanha.push({
        nome: paciente.name,
        telefone: paciente.phone,
        procedimento: paciente.procedure,
        marco: proximoMarco.day,
      })
    }
  }

  atrasados.sort((a, b) => b.diasAtraso - a.diasAtraso)

  return { atrasados, deAmanha }
}

function diasEntre(deIso, ateIso) {
  const de = new Date(`${deIso}T12:00:00Z`)
  const ate = new Date(`${ateIso}T12:00:00Z`)
  return Math.round((de - ate) / (1000 * 60 * 60 * 24))
}

// Devolve HTML pronto — e um dos placeholders que nao passa pelo escape geral
// (ver PLACEHOLDERS_DE_HTML_PRONTO em emailTemplates.js), por isso os valores
// sao escapados um a um aqui dentro.
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

export function montarListaAtrasadosHtml(pacientes) {
  if (!pacientes.length) {
    return '<p style="color: #2e7d32;">Nenhum paciente atrasado — tudo em dia.</p>'
  }

  const itens = pacientes.map((paciente) => {
    const telefone = paciente.telefone ? ` — ${escaparHtml(paciente.telefone)}` : ''
    const rotuloAtraso = `${paciente.diasAtraso} ${paciente.diasAtraso === 1 ? 'dia' : 'dias'} de atraso`
    return `<li><strong>${escaparHtml(paciente.nome)}</strong>${telefone}<br>` +
           `<span style="color: #c62828;">${rotuloAtraso}</span> · ` +
           `<span style="color: #6b6b6b;">${escaparHtml(paciente.procedimento)}</span></li>`
  }).join('')

  return `<ul style="padding-left: 18px;">${itens}</ul>`
}

// Barra de progresso em tabela: cliente de e-mail nao roda JS nem renderiza
// SVG/canvas de forma confiavel (Outlook em particular), mas <table> com
// largura e cor de fundo por celula funciona em todos. As tres saidas
// possiveis (reached/no_answer/callback_scheduled, ver schema.sql) sempre
// somam o total, entao as larguras fecham 100% sem sobra.
export function montarBarraHtml(desempenho) {
  const { total, reached, no_answer, callback_scheduled } = desempenho
  if (total === 0) {
    return '<p style="color: #6b6b6b;">Nenhum contato registrado ainda hoje.</p>'
  }

  const segmentos = [
    { valor: reached, cor: '#2e7d32', rotulo: 'Alcançados' },
    { valor: callback_scheduled, cor: '#ef6c00', rotulo: 'Retorno agendado' },
    { valor: no_answer, cor: '#c62828', rotulo: 'Sem resposta' },
  ].filter((segmento) => segmento.valor > 0)

  let larguraUsada = 0
  const celulas = segmentos.map((segmento, indice) => {
    // Ultimo segmento fecha com o resto: arredondar cada fatia isoladamente
    // podia deixar 1-2% de fundo transparente sobrando na linha.
    const largura = indice === segmentos.length - 1
      ? 100 - larguraUsada
      : Math.round((segmento.valor / total) * 100)
    larguraUsada += largura
    return `<td width="${largura}%" bgcolor="${segmento.cor}" style="background:${segmento.cor};font-size:1px;line-height:12px;">&nbsp;</td>`
  }).join('')

  const legenda = segmentos.map((segmento) => (
    `<span style="display:inline-block;margin-right:16px;color:#4a4a4a;font-size:13px;">` +
    `<span style="display:inline-block;width:10px;height:10px;background:${segmento.cor};margin-right:6px;"></span>` +
    `${segmento.rotulo}: <strong>${segmento.valor}</strong></span>`
  )).join('')

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr height="12">${celulas}</tr></table>` +
    `<p style="margin:8px 0 0;">${legenda}</p>`
  )
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
