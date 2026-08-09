import { useEffect, useRef, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function paraIso(data) {
  return format(data, 'yyyy-MM-dd')
}

function construirGradeDoMes(mesVisivel) {
  const inicio = startOfWeek(startOfMonth(mesVisivel))
  const fim = endOfWeek(endOfMonth(mesVisivel))
  return eachDayOfInterval({ start: inicio, end: fim })
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
export default function DatePickerField({ value, onChange, placeholder = 'Selecione a data', disabled = false }) {
  const [aberto, setAberto] = useState(false)
  const dataSelecionada = value ? parseISO(value) : null
  const [mesVisivel, setMesVisivel] = useState(dataSelecionada ?? new Date())
  const containerRef = useRef(null)

  useEffect(() => {
    if (dataSelecionada) setMesVisivel(dataSelecionada)
  }, [value])

  useEffect(() => {
    if (!aberto) return
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

  const dias = construirGradeDoMes(mesVisivel)

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-1 rounded-2xl border border-outline-variant/80 bg-surface-container-low py-2 pl-4 pr-1.5
          focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary-100/60 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-60"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)' }}
        data-disabled={disabled}
      >
        <button
          type="button"
          onClick={() => setAberto((estaAberto) => !estaAberto)}
          disabled={disabled}
          className="flex-1 truncate bg-transparent py-1 text-left text-base text-on-surface outline-none disabled:cursor-not-allowed"
        >
          {dataSelecionada ? format(dataSelecionada, 'dd/MM/yyyy') : <span className="text-on-surface-variant/70">{placeholder}</span>}
        </button>
        {value && !disabled && (
          <button
            type="button"
            onClick={limpar}
            className="rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-error-container/30 hover:text-error"
            aria-label="Limpar data"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAberto((estaAberto) => !estaAberto)}
          disabled={disabled}
          className="rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary disabled:pointer-events-none"
          aria-label="Abrir calendário"
        >
          <Calendar size={18} />
        </button>
      </div>

      {aberto && (
        <div role="dialog" aria-label="Calendário" className="absolute z-50 mt-2 w-[22rem] rounded-2xl border border-outline-variant bg-surface p-4 shadow-modal">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMesVisivel((mes) => subMonths(mes, 1))}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-label-md font-label-md capitalize text-on-surface">
              {format(mesVisivel, "MMMM 'de' yyyy", { locale: ptBR })}
            </span>
            <button
              type="button"
              onClick={() => setMesVisivel((mes) => addMonths(mes, 1))}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
              aria-label="Próximo mês"
            >
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
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm transition-colors hover:bg-primary/10
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
            <button type="button" onClick={limpar} className="text-label-sm font-label-sm text-primary hover:underline">
              Limpar
            </button>
            <button type="button" onClick={irParaHoje} className="text-label-sm font-label-sm text-primary hover:underline">
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
