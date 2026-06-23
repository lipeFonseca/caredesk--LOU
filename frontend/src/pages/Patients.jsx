import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, Plus, Filter, ChevronRight,
  UserCheck, UserX, UserMinus, SlidersHorizontal
} from 'lucide-react'
import { api } from '@/services/api'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_OPTIONS = [
  { value: '',           label: 'Todos' },
  { value: 'active',     label: 'Ativos' },
  { value: 'paused',     label: 'Pausados' },
  { value: 'discharged', label: 'Alta' },
]

const URGENCY_OPTIONS = [
  { value: '',        label: 'Qualquer urgência' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'due',     label: 'Vencem hoje' },
  { value: 'soon',    label: 'Vencem em breve' },
  { value: 'ok',      label: 'Em dia' },
]

const urgencyInfo = {
  overdue: { label: 'Atrasado',       cls: 'badge-overdue' },
  due:     { label: 'Vence hoje',     cls: 'badge-due' },
  soon:    { label: 'Em breve',       cls: 'badge-soon' },
  ok:      { label: 'Em dia',         cls: 'badge-ok' },
  none:    { label: '—',              cls: 'badge-paused' },
}

const statusInfo = {
  active:     { label: 'Ativo',    cls: 'badge-ok',         Icon: UserCheck },
  paused:     { label: 'Pausado',  cls: 'badge-paused',     Icon: UserMinus },
  discharged: { label: 'Alta',     cls: 'badge-discharged', Icon: UserX },
}

export default function Patients() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('active')
  const [urgency, setUrgency]   = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const fetch = useCallback(() => {
    setLoading(true)
    const params = {}
    if (status)        params.status = status
    if (search.trim()) params.search = search.trim()

    api.patients.list(params)
      .then(data => {
        let list = data ?? []
        if (urgency) list = list.filter(p => p.followup_urgency === urgency)
        setPatients(list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search, status, urgency])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(fetch, 300)
    return () => clearTimeout(t)
  }, [fetch])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Pacientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{patients.length} resultado{patients.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/patients/new" className="btn-primary">
          <Plus size={16} /> Novo paciente
        </Link>
      </div>

      {/* Filtros */}
      <div className="card !p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome, telefone ou e-mail…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`btn ${showFilters ? 'bg-primary-50 text-primary-700' : 'btn-ghost'}`}
          >
            <SlidersHorizontal size={16} />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        </div>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-3"
          >
            <div className="flex-1 min-w-36">
              <label className="label">Status</label>
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-36">
              <label className="label">Urgência</label>
              <select className="input" value={urgency} onChange={e => setUrgency(e.target.value)}>
                {URGENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </motion.div>
        )}

        {/* Status quick-tabs */}
        {!showFilters && (
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setStatus(o.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${status === o.value
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="card h-[72px] animate-pulse bg-slate-50" />
          ))}
        </div>
      ) : patients.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-slate-400">
          <UserX size={40} className="mb-3 opacity-50" />
          <p className="font-medium">Nenhum paciente encontrado</p>
          <p className="text-sm mt-1">Tente ajustar os filtros ou cadastre um novo paciente</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {patients.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * .03 }}
            >
              <Link
                to={`/patients/${p.id}`}
                className="card card-hover flex items-center gap-4 !py-3.5 group"
              >
                <UrgencyBar urgency={p.followup_urgency} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-700 text-sm">{p.name}</p>
                    <span className={urgencyInfo[p.followup_urgency]?.cls}>
                      {urgencyInfo[p.followup_urgency]?.label}
                    </span>
                    {p.status !== 'active' && (
                      <span className={statusInfo[p.status]?.cls}>
                        {statusInfo[p.status]?.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {p.procedure}
                    {p.agent_name && ` · ${p.agent_name}`}
                    {p.surgery_date && ` · Cirurgia: ${format(parseISO(p.surgery_date), "dd/MM/yy")}`}
                  </p>
                </div>

                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-xs text-slate-500 font-medium">
                    {p.total_followups ?? 0} contato{p.total_followups !== 1 ? 's' : ''}
                  </p>
                  {p.last_contact_date && (
                    <p className="text-xs text-slate-400">
                      Último: {format(parseISO(p.last_contact_date), "dd MMM", { locale: ptBR })}
                    </p>
                  )}
                </div>

                <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UrgencyBar({ urgency }) {
  const colors = {
    overdue: 'bg-red-500',
    due:     'bg-orange-500',
    soon:    'bg-amber-400',
    ok:      'bg-emerald-500',
    none:    'bg-slate-200',
  }
  return (
    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${colors[urgency] ?? 'bg-slate-200'}`} />
  )
}
