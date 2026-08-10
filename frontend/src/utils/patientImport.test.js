import { describe, it, expect } from 'vitest'
import { parseCsv, paraIsoData, cpfValido, linhasParaPacientes } from './patientImport'

const CPF_VALIDO_1 = '123.456.789-09'
const CPF_VALIDO_2 = '529.982.247-25'

describe('parseCsv', () => {
  it('lê cabeçalho e linhas em objetos', () => {
    const { data, errosDeParse } = parseCsv('name,cpf\nJoão,12345678909\n')
    expect(errosDeParse).toEqual([])
    expect(data).toEqual([{ name: 'João', cpf: '12345678909' }])
  })

  it('pula linha totalmente vazia', () => {
    const { data } = parseCsv('name,cpf\nJoão,12345678909\n\n')
    expect(data.length).toBe(1)
  })
})

describe('paraIsoData', () => {
  it('aceita aaaa-mm-dd direto', () => {
    expect(paraIsoData('2026-08-09')).toBe('2026-08-09')
  })

  it('converte dd/mm/aaaa sem depender de fuso horário (nunca via Date/toISOString)', () => {
    // Se algum dia isto for reescrito usando `new Date(...).toISOString()`,
    // esse teste pega a virada de dia em fuso negativo (Brasil, UTC-3).
    expect(paraIsoData('09/08/2026')).toBe('2026-08-09')
    expect(paraIsoData('01/01/2026')).toBe('2026-01-01')
    expect(paraIsoData('31/12/2026')).toBe('2026-12-31')
  })

  it('aceita dia/mês sem zero à esquerda', () => {
    expect(paraIsoData('9/8/2026')).toBe('2026-08-09')
  })

  it('devolve null pra formato irreconhecível', () => {
    expect(paraIsoData('não é uma data')).toBe(null)
    expect(paraIsoData('')).toBe(null)
    expect(paraIsoData(undefined)).toBe(null)
  })
})

describe('cpfValido', () => {
  it('aceita CPF válido, mascarado ou não', () => {
    expect(cpfValido(CPF_VALIDO_1)).toBe(true)
    expect(cpfValido('12345678909')).toBe(true)
  })

  it('recusa dígito verificador incorreto e sequência repetida', () => {
    expect(cpfValido('123.456.789-00')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
  })

  it('recusa tamanho errado ou ausente', () => {
    expect(cpfValido('123')).toBe(false)
    expect(cpfValido(null)).toBe(false)
  })
})

function linhaBase(overrides = {}) {
  return {
    name: 'Paciente Teste',
    cpf: CPF_VALIDO_1,
    data_nascimento: '1990-05-20',
    procedure: 'Rinoplastia',
    surgery_date: '2026-09-01',
    ...overrides,
  }
}

describe('linhasParaPacientes', () => {
  it('linha válida completa não tem erro e preserva o número de linha (cabeçalho = linha 1)', () => {
    const [linha] = linhasParaPacientes([linhaBase()])
    expect(linha.row).toBe(2)
    expect(linha.erros).toEqual([])
    expect(linha.paciente.cpf).toBe('12345678909')
  })

  it('acumula todos os erros da linha, não só o primeiro (linha parcial, não vazia — vazia de verdade é pulada)', () => {
    const [linha] = linhasParaPacientes([{ name: 'Só isto preenchido', cpf: '', data_nascimento: '', procedure: '', surgery_date: '' }])
    expect(linha.erros.length).toBeGreaterThanOrEqual(4)
  })

  it('menor de idade sem responsável é erro; com responsável passa', () => {
    const [semResp] = linhasParaPacientes([linhaBase({ data_nascimento: '2015-01-10' })])
    expect(semResp.erros.some((e) => e.includes('Responsável'))).toBe(true)

    const [comResp] = linhasParaPacientes([linhaBase({ data_nascimento: '2015-01-10', responsavel: 'Mãe' })])
    expect(comResp.erros).toEqual([])
  })

  it('maior de idade sem responsável não é erro', () => {
    const [linha] = linhasParaPacientes([linhaBase()])
    expect(linha.erros).toEqual([])
  })

  it('CPF duplicado dentro do arquivo marca as duas linhas envolvidas', () => {
    const linhas = linhasParaPacientes([
      linhaBase({ name: 'A' }),
      linhaBase({ name: 'B' }), // mesmo CPF
    ])
    expect(linhas[0].erros[0]).toMatch(/duplicado/)
    expect(linhas[1].erros[0]).toMatch(/duplicado/)
  })

  it('linha totalmente vazia é pulada, linha parcialmente preenchida vira erro', () => {
    const linhas = linhasParaPacientes([
      { name: '', cpf: '', data_nascimento: '', procedure: '', surgery_date: '' },
      { name: 'Só o nome preenchido' },
      linhaBase({ cpf: CPF_VALIDO_2 }),
    ])
    // a vazia sumiu, sobraram as outras duas
    expect(linhas.length).toBe(2)
    expect(linhas[0].erros.length).toBeGreaterThan(0)
  })
})
