import test from 'node:test'
import assert from 'node:assert/strict'

import { SQL_URGENCIA } from '../src/utils/proximoMarco.js'

// A urgencia deixou de ser calculada em JavaScript e passou a ser derivada em
// SQL a partir de next_followup_date. Estes testes fixam os limiares, que
// precisam continuar batendo com calcProtocolUrgency() — se um lado mudar sem o
// outro, o Dashboard e a lista de pacientes passam a discordar.

test('SQL_URGENCIA cobre os cinco estados na ordem correta de precedencia', () => {
  const sql = SQL_URGENCIA

  // Inativo/sem data vem primeiro: um paciente pausado com data no passado nao
  // pode ser classificado como atrasado.
  const posicaoNone     = sql.indexOf("THEN 'none'")
  const posicaoOverdue  = sql.indexOf("THEN 'overdue'")
  const posicaoDue      = sql.indexOf("THEN 'due'")
  const posicaoSoon     = sql.indexOf("THEN 'soon'")
  const posicaoOk       = sql.indexOf("ELSE 'ok'")

  assert.ok(posicaoNone >= 0 && posicaoOverdue > posicaoNone)
  assert.ok(posicaoDue > posicaoOverdue)
  assert.ok(posicaoSoon > posicaoDue)
  assert.ok(posicaoOk > posicaoSoon)
})

test('SQL_URGENCIA usa o mesmo limiar de 2 dias do calculo antigo', () => {
  assert.match(SQL_URGENCIA, /<=\s*2/)
})

test('SQL_URGENCIA so considera paciente ativo', () => {
  assert.match(SQL_URGENCIA, /p\.status <> 'active'/)
})

test('SQL_URGENCIA compara sempre contra a data corrente do banco', () => {
  // date('now') no servidor evita divergencia com o fuso do navegador.
  assert.match(SQL_URGENCIA, /date\('now'\)/)
})
