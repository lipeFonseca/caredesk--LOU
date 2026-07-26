import test from 'node:test'
import assert from 'node:assert/strict'

import { runDailyDigest } from '../src/services/daily-digest.js'
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
