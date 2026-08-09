// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { endOfMonth, format, startOfMonth, startOfWeek } from 'date-fns'
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

// So os botoes de dia vivem dentro dessa grade — separa de proposito dos
// botoes de navegacao/Limpar/Hoje, que nao tem essa classe.
function botoesDeDia(popup) {
  return popup.querySelector('.grid.grid-cols-7').querySelectorAll('button')
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

  it('o botão de texto (não só o ícone) também abre o calendário', () => {
    const container = montar({ value: '', onChange: vi.fn() })
    clicar(container.querySelector('button[aria-label="Selecionar data"]'))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('clicar de novo no botão que abriu fecha o calendário (toggle)', () => {
    const container = montar({ value: '', onChange: vi.fn() })
    const botaoAbrir = container.querySelector('button[aria-label="Abrir calendário"]')
    clicar(botaoAbrir)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    clicar(botaoAbrir)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('navega pro próximo mês e pro mês anterior, atualizando o cabeçalho', () => {
    const container = montar({ value: '2026-08-15', onChange: vi.fn() })
    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))
    const popup = container.querySelector('[role="dialog"]')
    const cabecalho = () => popup.querySelector('span.capitalize')

    expect(cabecalho().textContent).toBe('agosto de 2026')

    clicar(popup.querySelector('button[aria-label="Próximo mês"]'))
    expect(cabecalho().textContent).toBe('setembro de 2026')

    clicar(popup.querySelector('button[aria-label="Mês anterior"]'))
    clicar(popup.querySelector('button[aria-label="Mês anterior"]'))
    expect(cabecalho().textContent).toBe('julho de 2026')
  })

  it('permite selecionar um dia esmaecido do mês adjacente mostrado na grade', () => {
    const onChange = vi.fn()
    const container = montar({ value: '2026-08-15', onChange })
    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))
    const popup = container.querySelector('[role="dialog"]')

    const primeiroDiaDaGrade = startOfWeek(startOfMonth(new Date(2026, 7, 15)))
    clicar(botoesDeDia(popup)[0])

    expect(onChange).toHaveBeenCalledWith({ target: { value: format(primeiroDiaDaGrade, 'yyyy-MM-dd') } })
  })

  it('a grade sempre cobre o mês inteiro, do primeiro ao último dia', () => {
    const container = montar({ value: '2026-02-15', onChange: vi.fn() })
    clicar(container.querySelector('button[aria-label="Abrir calendário"]'))
    const popup = container.querySelector('[role="dialog"]')

    const dias = botoesDeDia(popup)
    const ultimoDiaDoMes = format(endOfMonth(new Date(2026, 1, 15)), 'd')
    expect(dias.length % 7).toBe(0)
    expect(Array.from(dias).some((botao) => botao.textContent === ultimoDiaDoMes)).toBe(true)
  })
})
