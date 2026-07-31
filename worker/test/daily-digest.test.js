import test from 'node:test'
import assert from 'node:assert/strict'

import {
  runDailyDigest,
  montarAgendaDoAgente,
  montarBarraHtml,
  montarListaAtrasadosHtml,
} from '../src/services/daily-digest.js'
import { criarFakeD1, consultaPor, consultasPor } from './helpers/fakeD1.js'

// O resumo das 20h também roda sem supervisão. A falha típica aqui é silenciosa:
// um agente para de receber e-mail e atribui isso a "o sistema é assim".

const TEMPLATE = {
  tipo: 'daily_digest',
  subject: '{{clinic_name}} — {{agent_name}}',
  body_html: '<p>{{contacts_logged}} contatos · {{tomorrow_total}} amanhã</p>',
  is_enabled: 1,
}

function ambiente(respostas) {
  return { DB: criarFakeD1(respostas), EMAIL_RELAY_URL: '', EMAIL_RELAY_TOKEN: '' }
}

test('runDailyDigest não envia nada com o template desativado', async () => {
  const env = ambiente([
    { match: 'FROM email_templates', first: { ...TEMPLATE, is_enabled: 0 } },
  ])

  const resultado = await runDailyDigest(env)

  assert.equal(resultado.enviados, 0)
  assert.equal(consultaPor(env.DB, 'FROM agents'), undefined, 'nem deveria buscar agentes')
})

test('runDailyDigest não envia nada se o template não existir', async () => {
  const env = ambiente([{ match: 'FROM email_templates', first: null }])

  const resultado = await runDailyDigest(env)

  assert.equal(resultado.enviados, 0)
})

test('runDailyDigest pula agente sem e-mail válido, sem interromper os demais', async () => {
  // A coluna `email` do agente é o login e pode não ser endereço real — foi o
  // caso do admin default até 2026-07-25.
  const env = ambiente([
    { match: 'FROM email_templates', first: TEMPLATE },
    { match: 'FROM agents', results: [
      { id: 'a1', name: 'Sem Email', email: 'admin' },
      { id: 'a2', name: 'Com Email', email: 'ana@clinica.com' },
    ] },
    { match: 'FROM followup_logs', results: [] },
    { match: 'FROM patients p', results: [] },
  ])

  const resultado = await runDailyDigest(env)

  // Os dois entram em `pulados`: o primeiro por e-mail inválido, o segundo
  // porque o relay não está configurado neste ambiente de teste.
  assert.equal(resultado.enviados, 0)
  assert.equal(resultado.pulados, 2)
})

test('runDailyDigest busca só agentes ativos', async () => {
  const env = ambiente([
    { match: 'FROM email_templates', first: TEMPLATE },
    { match: 'FROM agents', results: [] },
  ])

  await runDailyDigest(env)

  assert.match(consultaPor(env.DB, 'FROM agents').sql, /is_active = 1/)
})

test('runDailyDigest conta contatos pela data informada, não pelo created_at', async () => {
  // `contact_date` é quando o contato aconteceu; `created_at` é quando foi
  // digitado. Um contato de ontem registrado hoje pertence a ontem.
  const env = ambiente([
    { match: 'FROM email_templates', first: TEMPLATE },
    { match: 'FROM agents', results: [{ id: 'a1', name: 'Ana', email: 'ana@clinica.com' }] },
    { match: 'FROM followup_logs', results: [{ outcome: 'reached', total: 3 }] },
    { match: 'FROM patients p', results: [] },
  ])

  await runDailyDigest(env)

  const consulta = consultaPor(env.DB, 'FROM followup_logs')
  assert.match(consulta.sql, /contact_date = \?/)
  assert.ok(!/created_at = \?/.test(consulta.sql))
})

test('runDailyDigest monta a agenda a partir dos pacientes do próprio agente', async () => {
  const env = ambiente([
    { match: 'FROM email_templates', first: TEMPLATE },
    { match: 'FROM agents', results: [{ id: 'a1', name: 'Ana', email: 'ana@clinica.com' }] },
    { match: 'FROM followup_logs', results: [] },
    { match: 'FROM patients p', results: [] },
  ])

  await runDailyDigest(env)

  const consulta = consultaPor(env.DB, 'FROM patients p')
  assert.match(consulta.sql, /assigned_agent_id = \?/)
  assert.match(consulta.sql, /status = 'active'/)
  assert.equal(consulta.binds[0], 'a1')
})

test('runDailyDigest usa escopo de clínica inteira para admin, sem filtrar por agente', async () => {
  // Caso real de produção em 2026-07-30: pacientes sem assigned_agent_id e os
  // dois únicos agentes são admin — o resumo por carteira própria dava sempre
  // zero mesmo com atraso real no sistema.
  const env = ambiente([
    { match: 'FROM email_templates', first: TEMPLATE },
    { match: 'FROM agents', results: [{ id: 'admin1', name: 'Admin', email: 'admin@clinica.com', role: 'admin' }] },
    { match: 'FROM followup_logs', results: [] },
    { match: 'FROM patients p', results: [] },
  ])

  await runDailyDigest(env)

  const consulta = consultaPor(env.DB, 'FROM patients p')
  assert.ok(!/assigned_agent_id/.test(consulta.sql), 'admin não deveria filtrar por agente')
  assert.equal(consulta.binds.length, 0, 'sem parâmetro: a consulta não tem WHERE de agente')
})

test('runDailyDigest continua restrito à própria carteira para agente comum', async () => {
  const env = ambiente([
    { match: 'FROM email_templates', first: TEMPLATE },
    { match: 'FROM agents', results: [{ id: 'a1', name: 'Ana', email: 'ana@clinica.com', role: 'agent' }] },
    { match: 'FROM followup_logs', results: [] },
    { match: 'FROM patients p', results: [] },
  ])

  await runDailyDigest(env)

  const consulta = consultaPor(env.DB, 'FROM patients p')
  assert.match(consulta.sql, /assigned_agent_id = \?/)
  assert.equal(consulta.binds[0], 'a1')
})

test('runDailyDigest processa todos os agentes mesmo com falhas no meio', async () => {
  // Um agente falhar não pode impedir os outros de receber.
  const env = ambiente([
    { match: 'FROM email_templates', first: TEMPLATE },
    { match: 'FROM agents', results: [
      { id: 'a1', name: 'Um', email: 'um@clinica.com' },
      { id: 'a2', name: 'Dois', email: 'dois@clinica.com' },
      { id: 'a3', name: 'Tres', email: 'tres@clinica.com' },
    ] },
    { match: 'FROM followup_logs', results: [] },
    { match: 'FROM patients p', results: [] },
  ])

  const resultado = await runDailyDigest(env)

  assert.equal(resultado.enviados + resultado.pulados, 3)
  assert.equal(consultasPor(env.DB, 'FROM patients p').length, 3, 'montou contexto dos três')
})

// ── montarAgendaDoAgente ──────────────────────────────────────

function pacienteFixture({ id, name, surgery_date, protocol_days_json, followup_count = 0 }) {
  return {
    id,
    name,
    surgery_date,
    phone: '(85) 90000-0000',
    procedure: 'Procedimento teste',
    protocol_days_json,
    followup_count,
  }
}

test('montarAgendaDoAgente separa atrasados e pacientes de amanhã na mesma consulta', async () => {
  const hoje = '2026-07-30'
  const amanha = '2026-07-31'
  const env = ambiente([
    { match: 'FROM patients p', results: [
      // marco em 7 dias após a cirurgia: 2026-07-20 + 7 = 2026-07-27, 3 dias atrás de hoje
      pacienteFixture({ id: 'p1', name: 'Atrasado 3d', surgery_date: '2026-07-20', protocol_days_json: '[7]' }),
      // 2026-07-24 + 7 = 2026-07-31, exatamente amanhã
      pacienteFixture({ id: 'p2', name: 'De amanhã', surgery_date: '2026-07-24', protocol_days_json: '[7]' }),
      // 2026-07-29 + 7 = 2026-08-05, nem atrasado nem amanhã — não entra em nenhuma lista
      pacienteFixture({ id: 'p3', name: 'Em dia', surgery_date: '2026-07-29', protocol_days_json: '[7]' }),
    ] },
  ])

  const agenda = await montarAgendaDoAgente(env.DB, { id: 'a1', role: 'agent' }, { hoje, amanha })

  assert.equal(agenda.atrasados.length, 1)
  assert.equal(agenda.atrasados[0].nome, 'Atrasado 3d')
  assert.equal(agenda.atrasados[0].diasAtraso, 3)
  assert.equal(agenda.deAmanha.length, 1)
  assert.equal(agenda.deAmanha[0].nome, 'De amanhã')
})

test('montarAgendaDoAgente ordena atrasados do mais antigo para o mais recente', async () => {
  const hoje = '2026-07-30'
  const env = ambiente([
    { match: 'FROM patients p', results: [
      pacienteFixture({ id: 'p1', name: 'Atrasado 1d', surgery_date: '2026-07-22', protocol_days_json: '[7]' }),
      pacienteFixture({ id: 'p2', name: 'Atrasado 10d', surgery_date: '2026-07-13', protocol_days_json: '[7]' }),
    ] },
  ])

  const agenda = await montarAgendaDoAgente(env.DB, { id: 'a1', role: 'agent' }, { hoje, amanha: '2026-07-31' })

  assert.deepEqual(agenda.atrasados.map((p) => p.nome), ['Atrasado 10d', 'Atrasado 1d'])
})

// ── montarBarraHtml ────────────────────────────────────────────

test('montarBarraHtml mostra estado neutro sem contatos hoje', () => {
  const html = montarBarraHtml({ total: 0, reached: 0, no_answer: 0, callback_scheduled: 0 })
  assert.match(html, /Nenhum contato registrado ainda hoje/)
})

test('montarBarraHtml fecha 100% de largura mesmo com arredondamento', () => {
  // 1/3 arredonda pra 33% em cada segmento — sem o ajuste do último segmento
  // sobrariam 1% de fundo transparente na barra.
  const html = montarBarraHtml({ total: 3, reached: 1, callback_scheduled: 1, no_answer: 1 })
  // <td width="…%">, não a tabela em volta — ela também tem width="100%".
  const larguras = [...html.matchAll(/<td width="(\d+)%"/g)].map((m) => Number(m[1]))
  assert.equal(larguras.length, 3)
  assert.equal(larguras.reduce((soma, valor) => soma + valor, 0), 100)
})

// ── montarListaAtrasadosHtml ─────────────────────────────────

test('montarListaAtrasadosHtml usa tom positivo quando ninguém está atrasado', () => {
  const html = montarListaAtrasadosHtml([])
  assert.match(html, /tudo em dia/)
})

test('montarListaAtrasadosHtml escapa o nome e mostra os dias de atraso', () => {
  const html = montarListaAtrasadosHtml([
    { nome: '<script>alert(1)</script>', telefone: '(85) 90000-0000', procedimento: 'Joelho', diasAtraso: 1 },
  ])
  assert.ok(!html.includes('<script>'), 'nome precisa ser escapado')
  assert.match(html, /1 dia de atraso/)
})
