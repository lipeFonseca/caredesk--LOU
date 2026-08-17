import test from 'node:test'
import assert from 'node:assert/strict'

import { runDailyBackup, montarLinhas } from '../src/services/sheetsBackup.js'
import { criarFakeD1, consultaPor, consultasPor } from './helpers/fakeD1.js'

function dbFeliz(extras = {}) {
  const {
    agents = [],
    protocols = [],
    patients = [],
    followups = [],
    marcaDagua = '1970-01-01 00:00:00',
  } = extras

  return criarFakeD1([
    { match: 'key IN', results: [
      { key: 'backup_enabled', value: '1' },
      { key: 'backup_relay_url', value: 'https://script.google.com/exec' },
      { key: 'backup_relay_token', value: 'tok-backup' },
    ] },
    { match: 'WHERE key = ?', results: [{ value: marcaDagua }] },
    { match: 'FROM agents', results: agents },
    { match: 'FROM contact_protocols', results: protocols },
    { match: 'FROM patients', results: patients },
    { match: 'FROM followup_logs', results: followups },
  ])
}

function mockFetchOk() {
  const requisicoes = []
  globalThis.fetch = async (url, opcoes) => {
    requisicoes.push({ url, opcoes, corpo: JSON.parse(opcoes.body) })
    return { ok: true, async text() { return JSON.stringify({ ok: true }) } }
  }
  return requisicoes
}

// ── Config desligada/ausente ────────────────────────────────────

test('runDailyBackup não chama a rede quando backup_enabled não é "1"', async () => {
  const requisicoes = mockFetchOk()
  const db = criarFakeD1([
    { match: 'key IN', results: [{ key: 'backup_enabled', value: '0' }] },
  ])

  const resultado = await runDailyBackup({ DB: db })

  assert.equal(resultado.skipped, true)
  assert.equal(requisicoes.length, 0)
})

test('runDailyBackup não chama a rede sem URL ou token configurados', async () => {
  const requisicoes = mockFetchOk()
  const db = criarFakeD1([
    { match: 'key IN', results: [
      { key: 'backup_enabled', value: '1' },
      { key: 'backup_relay_url', value: '' },
      { key: 'backup_relay_token', value: '' },
    ] },
  ])

  const resultado = await runDailyBackup({ DB: db })

  assert.equal(resultado.skipped, true)
  assert.equal(requisicoes.length, 0)
})

// ── Caminho feliz ────────────────────────────────────────────────

const UM_FOLLOWUP = [{
  id: 'f1', patient_id: 'p1', agent_id: 'a1', agent_name_snapshot: 'Ana',
  contact_date: '2026-08-01', contact_type: 'call', outcome: 'reached',
  notes: null, next_followup_date: null, is_extra_contact: 0, is_backfilled: 0,
  created_at: '2026-08-01 10:00:00',
}]

test('runDailyBackup exporta as 4 tabelas com a action certa e token no corpo, nunca em header', async () => {
  const requisicoes = mockFetchOk()
  const db = dbFeliz({
    agents: [{ id: 'a1', name: 'Ana', email: 'ana@x.com', phone: null, role: 'admin', is_active: 1, avatar_url: null, created_at: '2026-01-01 00:00:00' }],
    followups: UM_FOLLOWUP,
  })

  const resultado = await runDailyBackup({ DB: db })

  assert.equal(resultado.skipped, false)
  const actions = requisicoes.map((r) => r.corpo.action)
  assert.deepEqual(actions, ['backup_agents', 'backup_protocols', 'backup_patients', 'backup_followups'])

  for (const r of requisicoes) {
    assert.equal(r.corpo.token, 'tok-backup')
    assert.equal(r.opcoes.headers.Authorization, undefined)
  }
})

test('runDailyBackup: tabelas de estado atual usam mode overwrite; contatos usa append', async () => {
  const requisicoes = mockFetchOk()
  const db = dbFeliz({ followups: UM_FOLLOWUP })

  await runDailyBackup({ DB: db })

  const porAction = Object.fromEntries(requisicoes.map((r) => [r.corpo.action, r.corpo.mode]))
  assert.equal(porAction.backup_agents, 'overwrite')
  assert.equal(porAction.backup_protocols, 'overwrite')
  assert.equal(porAction.backup_patients, 'overwrite')
  assert.equal(porAction.backup_followups, 'append')
})

test('runDailyBackup: tabela vazia ainda manda um lote (chunk 0) pra criar a aba com cabeçalho', async () => {
  const requisicoes = mockFetchOk()
  const db = dbFeliz()

  await runDailyBackup({ DB: db })

  const loteAgents = requisicoes.find((r) => r.corpo.action === 'backup_agents')
  assert.deepEqual(loteAgents.corpo.rows, [])
  assert.deepEqual(loteAgents.corpo.headers, ['id', 'name', 'email', 'phone', 'role', 'is_active', 'avatar_url', 'created_at'])
})

// ── followup_logs incremental ─────────────────────────────────

test('runDailyBackup: followups usa a marca d\'água salva como início da janela', async () => {
  mockFetchOk()
  const db = dbFeliz({ marcaDagua: '2026-08-10 00:00:00' })

  await runDailyBackup({ DB: db })

  const consultaFollowups = consultasPor(db, 'FROM followup_logs')[0]
  assert.equal(consultaFollowups.binds[0], '2026-08-10 00:00:00')
})

test('runDailyBackup: avança a marca d\'água só depois que o backup inteiro é confirmado', async () => {
  mockFetchOk()
  const db = dbFeliz()

  await runDailyBackup({ DB: db })

  const gravacao = consultaPor(db, 'INSERT INTO app_settings')
  assert.ok(gravacao, 'esperava um INSERT/UPDATE em app_settings gravando a marca d\'água')
  assert.equal(gravacao.binds[0], 'backup_followup_logs_synced_until')
})

test('runDailyBackup: falha no meio do lote não avança a marca d\'água (próxima rodada reenvia, nunca pula)', async () => {
  globalThis.fetch = async (url, opcoes) => {
    const corpo = JSON.parse(opcoes.body)
    if (corpo.action === 'backup_followups') {
      return { ok: true, async text() { return JSON.stringify({ ok: false, error: 'falha simulada' }) } }
    }
    return { ok: true, async text() { return JSON.stringify({ ok: true }) } }
  }
  const db = dbFeliz({ followups: UM_FOLLOWUP })

  await assert.rejects(() => runDailyBackup({ DB: db }), /falha simulada/)

  const gravacao = consultaPor(db, 'INSERT INTO app_settings')
  assert.equal(gravacao, undefined)
})

// ── Modo "apenas agents" (botão Testar conexão) ─────────────────

test('runDailyBackup com apenasAgents só exporta a aba Agentes', async () => {
  const requisicoes = mockFetchOk()
  const db = dbFeliz()

  const resultado = await runDailyBackup({ DB: db }, { apenasAgents: true })

  assert.equal(requisicoes.length, 1)
  assert.equal(requisicoes[0].corpo.action, 'backup_agents')
  assert.ok(resultado.agents)
  assert.equal(resultado.protocols, undefined)
})

// ── Helper puro ──────────────────────────────────────────────────

test('montarLinhas converte null/undefined em string vazia, preserva o resto', () => {
  const linhas = montarLinhas(['a', 'b', 'c'], [{ a: 1, b: null, c: undefined }, { a: 'x', b: 'y', c: 0 }])
  assert.deepEqual(linhas, [[1, '', ''], ['x', 'y', 0]])
})
