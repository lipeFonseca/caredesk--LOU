import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { format, parseISO, differenceInCalendarDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const PAGE_SIZE = 20

const DATE_RANGES = [
  { value: '',   label: 'Todos os períodos' },
  { value: '7',  label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
]

const urgencyBadge = {
  overdue: {
    cls:   'inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm font-label-sm bg-error-container text-on-error-container border border-error/30 badge-delayed',
    dot:   'bg-error',
    icon:  null,
    label: 'Atrasado',
  },
  due: {
    cls:   'inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm font-label-sm bg-[#fff8e1] text-[#f57f17] border border-[#ffecb3]',
    dot:   'bg-[#f57f17]',
    icon:  null,
    label: 'Vence hoje',
  },
  soon: {
    cls:   'inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm font-label-sm bg-[#fff3e0] text-[#ef6c00] border border-[#ffe0b2]',
    dot:   null,
    icon:  'schedule',
    label: 'Em breve',
  },
  ok: {
    cls:   'inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm font-label-sm bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9]',
    dot:   null,
    icon:  'check_circle',
    label: 'OK',
  },
  none: {
    cls:   'inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm font-label-sm bg-surface-container-highest text-on-surface-variant',
    dot:   null,
    icon:  null,
    label: '—',
  },
}

function formatLastContact(dateStr) {
  if (!dateStr) return '—'
  const diff = differenceInCalendarDays(new Date(), parseISO(dateStr))
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 0)  return format(parseISO(dateStr), "dd MMM", { locale: ptBR })
  return `Há ${diff} dias`
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

export default function Patients() {
  const [patients,  setPatients]  = useState([])
  const [agents,    setAgents]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [status,    setStatus]    = useState('active')
  const [agentId,   setAgentId]   = useState('')
  const [dateRange, setDateRange] = useState('')
  const [page,      setPage]      = useState(1)

  useEffect(() => {
    api.agents.list().then(data => setAgents(data ?? [])).catch(() => {})
  }, [])

  const fetchPatients = useCallback(() => {
    setLoading(true)
    setPage(1)
    const params = {}
    if (status)        params.status   = status
    if (search.trim()) params.search   = search.trim()
    if (agentId)       params.agent_id = agentId
    if (dateRange)     params.from     = format(subDays(new Date(), parseInt(dateRange)), 'yyyy-MM-dd')

    api.patients.list(params)
      .then(data => setPatients(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search, status, agentId, dateRange])

  useEffect(() => {
    const t = setTimeout(fetchPatients, 300)
    return () => clearTimeout(t)
  }, [fetchPatients])

  const totalPages = Math.max(1, Math.ceil(patients.length / PAGE_SIZE))
  const paginated  = patients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-display-lg font-display-lg text-on-surface">Pacientes</h2>
            {!loading && (
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-label-sm font-label-sm border border-primary/20">
                {patients.length} Total
              </span>
            )}
          </div>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            Gerencie os pacientes, acompanhamentos e status de recuperação.
          </p>
        </div>
        <Link
          to="/patients/new"
          className="bg-primary hover:bg-primary-container text-on-primary text-label-md font-label-md py-2.5 px-5 rounded-lg flex items-center justify-center gap-2 transition-colors ambient-shadow-lvl1 self-start md:self-auto shrink-0"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          Novo Paciente
        </Link>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline" style={{ fontSize: '20px' }}>search</span>
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2 bg-background border border-outline-variant rounded-lg text-body-md font-body-md focus:ring-2 focus:ring-primary focus:border-primary transition-all text-on-surface placeholder:text-outline"
              placeholder="Buscar paciente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              className="w-full appearance-none pl-4 pr-10 py-2 bg-background border border-outline-variant rounded-lg text-body-md font-body-md focus:ring-2 focus:ring-primary focus:border-primary transition-all text-on-surface"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="">Status: Todos</option>
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
              <option value="discharged">Alta</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: '20px' }}>expand_more</span>
          </div>

          {/* Date range */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline" style={{ fontSize: '18px' }}>calendar_today</span>
            <select
              className="w-full appearance-none pl-10 pr-10 py-2 bg-background border border-outline-variant rounded-lg text-body-md font-body-md focus:ring-2 focus:ring-primary focus:border-primary transition-all text-on-surface"
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
            >
              {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: '20px' }}>expand_more</span>
          </div>

          {/* Specialist */}
          <div className="relative">
            <select
              className="w-full appearance-none pl-4 pr-10 py-2 bg-background border border-outline-variant rounded-lg text-body-md font-body-md focus:ring-2 focus:ring-primary focus:border-primary transition-all text-on-surface"
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
            >
              <option value="">Especialista: Todos</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: '20px' }}>expand_more</span>
          </div>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          {loading ? (
            <div className="p-6 flex flex-col gap-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-14 bg-surface-container-low animate-pulse rounded" />
              ))}
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: '48px' }}>person_search</span>
              <p className="text-label-md font-label-md">Nenhum paciente encontrado</p>
              <p className="text-body-md font-body-md text-outline">Tente ajustar os filtros ou cadastre um novo paciente</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse clinical-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Procedimento</th>
                  <th>Cirurgia</th>
                  <th>Último Contato</th>
                  <th>Próximo Follow-up</th>
                  <th>Especialista</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-body-md font-body-md text-on-surface">
                {paginated.map(p => {
                  const badge     = urgencyBadge[p.followup_urgency] ?? urgencyBadge.none
                  const isOverdue = p.followup_urgency === 'overdue'
                  return (
                    <tr
                      key={p.id}
                      className={`group transition-colors ${isOverdue ? 'overdue-row bg-error-container/10' : ''}`}
                    >
                      {/* Paciente */}
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary text-label-sm font-semibold border border-outline-variant shrink-0">
                            {getInitials(p.name)}
                          </div>
                          <div>
                            <p className="font-label-md text-on-surface group-hover:text-primary transition-colors">{p.name}</p>
                            {p.email && <p className="text-[12px] text-outline">{p.email}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Procedimento */}
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-outline" style={{ fontSize: '16px' }}>medical_services</span>
                          <span>{p.procedure}</span>
                        </div>
                      </td>

                      {/* Data da cirurgia */}
                      <td className="text-on-surface-variant">
                        {p.surgery_date
                          ? format(parseISO(p.surgery_date), "dd MMM yyyy", { locale: ptBR })
                          : '—'}
                      </td>

                      {/* Último contato */}
                      <td className={isOverdue ? 'text-error font-medium' : 'text-on-surface-variant'}>
                        {formatLastContact(p.last_contact_date)}
                      </td>

                      {/* Urgência / Próximo Follow-up */}
                      <td>
                        <span className={badge.cls}>
                          {badge.dot && (
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${badge.dot}`} />
                          )}
                          {badge.icon && (
                            <span className="material-symbols-outlined mr-1" style={{ fontSize: '14px' }}>{badge.icon}</span>
                          )}
                          {badge.label}
                        </span>
                      </td>

                      {/* Especialista */}
                      <td className="text-on-surface-variant">{p.agent_name ?? '—'}</td>

                      {/* Ações */}
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            to={`/patients/${p.id}`}
                            className="p-1.5 text-outline hover:text-primary rounded hover:bg-surface-container-high transition-colors"
                            title="Visualizar"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
                          </Link>
                          <Link
                            to={`/patients/${p.id}`}
                            className="p-1.5 text-outline hover:text-primary rounded hover:bg-surface-container-high transition-colors"
                            title="Editar"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ──────────────────────────────────── */}
        {!loading && patients.length > 0 && (
          <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex items-center justify-between flex-wrap gap-3">
            <p className="text-label-sm font-label-sm text-outline">
              Mostrando{' '}
              <span className="font-medium text-on-surface">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, patients.length)}
              </span>
              {' '}de{' '}
              <span className="font-medium text-on-surface">{patients.length}</span>
              {' '}pacientes
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-outline-variant text-outline hover:bg-surface hover:text-on-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const n = i + 1
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`w-7 h-7 rounded text-label-sm font-label-sm flex items-center justify-center transition-colors ${
                        page === n
                          ? 'bg-primary text-on-primary'
                          : 'hover:bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded border border-outline-variant text-outline hover:bg-surface hover:text-on-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
