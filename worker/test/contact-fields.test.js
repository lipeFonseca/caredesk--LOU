import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeOptionalPhone, sanitizeOptionalEmail } from '../src/utils/contactFields.js'

test('sanitizeOptionalPhone trata ausente e vazio como null', () => {
  assert.equal(sanitizeOptionalPhone(null), null)
  assert.equal(sanitizeOptionalPhone(undefined), null)
  assert.equal(sanitizeOptionalPhone(''), null)
  assert.equal(sanitizeOptionalPhone('   '), null)
})

test('sanitizeOptionalPhone mantem formatacao comum de telefone', () => {
  assert.equal(sanitizeOptionalPhone('(85) 99999-9999'), '(85) 99999-9999')
  assert.equal(sanitizeOptionalPhone('+55 85 99999 9999'), '+55 85 99999 9999')
})

test('sanitizeOptionalPhone remove caractere fora do formato e limita tamanho', () => {
  assert.equal(sanitizeOptionalPhone('<script>85999</script>'), '85999')
  assert.ok(sanitizeOptionalPhone('9'.repeat(50)).length <= 20)
})

test('sanitizeOptionalEmail trata ausente e vazio como null valido', () => {
  assert.deepEqual(sanitizeOptionalEmail(null), { ok: true, value: null })
  assert.deepEqual(sanitizeOptionalEmail(''), { ok: true, value: null })
  assert.deepEqual(sanitizeOptionalEmail('   '), { ok: true, value: null })
})

test('sanitizeOptionalEmail normaliza para minusculo e sem espaco', () => {
  assert.deepEqual(sanitizeOptionalEmail('  Paciente@Exemplo.COM '), {
    ok: true,
    value: 'paciente@exemplo.com',
  })
})

test('sanitizeOptionalEmail recusa endereco implausivel', () => {
  for (const invalido of ['sem-arroba', 'a@b', 'a@@b.com', 'com espaco@x.com']) {
    assert.equal(sanitizeOptionalEmail(invalido).ok, false, `deveria recusar: ${invalido}`)
  }
})
