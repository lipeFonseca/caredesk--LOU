import test from 'node:test'
import assert from 'node:assert/strict'
import { criarFakeD1 } from './helpers/fakeD1.js'
import { importPatients, MAX_LINHAS_POR_IMPORTACAO } from '../src/services/patientImport.js'

const ACTOR = { sub: 'agent-1', name: 'Test Admin' }
const PROTOCOL_ID = 'proto-1'

// CPF valido de verdade (mesmo usado nos testes de contactFields.test.js) —
// dígito verificador correto, não é sequência repetida.
const CPF_VALIDO_1 = '123.456.789-09'
const CPF_VALIDO_2 = '529.982.247-25'
const CPF_VALIDO_3 = '111.444.777-35'

function linhaValida(overrides = {}) {
  return {
    name: 'Paciente Teste',
    cpf: CPF_VALIDO_1,
    data_nascimento: '1990-05-20',
    procedure: 'Rinoplastia',
    surgery_date: '2026-09-01',
    ...overrides,
  }
}

// db sem nenhum CPF existente e sem nada pra recalcularLote achar — cobre o
// caminho feliz. `contarCpf` controla a resposta da confirmacao pos-batch.
function dbFeliz({ contarCpf } = {}) {
  return criarFakeD1([
    { match: 'SELECT cpf FROM patients WHERE cpf IN', results: [] },
    { match: 'SELECT COUNT(*) AS total FROM patients WHERE cpf IN', first: { total: contarCpf } },
  ])
}

test('linha válida completa importa com sucesso', async () => {
  const db = dbFeliz({ contarCpf: 1 })
  const resultado = await importPatients(db, { rows: [linhaValida()], protocolId: PROTOCOL_ID, actor: ACTOR })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.imported, 1)
  assert.equal(resultado.totalRows, 1)
})

test('CPF inválido rejeita a linha e não insere nada', async () => {
  const db = dbFeliz({ contarCpf: 0 })
  const resultado = await importPatients(db, {
    rows: [linhaValida({ cpf: '111.111.111-11' })],
    protocolId: PROTOCOL_ID,
    actor: ACTOR,
  })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.rowErrors.length, 1)
  assert.equal(resultado.rowErrors[0].row, 2) // linha 1 é cabeçalho
  assert.ok(resultado.rowErrors[0].errors.some((e) => e.includes('CPF')))
})

test('campos obrigatórios ausentes acumulam todos os erros da linha, não só o primeiro', async () => {
  const db = dbFeliz({ contarCpf: 0 })
  const resultado = await importPatients(db, {
    rows: [{ name: '', cpf: '', data_nascimento: '', procedure: '', surgery_date: '' }],
    protocolId: PROTOCOL_ID,
    actor: ACTOR,
  })

  assert.equal(resultado.ok, false)
  assert.ok(resultado.rowErrors[0].errors.length >= 4)
})

test('CPF duplicado dentro do próprio arquivo marca as duas linhas e não insere', async () => {
  const db = dbFeliz({ contarCpf: 0 })
  const resultado = await importPatients(db, {
    rows: [
      linhaValida({ name: 'Paciente A' }),
      linhaValida({ name: 'Paciente B' }), // mesmo CPF de linhaValida()
    ],
    protocolId: PROTOCOL_ID,
    actor: ACTOR,
  })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.rowErrors.length, 2)
  assert.ok(resultado.rowErrors.every((e) => e.errors[0].includes('duplicado')))
})

test('CPF já existente no banco rejeita a linha', async () => {
  const db = criarFakeD1([
    { match: 'SELECT cpf FROM patients WHERE cpf IN', results: [{ cpf: '12345678909' }] },
  ])
  const resultado = await importPatients(db, { rows: [linhaValida()], protocolId: PROTOCOL_ID, actor: ACTOR })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.rowErrors.length, 1)
  assert.ok(resultado.rowErrors[0].errors[0].includes('Já existe'))
})

test('menor de idade sem responsável é rejeitado', async () => {
  const db = dbFeliz({ contarCpf: 0 })
  const resultado = await importPatients(db, {
    rows: [linhaValida({ data_nascimento: '2015-01-10' })],
    protocolId: PROTOCOL_ID,
    actor: ACTOR,
  })

  assert.equal(resultado.ok, false)
  assert.ok(resultado.rowErrors[0].errors.some((e) => e.includes('Responsável')))
})

test('menor de idade COM responsável é aceito', async () => {
  const db = dbFeliz({ contarCpf: 1 })
  const resultado = await importPatients(db, {
    rows: [linhaValida({ data_nascimento: '2015-01-10', responsavel: 'Mãe Responsável' })],
    protocolId: PROTOCOL_ID,
    actor: ACTOR,
  })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.imported, 1)
})

test('maior de idade sem responsável é aceito normalmente', async () => {
  const db = dbFeliz({ contarCpf: 1 })
  const resultado = await importPatients(db, { rows: [linhaValida()], protocolId: PROTOCOL_ID, actor: ACTOR })

  assert.equal(resultado.ok, true)
})

test('tudo-ou-nada: uma linha inválida no meio cancela o lote inteiro', async () => {
  const db = dbFeliz({ contarCpf: 0 })
  const resultado = await importPatients(db, {
    rows: [
      linhaValida({ cpf: CPF_VALIDO_2, name: 'Paciente Válido' }),
      linhaValida({ cpf: 'cpf-invalido', name: 'Paciente Inválido' }),
    ],
    protocolId: PROTOCOL_ID,
    actor: ACTOR,
  })

  assert.equal(resultado.ok, false)
  // só a linha ruim aparece no relatório — a boa não devia ter sido tocada
  assert.equal(resultado.rowErrors.length, 1)
})

test('divergência na confirmação pós-batch é reportada, não escondida', async () => {
  // simula banco que "confirma" 0 quando deveria confirmar 1 — a rede de
  // segurança do monitor pedido pelo usuário.
  const db = dbFeliz({ contarCpf: 0 })
  const resultado = await importPatients(db, { rows: [linhaValida()], protocolId: PROTOCOL_ID, actor: ACTOR })

  assert.equal(resultado.ok, false)
  assert.ok(resultado.rowErrors[0].errors[0].includes('Divergência'))
})

test('nenhuma linha no arquivo devolve erro claro', async () => {
  const db = dbFeliz({ contarCpf: 0 })
  const resultado = await importPatients(db, { rows: [], protocolId: PROTOCOL_ID, actor: ACTOR })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.totalRows, 0)
})

test('acima do teto de linhas por importação é rejeitado antes de validar qualquer linha', async () => {
  const db = dbFeliz({ contarCpf: 0 })
  const linhas = Array.from({ length: MAX_LINHAS_POR_IMPORTACAO + 1 }, () => linhaValida())
  const resultado = await importPatients(db, { rows: linhas, protocolId: PROTOCOL_ID, actor: ACTOR })

  assert.equal(resultado.ok, false)
  assert.ok(resultado.rowErrors[0].errors[0].includes(String(MAX_LINHAS_POR_IMPORTACAO)))
})

test('três linhas válidas e distintas importam todas', async () => {
  const db = dbFeliz({ contarCpf: 3 })
  const resultado = await importPatients(db, {
    rows: [
      linhaValida({ cpf: CPF_VALIDO_1, name: 'A' }),
      linhaValida({ cpf: CPF_VALIDO_2, name: 'B' }),
      linhaValida({ cpf: CPF_VALIDO_3, name: 'C' }),
    ],
    protocolId: PROTOCOL_ID,
    actor: ACTOR,
  })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.imported, 3)
})
