import test from 'node:test'
import assert from 'node:assert/strict'

import { runArquivamento, JANELA_DE_ACOMPANHAMENTO_MESES } from '../src/services/arquivamento.js'
import { criarFakeD1, consultaPor } from './helpers/fakeD1.js'

// Este serviço roda de madrugada, sem ninguém olhando. Se ele parar de
// selecionar corretamente, o paciente fica na lista para sempre e os índices
// parciais perdem o sentido — e nada na tela denuncia isso.

const PACIENTE_VENCIDO = {
  id: 'p1', name: 'Ana', procedure: 'Artroscopia',
  surgery_date: '2025-01-10', phone: '(85) 99999-0000', email: null, status: 'active',
}

function ambiente(respostas) {
  return { DB: criarFakeD1(respostas), EMAIL_RELAY_URL: '', EMAIL_RELAY_TOKEN: '' }
}

test('runArquivamento não faz nada quando ninguém saiu da janela', async () => {
  const env = ambiente([{ match: 'FROM patients', results: [] }])

  const resultado = await runArquivamento(env)

  assert.equal(resultado.arquivados, 0)
  assert.equal(consultaPor(env.DB, 'UPDATE patients SET archived_at'), undefined)
})

test('runArquivamento seleciona pela janela de acompanhamento configurada', async () => {
  const env = ambiente([{ match: 'FROM patients', results: [PACIENTE_VENCIDO] }])

  await runArquivamento(env)

  const selecao = consultaPor(env.DB, 'archived_at IS NULL')
  assert.match(selecao.sql, /surgery_date < date\('now', \?\)/)
  assert.equal(selecao.binds[0], `-${JANELA_DE_ACOMPANHAMENTO_MESES} months`)
})

test('runArquivamento respeita um teto por execução', async () => {
  // Sem teto, a primeira rodada numa base grande arquivaria dezenas de milhares
  // de linhas de uma vez e estouraria o tempo do Worker.
  const env = ambiente([{ match: 'FROM patients', results: [PACIENTE_VENCIDO] }])

  await runArquivamento(env)

  const selecao = consultaPor(env.DB, 'archived_at IS NULL')
  const teto = selecao.binds[1]
  assert.ok(Number.isInteger(teto) && teto > 0, 'deveria passar um LIMIT numérico')
})

test('runArquivamento marca archived_at em vez de apagar', async () => {
  // Dado de paciente nunca some por decurso de prazo — só por exclusão explícita.
  const env = ambiente([{ match: 'FROM patients', results: [PACIENTE_VENCIDO] }])

  await runArquivamento(env)

  assert.ok(consultaPor(env.DB, "SET archived_at = datetime('now')"))
  assert.equal(consultaPor(env.DB, 'DELETE FROM patients'), undefined)
})

test('runArquivamento desconta os arquivados do contador de ativos', async () => {
  const env = ambiente([{ match: 'FROM patients', results: [PACIENTE_VENCIDO] }])

  await runArquivamento(env)

  const contador = consultaPor(env.DB, 'system_counters')
  assert.ok(contador, 'contador de ativos deveria ser ajustado')
  assert.ok(contador.binds.includes('patients_active'))
})

test('runArquivamento conclui mesmo sem admin com e-mail para avisar', async () => {
  // O aviso é efeito colateral: falhar nele não pode desfazer nem repetir o que
  // já foi marcado no banco.
  const env = ambiente([
    { match: 'FROM patients', results: [PACIENTE_VENCIDO] },
    { match: 'FROM agents', results: [] },
  ])

  const resultado = await runArquivamento(env)

  assert.equal(resultado.arquivados, 1)
})

test('runArquivamento não deixa o erro de envio derrubar o arquivamento', async () => {
  // Sem relay configurado, sendEmail lança. O arquivamento já aconteceu.
  const env = ambiente([
    { match: 'FROM patients', results: [PACIENTE_VENCIDO] },
    { match: 'FROM agents', results: [{ name: 'Admin', email: 'admin@clinica.com' }] },
  ])

  const resultado = await runArquivamento(env)

  assert.equal(resultado.arquivados, 1)
})
