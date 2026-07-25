import test from 'node:test'
import assert from 'node:assert/strict'

import {
  generateResetCode,
  hashResetCode,
  resetCodeExpiryIso,
  isResetCodeUsable,
  timingSafeEqualHex,
  isStrongEnoughPassword,
  purgeExpiredResetCodes,
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  MAX_CODE_ATTEMPTS,
} from '../src/utils/passwordReset.js'

test('generateResetCode devolve sempre 6 digitos, incluindo os com zero a esquerda', () => {
  for (let i = 0; i < 200; i += 1) {
    const codigo = generateResetCode()
    assert.equal(codigo.length, CODE_LENGTH)
    assert.match(codigo, /^\d{6}$/)
  }
})

test('generateResetCode nao repete o mesmo valor a cada chamada', () => {
  const gerados = new Set(Array.from({ length: 50 }, () => generateResetCode()))
  assert.ok(gerados.size > 40, `esperado variedade alta, veio ${gerados.size}/50`)
})

test('hashResetCode e estavel e nao devolve o codigo em claro', async () => {
  const hash = await hashResetCode('123456')

  assert.equal(hash, await hashResetCode('123456'))
  assert.equal(hash.length, 64)
  assert.ok(!hash.includes('123456'))
  assert.notEqual(hash, await hashResetCode('123457'))
})

test('resetCodeExpiryIso soma exatamente a janela de validade', () => {
  const agora = new Date('2026-07-24T12:00:00.000Z')
  const expiracao = new Date(resetCodeExpiryIso(agora))

  assert.equal((expiracao - agora) / 60000, CODE_TTL_MINUTES)
})

test('isResetCodeUsable aceita codigo novo dentro da validade', () => {
  const agora = new Date('2026-07-24T12:00:00.000Z')
  const registro = { used_at: null, attempts: 0, expires_at: '2026-07-24T12:10:00.000Z' }

  assert.equal(isResetCodeUsable(registro, agora), true)
})

test('isResetCodeUsable recusa codigo expirado, usado, esgotado ou inexistente', () => {
  const agora = new Date('2026-07-24T12:00:00.000Z')

  assert.equal(isResetCodeUsable(null, agora), false)
  assert.equal(isResetCodeUsable(
    { used_at: null, attempts: 0, expires_at: '2026-07-24T11:59:59.000Z' }, agora), false)
  assert.equal(isResetCodeUsable(
    { used_at: '2026-07-24T11:50:00.000Z', attempts: 0, expires_at: '2026-07-24T12:10:00.000Z' }, agora), false)
  assert.equal(isResetCodeUsable(
    { used_at: null, attempts: MAX_CODE_ATTEMPTS, expires_at: '2026-07-24T12:10:00.000Z' }, agora), false)
})

test('timingSafeEqualHex compara conteudo e rejeita tamanho diferente ou nao-string', () => {
  assert.equal(timingSafeEqualHex('abc123', 'abc123'), true)
  assert.equal(timingSafeEqualHex('abc123', 'abc124'), false)
  assert.equal(timingSafeEqualHex('abc123', 'abc1234'), false)
  assert.equal(timingSafeEqualHex(null, 'abc123'), false)
})

test('isStrongEnoughPassword exige 8 caracteres, mesmo criterio das outras rotas', () => {
  assert.equal(isStrongEnoughPassword('12345678'), true)
  assert.equal(isStrongEnoughPassword('1234567'), false)
  assert.equal(isStrongEnoughPassword(''), false)
  assert.equal(isStrongEnoughPassword(undefined), false)
})

test('purgeExpiredResetCodes apaga so o que ja expirou e devolve o total', async () => {
  // Um pedido em curso na hora da faxina nao pode ser derrubado.
  let sqlExecutado = ''
  const env = {
    DB: {
      prepare(sql) {
        sqlExecutado = sql
        return { async run() { return { meta: { changes: 3 } } } }
      },
    },
  }

  const removidos = await purgeExpiredResetCodes(env)

  assert.equal(removidos, 3)
  assert.match(sqlExecutado, /DELETE FROM password_reset_codes/)
  assert.match(sqlExecutado, /expires_at < datetime\('now'\)/)
})
