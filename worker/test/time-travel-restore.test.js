import test from 'node:test'
import assert from 'node:assert/strict'

import { timestampDoFimDoDia, resolverTimestamp, valorDaFlag } from '../scripts/time-travel-restore.js'

test('timestampDoFimDoDia usa 23:59:59 no fuso fixo de Fortaleza (UTC-3)', () => {
  assert.equal(timestampDoFimDoDia('2026-08-15'), '2026-08-15T23:59:59-03:00')
})

test('timestampDoFimDoDia rejeita data fora do formato aaaa-mm-dd', () => {
  assert.throws(() => timestampDoFimDoDia('15/08/2026'), /aaaa-mm-dd/)
  assert.throws(() => timestampDoFimDoDia('2026-8-15'), /aaaa-mm-dd/)
})

test('resolverTimestamp converte --date pro fim do dia', () => {
  assert.equal(resolverTimestamp(['--date', '2026-08-15']), '2026-08-15T23:59:59-03:00')
})

test('resolverTimestamp usa --timestamp direto quando informado', () => {
  assert.equal(resolverTimestamp(['--timestamp', '2026-08-15T14:30:00-03:00']), '2026-08-15T14:30:00-03:00')
})

test('resolverTimestamp prioriza --timestamp explícito quando os dois vêm juntos', () => {
  const args = ['--date', '2026-08-15', '--timestamp', '2026-08-14T09:00:00-03:00']
  assert.equal(resolverTimestamp(args), '2026-08-14T09:00:00-03:00')
})

test('resolverTimestamp exige --date ou --timestamp', () => {
  assert.throws(() => resolverTimestamp(['--confirm']), /Informe --date/)
})

test('valorDaFlag devolve null quando a flag não foi passada', () => {
  assert.equal(valorDaFlag(['--confirm'], '--date'), null)
})
