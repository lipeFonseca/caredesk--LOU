import { describe, it, expect } from 'vitest'
import { formatCpf, calcularIdade } from './contactDisplay'

describe('formatCpf', () => {
  it('formata 11 dígitos com máscara padrão', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
  })

  it('devolve o valor original quando não tem 11 dígitos', () => {
    expect(formatCpf('123')).toBe('123')
    expect(formatCpf('')).toBe('')
  })
})

describe('calcularIdade', () => {
  it('conta aniversário já passado no ano de referência', () => {
    expect(calcularIdade('2000-01-15', '2026-06-01')).toBe(26)
  })

  it('não conta aniversário que ainda não chegou no ano de referência', () => {
    expect(calcularIdade('2000-12-15', '2026-06-01')).toBe(25)
  })

  it('no dia exato do aniversário já conta o ano novo', () => {
    expect(calcularIdade('2008-08-09', '2026-08-09')).toBe(18)
  })

  it('devolve null quando não há data de nascimento', () => {
    expect(calcularIdade('')).toBe(null)
  })
})
