import test from 'node:test'
import assert from 'node:assert/strict'

import {
  valorSql,
  linhasComoObjetos,
  construirInsertsSql,
  buscarExport,
  PLACEHOLDER_PASSWORD_HASH,
} from '../scripts/restore-from-backup.js'
import { TABELAS_BACKUP } from '../src/services/sheetsBackup.js'

// ── valorSql ─────────────────────────────────────────────────

test('valorSql trata null/undefined/vazio como NULL', () => {
  assert.equal(valorSql(null), 'NULL')
  assert.equal(valorSql(undefined), 'NULL')
  assert.equal(valorSql(''), 'NULL')
})

test('valorSql escapa aspas simples pra nao quebrar o INSERT', () => {
  assert.equal(valorSql("O'Brien"), "'O''Brien'")
})

test('valorSql preserva número sem aspas', () => {
  assert.equal(valorSql(1), '1')
  assert.equal(valorSql(0), '0')
})

// ── linhasComoObjetos ────────────────────────────────────────

test('linhasComoObjetos casa cada linha com o cabeçalho pela posição', () => {
  const sheet = { headers: ['id', 'name'], rows: [['p1', 'Ana'], ['p2', 'Beto']] }
  assert.deepEqual(linhasComoObjetos(sheet), [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Beto' }])
})

test('linhasComoObjetos devolve lista vazia pra aba ausente ou sem dado', () => {
  assert.deepEqual(linhasComoObjetos(undefined), [])
  assert.deepEqual(linhasComoObjetos({ headers: [], rows: [] }), [])
})

// ── construirInsertsSql ────────────────────────────────────────

test('construirInsertsSql monta INSERT OR IGNORE com as colunas na ordem certa', () => {
  const objetos = [{ id: 'p1', name: 'Ana' }]
  const [sql] = construirInsertsSql('patients', ['id', 'name'], objetos)
  assert.equal(sql, "INSERT OR IGNORE INTO patients (id, name) VALUES ('p1', 'Ana');")
})

test('construirInsertsSql divide em lotes de até 100 linhas', () => {
  const objetos = Array.from({ length: 250 }, (_, i) => ({ id: `p${i}` }))
  const comandos = construirInsertsSql('patients', ['id'], objetos)
  assert.equal(comandos.length, 3)
  // +1 em cada contagem: o "(" da lista de colunas (`INTO patients (id)`),
  // além de um por linha inserida.
  assert.equal((comandos[0].match(/\(/g).length), 101)
  assert.equal((comandos[1].match(/\(/g).length), 101)
  assert.equal((comandos[2].match(/\(/g).length), 51)
})

test('construirInsertsSql não gera comando nenhum pra lista vazia', () => {
  assert.deepEqual(construirInsertsSql('patients', ['id'], []), [])
})

test('construirInsertsSql: agents recebe password_hash placeholder, nunca vindo do backup', () => {
  const objetos = [{ id: 'a1', name: 'Ana', email: 'ana@x.com' }]
  const colunasFixas = { password_hash: PLACEHOLDER_PASSWORD_HASH }
  const [sql] = construirInsertsSql('agents', ['id', 'name', 'email'], objetos, colunasFixas)
  assert.match(sql, /password_hash/)
  assert.match(sql, /\$PLACEHOLDER_HASH\$/)
})

// ── Ordem de dependência (FK) ──────────────────────────────────

test('TABELAS_BACKUP respeita a ordem agents → contact_protocols → patients → followup_logs', () => {
  assert.deepEqual(TABELAS_BACKUP.map((t) => t.table), ['agents', 'contact_protocols', 'patients', 'followup_logs'])
})

// ── buscarExport ────────────────────────────────────────────────

test('buscarExport manda o token no corpo e devolve as abas', async () => {
  let requisicao = null
  globalThis.fetch = async (url, opcoes) => {
    requisicao = { url, opcoes }
    return { ok: true, async text() { return JSON.stringify({ ok: true, sheets: { Pacientes: { headers: [], rows: [] } } }) } }
  }

  const sheets = await buscarExport('https://script.google.com/exec', 'tok')

  assert.equal(JSON.parse(requisicao.opcoes.body).token, 'tok')
  assert.equal(JSON.parse(requisicao.opcoes.body).action, 'export_for_restore')
  assert.ok(sheets.Pacientes)
})

test('buscarExport rejeita quando o Apps Script devolve ok:false', async () => {
  globalThis.fetch = async () => ({ ok: true, async text() { return JSON.stringify({ ok: false, error: 'unauthorized' }) } })

  await assert.rejects(() => buscarExport('https://script.google.com/exec', 'tok-errado'), /unauthorized/)
})
