import test from 'node:test'
import assert from 'node:assert/strict'

import { purgeStaleRateLimits } from '../src/services/scheduler.js'

function fakeDb() {
  const chamadas = []
  return {
    chamadas,
    prepare(sql) {
      chamadas.push(sql)
      return { async run() { return { meta: { changes: 4 } } } }
    },
  }
}

test('purgeStaleRateLimits devolve quantas linhas sairam', async () => {
  const DB = fakeDb()

  assert.equal(await purgeStaleRateLimits({ DB }), 4)
  assert.match(DB.chamadas[0], /DELETE FROM login_rate_limit/)
})

test('purgeStaleRateLimits preserva bloqueio em curso e contador recente', async () => {
  // Apagar um bloqueio vigente destravaria um ataque em andamento; apagar um
  // contador recente zeraria tentativas que ainda deveriam somar.
  const DB = fakeDb()
  await purgeStaleRateLimits({ DB })

  const sql = DB.chamadas[0]
  // locked_until vem do JS em ISO e precisa passar por datetime() pra comparar
  // com o formato do SQLite; sem isso, bloqueio vencido nunca era limpo.
  assert.match(sql, /datetime\(locked_until\) < datetime\('now'\)/)
  assert.match(sql, /updated_at < datetime\('now', '-1 day'\)/)
})
