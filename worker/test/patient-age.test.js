import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularIdade, ehMenorDeIdade } from '../src/utils/patientAge.js'

test('calcularIdade conta aniversario ja passado no ano de referencia', () => {
  assert.equal(calcularIdade('2000-01-15', '2026-06-01'), 26)
})

test('calcularIdade nao conta aniversario que ainda nao chegou no ano de referencia', () => {
  assert.equal(calcularIdade('2000-12-15', '2026-06-01'), 25)
})

test('calcularIdade no dia exato do aniversario ja conta o ano novo', () => {
  assert.equal(calcularIdade('2008-08-09', '2026-08-09'), 18)
})

test('calcularIdade um dia antes do aniversario de 18 ainda conta 17', () => {
  assert.equal(calcularIdade('2008-08-09', '2026-08-08'), 17)
})

test('ehMenorDeIdade separa corretamente o limiar de 18 anos', () => {
  assert.equal(ehMenorDeIdade('2008-08-09', '2026-08-08'), true)
  assert.equal(ehMenorDeIdade('2008-08-09', '2026-08-09'), false)
})
