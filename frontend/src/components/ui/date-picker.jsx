import { useEffect, useRef, useState } from 'react'
import {
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getYear,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parse,
  parseISO,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const TAMANHO_GRADE_DE_ANOS = 12
const NAV_TRIGGER_CLASS = 'rounded-lg p-2 text-on-surface-variant outline-none transition-colors hover:bg-surface-container-low hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40'

function paraIso(data) {
  return format(data, 'yyyy-MM-dd')
}

function formatarBr(data) {
  return format(data, 'dd/MM/yyyy')
}

function construirGradeDoMes(mesVisivel) {
  const inicio = startOfWeek(startOfMonth(mesVisivel))
  const fim = endOfWeek(endOfMonth(mesVisivel))
  return eachDayOfInterval({ start: inicio, end: fim })
}

// Analisa "dd/MM/yyyy" digitado a mao. Round-trip (reformatar e comparar com
// o que foi digitado) pega o caso que `isValid` sozinho deixa passar: date-fns
// rola datas invalidas tipo 31/02 pro mes seguinte em vez de rejeitar.
function analisarDataDigitada(texto) {
  const data = parse(texto, 'dd/MM/yyyy', new Date())
  return isValid(data) && formatarBr(data) === texto ? data : null
}

// Substitui <input type="date"> nas telas de paciente. Value/onChange mantem
// o formato de evento nativo (`e.target.value`, string ISO) — os chamadores
// existentes (set(field) do NewPatient, handlers inline do PatientDetail) nao
// precisam mudar, so o elemento troca.
//
// Sem Portal de proposito: o popup nasce como filho normal na arvore do
// componente, nunca em document.body. Evita o caso que provavelmente quebrou
// a tentativa anterior (Ark UI) — calendario portalado pra fora de um Modal
// cujo backdrop fecha ao clicar fora podia interpretar o clique num dia como
// "clique fora do modal".
export default function DatePickerField({ value, onChange, placeholder = 'dd/mm/aaaa', disabled = false }) {
  const [aberto, setAberto] = useState(false)
  const [visao, setVisao] = useState('dias')
  const dataSelecionada = value ? parseISO(value) : null
  const [mesVisivel, setMesVisivel] = useState(dataSelecionada ?? new Date())
  const [textoDigitado, setTextoDigitado] = useState(dataSelecionada ? formatarBr(dataSelecionada) : '')
  const containerRef = useRef(null)

  // So resincroniza com o valor de fora (selecao via calendario, Limpar, Hoje,
  // ou o proprio pai mudando o value) — nao a cada tecla digitada.
  useEffect(() => {
    if (dataSelecionada) {
      setMesVisivel(dataSelecionada)
      setTextoDigitado(formatarBr(dataSelecionada))
    } else {
      setTextoDigitado('')
    }
  }, [value])

  useEffect(() => {
    if (!aberto) {
      setVisao('dias')
      return
    }
    function aoClicarFora(evento) {
      if (containerRef.current && !containerRef.current.contains(evento.target)) setAberto(false)
    }
    function aoPressionarTecla(evento) {
      if (evento.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoPressionarTecla)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoPressionarTecla)
    }
  }, [aberto])

  function selecionar(dia) {
    onChange({ target: { value: paraIso(dia) } })
    setAberto(false)
  }

  function limpar() {
    onChange({ target: { value: '' } })
    setAberto(false)
  }

  function irParaHoje() {
    const hoje = new Date()
    setMesVisivel(hoje)
    selecionar(hoje)
  }

  function selecionarAno(ano) {
    setMesVisivel((mes) => setYear(mes, ano))
    setVisao('dias')
  }

  function aoDigitar(evento) {
    const digitos = evento.target.value.replace(/\D/g, '').slice(0, 8)
    const mascarado =
      digitos.length > 4 ? `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`
      : digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}`
      : digitos
    setTextoDigitado(mascarado)

    if (digitos.length !== 8) return
    const dataDigitada = analisarDataDigitada(mascarado)
    if (!dataDigitada) return
    setMesVisivel(dataDigitada)
    setVisao('dias')
    onChange({ target: { value: paraIso(dataDigitada) } })
  }

  function aoDesfocarTexto() {
    // Nao formou uma data valida: descarta o que foi digitado e volta a
    // mostrar o valor real, em vez de deixar lixo no campo.
    setTextoDigitado(dataSelecionada ? formatarBr(dataSelecionada) : '')
  }

  const dias = construirGradeDoMes(mesVisivel)
  const anoCentral = getYear(mesVisivel)
  const anoInicialDaGrade = anoCentral - 5
  const anosDaGrade = Array.from({ length: TAMANHO_GRADE_DE_ANOS }, (_, i) => anoInicialDaGrade + i)

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-1 rounded-2xl border border-[#0000] bg-[#0000] py-2 pl-4 pr-1.5
          focus-within:ring-4 focus-within:ring-primary-100/60 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-60"
        style={{ boxShadow: 'inset 0 1px 0 transparent' }}
        data-disabled={disabled}
      >
        <input
          type="text"
          inputMode="numeric"
          value={textoDigitado}
          onChange={aoDigitar}
          onFocus={() => setAberto(true)}
          onBlur={aoDesfocarTexto}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Data (dd/mm/aaaa)"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70 disabled:cursor-not-allowed"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={limpar}
            className="rounded-xl p-2 text-on-surface-variant outline-none transition-colors hover:bg-error-container/30 hover:text-error focus-visible:ring-2 focus-visible:ring-error/40"
            aria-label="Limpar data"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAberto((estaAberto) => !estaAberto)}
          disabled={disabled}
          className="rounded-xl p-2 text-on-surface-variant outline-none transition-colors hover:bg-surface-container hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none"
          aria-label="Abrir calendário"
        >
          <Calendar size={18} />
        </button>
      </div>

      {aberto && (
        <div role="dialog" aria-label="Calendário" className="absolute z-50 mt-2 w-[22rem] rounded-2xl border border-outline-variant bg-surface p-4 shadow-modal">
          {visao === 'dias' ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <button type="button" onClick={() => setMesVisivel((mes) => subMonths(mes, 1))} className={NAV_TRIGGER_CLASS} aria-label="Mês anterior">
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-label-md font-label-md capitalize text-on-surface">
                    {format(mesVisivel, "MMMM 'de'", { locale: ptBR })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVisao('anos')}
                    className="rounded-lg px-1.5 py-0.5 text-label-md font-label-md text-on-surface outline-none transition-colors hover:bg-surface-container-low hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label="Selecionar ano"
                  >
                    {anoCentral}
                  </button>
                </div>
                <button type="button" onClick={() => setMesVisivel((mes) => addMonths(mes, 1))} className={NAV_TRIGGER_CLASS} aria-label="Próximo mês">
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {DIAS_DA_SEMANA.map((letra, indice) => (
                  <span key={indice} className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    {letra}
                  </span>
                ))}
                {dias.map((dia) => {
                  const foraDoMes = !isSameMonth(dia, mesVisivel)
                  const selecionado = dataSelecionada && isSameDay(dia, dataSelecionada)
                  const hoje = isToday(dia)
                  return (
                    <button
                      key={dia.toISOString()}
                      type="button"
                      onClick={() => selecionar(dia)}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40
                        ${selecionado ? 'bg-primary text-on-primary hover:opacity-90' : 'text-on-surface'}
                        ${foraDoMes && !selecionado ? 'text-outline/40' : ''}
                        ${hoje && !selecionado ? 'font-bold' : ''}`}
                    >
                      {format(dia, 'd')}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-outline-variant pt-3">
                <button type="button" onClick={limpar} className="rounded px-1 text-label-sm font-label-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40">
                  Limpar
                </button>
                <button type="button" onClick={irParaHoje} className="rounded px-1 text-label-sm font-label-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40">
                  Hoje
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <button type="button" onClick={() => setMesVisivel((mes) => subYears(mes, TAMANHO_GRADE_DE_ANOS))} className={NAV_TRIGGER_CLASS} aria-label="Década anterior">
                  <ChevronLeft size={20} />
                </button>
                <span className="text-label-md font-label-md text-on-surface">
                  {anosDaGrade[0]} – {anosDaGrade[anosDaGrade.length - 1]}
                </span>
                <button type="button" onClick={() => setMesVisivel((mes) => addYears(mes, TAMANHO_GRADE_DE_ANOS))} className={NAV_TRIGGER_CLASS} aria-label="Próxima década">
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {anosDaGrade.map((ano) => {
                  const selecionado = ano === anoCentral
                  const anoDeHoje = ano === getYear(new Date())
                  return (
                    <button
                      key={ano}
                      type="button"
                      onClick={() => selecionarAno(ano)}
                      className={`rounded-xl py-2 text-sm outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40
                        ${selecionado ? 'bg-primary text-on-primary hover:opacity-90' : 'text-on-surface'}
                        ${anoDeHoje && !selecionado ? 'font-bold' : ''}`}
                    >
                      {ano}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
