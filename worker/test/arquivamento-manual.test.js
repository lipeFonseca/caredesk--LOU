import test from 'node:test'
import assert from 'node:assert/strict'

import { arquivarPacientes, desarquivarPacientes } from '../src/services/arquivamento.js'
import { criarFakeD1, consultaPor } from './helpers/fakeD1.js'

// Arquivar e desarquivar manualmente ficaram disponíveis para o agente, não só
// para o admin: quem faz o contato é quem sabe se o acompanhamento acabou. As
// duas ações são reversíveis uma pela outra e não perdem dado.

function db(alvos) {
  return criarFakeD1([{ match: 'SELECT id, status FROM patients', results: alvos }])
}

// ── Arquivar ─────────────────────────────────────────────────

test('arquivarPacientes não faz nada com lista vazia', async () => {
  const fake = db([])
  assert.equal(await arquivarPacientes(fake, []), 0)
  assert.equal(fake.executadas.length, 0, 'nem deveria consultar')
})

test('arquivarPacientes ignora quem já está arquivado', async () => {
  // O filtro está na consulta: só entra quem tem archived_at nulo.
  const fake = db([])

  assert.equal(await arquivarPacientes(fake, ['ja-arquivado']), 0)
  assert.match(consultaPor(fake, 'SELECT id, status').sql, /archived_at IS NULL/)
})

test('arquivarPacientes marca a data em vez de apagar', async () => {
  const fake = db([{ id: 'p1', status: 'active' }])

  const total = await arquivarPacientes(fake, ['p1'])

  assert.equal(total, 1)
  assert.ok(consultaPor(fake, "SET archived_at = datetime('now')"))
  assert.equal(consultaPor(fake, 'DELETE FROM patients'), undefined)
})

test('arquivarPacientes só desconta do contador quem estava ativo', async () => {
  // Paciente em 'discharged' não contava como ativo; arquivá-lo não pode
  // decrementar o contador de novo.
  const fake = db([
    { id: 'p1', status: 'active' },
    { id: 'p2', status: 'discharged' },
    { id: 'p3', status: 'active' },
  ])

  await arquivarPacientes(fake, ['p1', 'p2', 'p3'])

  const contador = consultaPor(fake, 'system_counters')
  assert.equal(contador.binds[2], -2, 'dois ativos saíram, não três')
})

// ── Desarquivar ──────────────────────────────────────────────

test('desarquivarPacientes ignora quem já está ativo', async () => {
  const fake = db([])

  assert.equal(await desarquivarPacientes(fake, ['ja-ativo']), 0)
  assert.match(consultaPor(fake, 'SELECT id, status').sql, /archived_at IS NOT NULL/)
})

test('desarquivarPacientes limpa a data de arquivamento', async () => {
  const fake = db([{ id: 'p1', status: 'active' }])

  const total = await desarquivarPacientes(fake, ['p1'])

  assert.equal(total, 1)
  assert.ok(consultaPor(fake, 'SET archived_at = NULL'))
})

test('desarquivarPacientes recalcula o próximo marco de cada um', async () => {
  // A data ficou defasada enquanto o paciente esteve fora: devolver sem
  // recalcular deixaria um marco vencido há meses.
  const recalculados = []
  const fake = db([{ id: 'p1', status: 'active' }, { id: 'p2', status: 'active' }])

  await desarquivarPacientes(fake, ['p1', 'p2'], {
    recalcular: async (_db, id) => { recalculados.push(id) },
  })

  assert.deepEqual(recalculados, ['p1', 'p2'])
})

test('desarquivarPacientes só devolve ao contador quem está ativo', async () => {
  const fake = db([
    { id: 'p1', status: 'active' },
    { id: 'p2', status: 'discharged' },
  ])

  await desarquivarPacientes(fake, ['p1', 'p2'])

  const contador = consultaPor(fake, 'system_counters')
  assert.equal(contador.binds[2], 1, 'só o ativo volta para a contagem')
})

test('arquivar e desarquivar são simétricos no contador', async () => {
  // Ida e volta do mesmo paciente tem de deixar a contagem onde estava.
  const idaFake = db([{ id: 'p1', status: 'active' }])
  const voltaFake = db([{ id: 'p1', status: 'active' }])

  await arquivarPacientes(idaFake, ['p1'])
  await desarquivarPacientes(voltaFake, ['p1'])

  const ida = consultaPor(idaFake, 'system_counters').binds[2]
  const volta = consultaPor(voltaFake, 'system_counters').binds[2]
  assert.equal(ida + volta, 0)
})
