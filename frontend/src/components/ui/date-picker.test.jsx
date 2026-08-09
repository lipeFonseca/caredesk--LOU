// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { endOfMonth, format, startOfMonth, startOfWeek } from 'date-fns'
import DatePickerField from './date-picker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SETTER_DE_VALUE_DO_INPUT = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

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

function focar(elemento) {
  act(() => {
    elemento.focus()
  })
}

function desfocar(elemento) {
  act(() => {
    elemento.blur()
  })
}

// Dispara o setter nativo + evento 'input' — o jeito que o React 18 realmente
// enxerga digitação num input controlado (setar `.value` direto não avisa o React).
function digitar(input, texto) {
  act(() => {
    SETTER_DE_VALUE_DO_INPUT.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function campoDeTexto(container) {
  return container.querySelector('input[aria-label="Data (dd/mm/aaaa)"]')
}

// Unico jeito de abrir o calendario agora: focar o campo de texto (clique ou
// Tab) — o botao dedicado de icone foi removido por ser redundante e o
// usuario nao gostou do visual dele.
function abrir(container) {
  focar(campoDeTexto(container))
}

// So os botoes de dia vivem dentro dessa grade — separa de proposito dos
// botoes de navegacao/Limpar/Hoje, que nao tem essa classe.
function botoesDeDia(popup) {
  return popup.querySelector('.grid.grid-cols-7').querySelectorAll('button')
}

describe('DatePickerField — interação real (jsdom)', () => {
  it('abre o calendário ao focar o campo, seleciona um dia, chama onChange com ISO e fecha', () => {
    const onChange = vi.fn()
    const container = montar({ value: '', onChange })

    expect(container.querySelector('[role="dialog"]')).toBeNull()

    abrir(container)
    const popup = container.querySelector('[role="dialog"]')
    expect(popup).not.toBeNull()

    const diasDoMes = botoesDeDia(popup)
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

    abrir(container)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('não fecha ao clicar em algo dentro do próprio calendário (ex.: o cabeçalho)', () => {
    const container = montar({ value: '2026-08-15', onChange: vi.fn() })
    abrir(container)
    const popup = container.querySelector('[role="dialog"]')

    act(() => {
      popup.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('fecha ao pressionar Escape', () => {
    const container = montar({ value: '', onChange: vi.fn() })
    abrir(container)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('mostra a data selecionada formatada dd/mm/aaaa no campo', () => {
    const container = montar({ value: '2026-08-09', onChange: vi.fn() })
    expect(campoDeTexto(container).value).toBe('09/08/2026')
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

    abrir(container)
    const popup = container.querySelector('[role="dialog"]')
    const botaoHoje = Array.from(popup.querySelectorAll('button')).find((b) => b.textContent === 'Hoje')

    clicar(botaoHoje)

    const hojeIso = new Date().toISOString().slice(0, 10)
    expect(onChange).toHaveBeenCalledWith({ target: { value: hojeIso } })
  })

  it('não abre nem reage a foco quando disabled', () => {
    const container = montar({ value: '', onChange: vi.fn(), disabled: true })

    abrir(container)

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('navega pro próximo mês e pro mês anterior, atualizando o cabeçalho', () => {
    const container = montar({ value: '2026-08-15', onChange: vi.fn() })
    abrir(container)
    const popup = container.querySelector('[role="dialog"]')
    const mes = () => popup.querySelector('span.capitalize').textContent
    const ano = () => popup.querySelector('button[aria-label="Selecionar ano"]').textContent

    expect(mes()).toBe('agosto de')
    expect(ano()).toBe('2026')

    clicar(popup.querySelector('button[aria-label="Próximo mês"]'))
    expect(mes()).toBe('setembro de')

    clicar(popup.querySelector('button[aria-label="Mês anterior"]'))
    clicar(popup.querySelector('button[aria-label="Mês anterior"]'))
    expect(mes()).toBe('julho de')
  })

  it('permite selecionar um dia esmaecido do mês adjacente mostrado na grade', () => {
    const onChange = vi.fn()
    const container = montar({ value: '2026-08-15', onChange })
    abrir(container)
    const popup = container.querySelector('[role="dialog"]')

    const primeiroDiaDaGrade = startOfWeek(startOfMonth(new Date(2026, 7, 15)))
    clicar(botoesDeDia(popup)[0])

    expect(onChange).toHaveBeenCalledWith({ target: { value: format(primeiroDiaDaGrade, 'yyyy-MM-dd') } })
  })

  it('a grade sempre cobre o mês inteiro, do primeiro ao último dia', () => {
    const container = montar({ value: '2026-02-15', onChange: vi.fn() })
    abrir(container)
    const popup = container.querySelector('[role="dialog"]')

    const dias = botoesDeDia(popup)
    const ultimoDiaDoMes = format(endOfMonth(new Date(2026, 1, 15)), 'd')
    expect(dias.length % 7).toBe(0)
    expect(Array.from(dias).some((botao) => botao.textContent === ultimoDiaDoMes)).toBe(true)
  })

  it('digitar uma data válida completa chama onChange com o ISO certo', () => {
    const onChange = vi.fn()
    const container = montar({ value: '', onChange })
    digitar(campoDeTexto(container), '15082026')
    expect(onChange).toHaveBeenCalledWith({ target: { value: '2026-08-15' } })
  })

  it('digitar uma data com dia inexistente no mês (31/02) não chama onChange', () => {
    const onChange = vi.fn()
    const container = montar({ value: '', onChange })
    digitar(campoDeTexto(container), '31022026')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('digitar mascara automaticamente com as barras (dd/mm/aaaa)', () => {
    const container = montar({ value: '', onChange: vi.fn() })
    digitar(campoDeTexto(container), '1508')
    expect(campoDeTexto(container).value).toBe('15/08')
  })

  it('sair do campo sem completar uma data válida descarta o texto digitado', () => {
    const container = montar({ value: '2026-08-09', onChange: vi.fn() })
    const input = campoDeTexto(container)
    focar(input)
    digitar(input, '15')
    expect(input.value).toBe('15')
    desfocar(input)
    expect(input.value).toBe('09/08/2026')
  })

  it('clicar no ano abre o seletor de ano; escolher um ano atualiza o cabeçalho sem fechar o calendário', () => {
    const container = montar({ value: '2026-08-15', onChange: vi.fn() })
    abrir(container)
    const popup = container.querySelector('[role="dialog"]')

    clicar(popup.querySelector('button[aria-label="Selecionar ano"]'))

    const botoesDeAno = Array.from(popup.querySelectorAll('button')).filter((b) => /^\d{4}$/.test(b.textContent))
    expect(botoesDeAno.length).toBe(12)
    expect(botoesDeAno.map((b) => b.textContent)).toContain('2026')

    const botao2030 = botoesDeAno.find((b) => b.textContent === '2030')
    clicar(botao2030)

    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(popup.querySelector('button[aria-label="Selecionar ano"]').textContent).toBe('2030')
  })

  it('a visão sempre reabre em "dias" na próxima vez que o calendário abre', () => {
    const container = montar({ value: '2026-08-15', onChange: vi.fn() })

    abrir(container)
    clicar(container.querySelector('[role="dialog"] button[aria-label="Selecionar ano"]'))
    expect(container.querySelector('[role="dialog"] button[aria-label="Selecionar ano"]')).toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    abrir(container)

    expect(container.querySelector('[role="dialog"] button[aria-label="Selecionar ano"]')).not.toBeNull()
  })
})
