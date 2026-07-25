import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifySearchTerm,
  buildFtsQuery,
  encodeCursor,
  decodeCursor,
  normalizePageSize,
  buildPatientFilters,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../src/utils/patientQuery.js'

// ── Classificacao da busca ───────────────────────────────────

test('classifySearchTerm trata termo vazio como ausencia de busca', () => {
  assert.equal(classifySearchTerm('').kind, 'none')
  assert.equal(classifySearchTerm('   ').kind, 'none')
  assert.equal(classifySearchTerm(undefined).kind, 'none')
})

test('classifySearchTerm reconhece telefone mesmo pontuado', () => {
  assert.deepEqual(classifySearchTerm('(85) 98877-6655'), { kind: 'phone', digits: '85988776655' })
  assert.deepEqual(classifySearchTerm('98877'), { kind: 'phone', digits: '98877' })
})

test('classifySearchTerm manda nome pro FTS, mesmo com numero junto', () => {
  assert.equal(classifySearchTerm('Maria').kind, 'text')
  // Nome com numero (ex: "Ana 2") nao pode virar busca de telefone.
  assert.equal(classifySearchTerm('Ana 2').kind, 'text')
  // Poucos digitos nao caracterizam telefone.
  assert.equal(classifySearchTerm('123').kind, 'text')
})

test('buildFtsQuery transforma cada palavra em prefixo obrigatorio', () => {
  assert.equal(buildFtsQuery('maria souza'), '"maria"* AND "souza"*')
  assert.equal(buildFtsQuery('  ana  '), '"ana"*')
})

test('buildFtsQuery neutraliza sintaxe do FTS digitada pelo usuario', () => {
  // Sem escapar, um `*` ou aspas soltas viram operador e a query estoura.
  assert.equal(buildFtsQuery('ma"ria'), '"maria"*')
  assert.equal(buildFtsQuery('ana*'), '"ana"*')
  assert.equal(buildFtsQuery('""'), '')
})

// ── Cursor ───────────────────────────────────────────────────

test('encodeCursor e decodeCursor sao simetricos', () => {
  const posicao = { surgery_date: '2026-07-20', id: 'abc-123' }
  assert.deepEqual(decodeCursor(encodeCursor(posicao)), posicao)
})

test('decodeCursor devolve null pra cursor ausente ou corrompido', () => {
  // Cursor forjado nao pode derrubar a listagem — o pior caso e recomecar.
  assert.equal(decodeCursor(undefined), null)
  assert.equal(decodeCursor(''), null)
  assert.equal(decodeCursor('nao-e-base64-valido!!!'), null)
  assert.equal(decodeCursor(btoa('sem-separador')), null)
})

// ── Tamanho de pagina ────────────────────────────────────────

test('normalizePageSize aplica padrao, piso e teto', () => {
  assert.equal(normalizePageSize(undefined), DEFAULT_PAGE_SIZE)
  assert.equal(normalizePageSize('abc'), DEFAULT_PAGE_SIZE)
  assert.equal(normalizePageSize('50'), 50)
  assert.equal(normalizePageSize('0'), 1)
  assert.equal(normalizePageSize('9999'), MAX_PAGE_SIZE)
})

// ── Filtros ──────────────────────────────────────────────────

test('buildPatientFilters exclui arquivados por padrao', () => {
  // Esse predicado nao muda so o resultado: e ele que torna os indices
  // parciais elegiveis.
  const { sql, binds } = buildPatientFilters({})

  assert.match(sql, /p\.archived_at IS NULL/)
  assert.deepEqual(binds, [])
})

test('buildPatientFilters inclui arquivados quando pedido', () => {
  const { sql } = buildPatientFilters({ includeArchived: true })
  assert.ok(!sql.includes('archived_at'))
})

test('buildPatientFilters acumula filtros na ordem dos binds', () => {
  const { sql, binds } = buildPatientFilters({
    status: 'active',
    agent_id: 'ag-1',
    from: '2026-01-01',
    to: '2026-12-31',
  })

  assert.match(sql, /p\.status = \?/)
  assert.deepEqual(binds, ['active', 'ag-1', '2026-01-01', '2026-12-31'])
})
