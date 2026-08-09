// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import DatePickerField from './date-picker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let containerAtual = null

afterEach(() => {
  if (containerAtual) {
    document.body.removeChild(containerAtual)
    containerAtual = null
  }
})

function montar(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containerAtual = container
  const root = createRoot(container)
  act(() => {
    root.render(<DatePickerField {...props} />)
  })
  return container
}

function clicar(elemento) {
  act(() => {
    elemento.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('DatePickerField — interação real (jsdom)', () => {
  it('abre o calendário ao clicar, seleciona um dia, chama onChange com ISO e fecha', () => {
    const onChange = vi.fn()
    const container = montar({ value: '', onChange })

    expect(container.querySelector('[role="dialog"]')).toBeNull()

    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))
    const popup = container.querySelector('[role="dialog"]')
    expect(popup).not.toBeNull()

    const diasDoMes = popup.querySelectorAll('button')
    expect(diasDoMes.length).toBeGreaterThan(27)

    clicar(diasDoMes[10])

    expect(onChange).toHaveBeenCalledTimes(1)
    const [[evento]] = onChange.mock.calls
    expect(evento.target.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('fecha ao clicar fora, sem disparar onChange', () => {
    const onChange = vi.fn()
    const container = montar({ value: '', onChange })

    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fecha ao pressionar Escape', () => {
    const container = montar({ value: '', onChange: vi.fn() })
    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('mostra a data selecionada formatada dd/mm/aaaa', () => {
    const container = montar({ value: '2026-08-09', onChange: vi.fn() })
    expect(container.textContent).toContain('09/08/2026')
  })

  it('botão "Limpar" chama onChange com string vazia', () => {
    const onChange = vi.fn()
    const container = montar({ value: '2026-08-09', onChange })

    clicar(container.querySelector('button[aria-label="Limpar data"]'))

    expect(onChange).toHaveBeenCalledWith({ target: { value: '' } })
  })

  it('botão "Hoje" (dentro do calendário) seleciona a data de hoje', () => {
    const onChange = vi.fn()
    const container = montar({ value: '', onChange })

    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))
    const popup = container.querySelector('[role="dialog"]')
    const botaoHoje = Array.from(popup.querySelectorAll('button')).find((b) => b.textContent === 'Hoje')

    clicar(botaoHoje)

    const hojeIso = new Date().toISOString().slice(0, 10)
    expect(onChange).toHaveBeenCalledWith({ target: { value: hojeIso } })
  })

  it('não abre nem reage a clique quando disabled', () => {
    const onChange = vi.fn()
    const container = montar({ value: '', onChange, disabled: true })

    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
