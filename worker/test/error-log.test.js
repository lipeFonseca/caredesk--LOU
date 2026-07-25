import test from 'node:test'
import assert from 'node:assert/strict'

import { recordServerError, purgeOldErrorLogs, RETENTION_DAYS } from '../src/services/error-log.js'

// D1 falso: guarda o SQL e os parametros de cada prepare().bind().run().
function fakeDb({ falharNoRun = false, changes = 0 } = {}) {
  const chamadas = []
  return {
    chamadas,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              if (falharNoRun) throw new Error('D1 indisponivel')
              chamadas.push({ sql, params })
              return { meta: { changes } }
            },
          }
        },
      }
    },
  }
}

function fakeContext({ agent = null, ip = null } = {}) {
  return {
    get: (chave) => (chave === 'agent' ? agent : null),
    req: {
      method: 'POST',
      path: '/api/patients',
      header: (nome) => (nome === 'CF-Connecting-IP' ? ip : null),
    },
  }
}

test('recordServerError grava rota, autor e IP do erro', async () => {
  const DB = fakeDb()
  const contexto = fakeContext({
    agent: { id: 'agente-1', email: 'admin@clinica.com' },
    ip: '203.0.113.7',
  })

  await recordServerError({ DB }, new Error('boom'), contexto)

  const [{ sql, params }] = DB.chamadas
  assert.match(sql, /INSERT INTO error_logs/)
  assert.equal(params[0], 'POST')
  assert.equal(params[1], '/api/patients')
  assert.equal(params[2], 'boom')
  assert.equal(params[4], 'agente-1')
  assert.equal(params[5], 'admin@clinica.com')
  assert.equal(params[6], '203.0.113.7')
})

test('recordServerError aceita erro anterior ao authMiddleware (sem agente)', async () => {
  const DB = fakeDb()

  await recordServerError({ DB }, new Error('boom'), fakeContext())

  const [{ params }] = DB.chamadas
  assert.equal(params[4], null)
  assert.equal(params[5], null)
  assert.equal(params[6], null)
})

test('recordServerError trunca message e stack', async () => {
  const DB = fakeDb()
  const erro = new Error('x'.repeat(900))
  erro.stack = 'y'.repeat(9000)

  await recordServerError({ DB }, erro, fakeContext())

  const [{ params }] = DB.chamadas
  assert.equal(params[2].length, 500)
  assert.equal(params[3].length, 4000)
})

test('recordServerError nao propaga falha do banco', async () => {
  // Roda dentro do app.onError: se rejeitasse, mascararia o erro original.
  const DB = fakeDb({ falharNoRun: true })

  await assert.doesNotReject(() => recordServerError({ DB }, new Error('boom'), fakeContext()))
})

test('purgeOldErrorLogs apaga pela janela de retencao e retorna o total removido', async () => {
  const DB = fakeDb({ changes: 12 })

  const removidos = await purgeOldErrorLogs({ DB })

  assert.equal(removidos, 12)
  const [{ sql, params }] = DB.chamadas
  assert.match(sql, /DELETE FROM error_logs/)
  assert.equal(params[0], `-${RETENTION_DAYS} days`)
})
