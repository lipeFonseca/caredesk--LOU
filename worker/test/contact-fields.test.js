import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeOptionalPhone, sanitizeOptionalEmail, sanitizeRequiredCpf, sanitizeOptionalCpf } from '../src/utils/contactFields.js'

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

test('sanitizeRequiredCpf aceita CPF valido, mascarado ou nao', () => {
  assert.deepEqual(sanitizeRequiredCpf('123.456.789-09'), { ok: true, value: '12345678909' })
  assert.deepEqual(sanitizeRequiredCpf('12345678909'), { ok: true, value: '12345678909' })
})

test('sanitizeRequiredCpf recusa digito verificador incorreto', () => {
  assert.equal(sanitizeRequiredCpf('123.456.789-00').ok, false)
})

test('sanitizeRequiredCpf recusa sequencia de digitos repetidos', () => {
  assert.equal(sanitizeRequiredCpf('111.111.111-11').ok, false)
  assert.equal(sanitizeRequiredCpf('000.000.000-00').ok, false)
})

test('sanitizeRequiredCpf recusa tamanho errado, ausente ou vazio', () => {
  assert.equal(sanitizeRequiredCpf(null).ok, false)
  assert.equal(sanitizeRequiredCpf('').ok, false)
  assert.equal(sanitizeRequiredCpf('123.456.789').ok, false)
})

test('sanitizeOptionalCpf trata ausente e vazio como null válido (diferença chave pra sanitizeRequiredCpf)', () => {
  assert.deepEqual(sanitizeOptionalCpf(null), { ok: true, value: null })
  assert.deepEqual(sanitizeOptionalCpf(''), { ok: true, value: null })
  assert.deepEqual(sanitizeOptionalCpf('   '), { ok: true, value: null })
})

test('sanitizeOptionalCpf valida o mesmo dígito verificador quando preenchido', () => {
  assert.deepEqual(sanitizeOptionalCpf('123.456.789-09'), { ok: true, value: '12345678909' })
  assert.equal(sanitizeOptionalCpf('123.456.789-00').ok, false)
  assert.equal(sanitizeOptionalCpf('111.111.111-11').ok, false)
})
