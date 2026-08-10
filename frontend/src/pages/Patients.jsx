import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useAuthStore } from '@/store'
import { format, parseISO, differenceInCalendarDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import PatientPanel from '@/components/PatientPanel'
import ImportPatientsModal from '@/components/patient/ImportPatientsModal'

const PAGE_SIZE = 20

// Espelha AVISO_ENCERRAMENTO_DIAS do worker (utils/patientQuery.js). Aqui é só
// texto; quem filtra de fato é o backend.
const AVISO_ENCERRAMENTO_DIAS = 30

// Visões da lista. Separadas do filtro de status porque respondem outra
// pergunta: status é a situação clínica, isto é a permanência do paciente no
// acompanhamento.
const VISOES = [
  { id: 'ativos',     label: 'Em acompanhamento', icon: 'groups',       params: {} },
  { id: 'encerrando', label: 'Encerrando',        icon: 'hourglass_bottom', params: { ending_soon: '1' } },
  { id: 'arquivados', label: 'Arquivados',        icon: 'inventory_2',  params: { archived: 'only' } },
]

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
  const { isAdmin } = useAuthStore()
  const [importModalOpen,  setImportModalOpen]  = useState(false)
  const [patients,         setPatients]         = useState([])
  const [total,            setTotal]            = useState(0)
  const [agents,           setAgents]           = useState([])
  const [loading,          setLoading]          = useState(true)
  const [search,           setSearch]           = useState('')
  const [status,           setStatus]           = useState('active')
  const [agentId,          setAgentId]          = useState('')
  const [dateRange,        setDateRange]        = useState('')
  const [nextCursor,       setNextCursor]       = useState(null)
  const [loadingMore,      setLoadingMore]      = useState(false)
  const [visao,            setVisao]            = useState('ativos')
  const [totalEncerrando,  setTotalEncerrando]  = useState(0)
  const [selectedPatientId, setSelectedPatientId] = useState(null)
  const [marcados,         setMarcados]         = useState([])
  const [processando,      setProcessando]      = useState(false)

  // Seleção existe em qualquer visão: nos arquivados para devolver, nas demais
  // para arquivar. As duas ações são reversíveis e disponíveis para o agente.
  const arquivandoEmMassa = visao !== 'arquivados'

  function alternarMarcado(id) {
    setMarcados((atuais) => (
      atuais.includes(id) ? atuais.filter((m) => m !== id) : [...atuais, id]
    ))
  }

  async function aplicarAcaoEmMassa() {
    setProcessando(true)
    try {
      await (arquivandoEmMassa
        ? api.patients.archiveMany(marcados)
        : api.patients.unarchiveMany(marcados))
      setMarcados([])
      fetchPage(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessando(false)
    }
  }

  // Badge da aba "Encerrando" — mesma contagem que o Dashboard exibe.
  useEffect(() => {
    api.dashboard.get()
      .then((data) => setTotalEncerrando(data.stats?.ending_soon ?? 0))
      .catch(() => {})
  }, [patients])

  useEffect(() => {
    api.agents.list().then(data => setAgents(data ?? [])).catch(() => {})
  }, [])

  const buildParams = useCallback((cursor) => {
    const params = { limit: PAGE_SIZE, ...(VISOES.find(v => v.id === visao)?.params ?? {}) }
    if (cursor)        params.cursor   = cursor
    if (status)        params.status   = status
    if (search.trim()) params.search   = search.trim()
    if (agentId)       params.agent_id = agentId
    if (dateRange)     params.from     = format(subDays(new Date(), parseInt(dateRange)), 'yyyy-MM-dd')
    return params
  }, [search, status, agentId, dateRange, visao])

  // Sem cursor = recomeçar do topo (filtro mudou). Com cursor = anexar à lista.
  const fetchPage = useCallback((cursor) => {
    const eContinuacao = Boolean(cursor)
    if (eContinuacao) setLoadingMore(true); else setLoading(true)

    api.patients.list(buildParams(cursor))
      .then(data => {
        const recebidos = data.patients ?? []
        setPatients(atuais => (eContinuacao ? [...atuais, ...recebidos] : recebidos))
        setNextCursor(data.next_cursor ?? null)
        // `total` só vem no modo paginado por número; no cursor a API não conta
        // de propósito — COUNT(*) em base grande custa quase tanto quanto a
        // própria listagem. Mostramos quantos já foram carregados.
        setTotal(data.total ?? null)
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }, [buildParams])

  useEffect(() => {
    const t = setTimeout(() => fetchPage(null), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, agentId, dateRange, visao])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-display-lg font-display-lg text-on-surface">Pacientes</h2>
            {!loading && (
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-label-sm font-label-sm border border-primary/20">
                {patients.length}{nextCursor ? '+' : ''} {patients.length === 1 ? 'paciente' : 'pacientes'}
              </span>
            )}
          </div>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            {visao === 'arquivados'
              ? 'Pacientes que completaram o acompanhamento. Os dados seguem preservados.'
              : visao === 'encerrando'
                ? `Saem do acompanhamento nos próximos ${AVISO_ENCERRAMENTO_DIAS} dias.`
                : 'Gerencie os pacientes, acompanhamentos e status de recuperação.'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          {isAdmin() && (
            <button
              onClick={() => setImportModalOpen(true)}
              className="btn-ghost"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
              Importar CSV
            </button>
          )}
          <Link
            to="/patients/new"
            className="bg-primary hover:bg-primary-container text-on-primary text-label-md font-label-md py-2.5 px-5 rounded-lg flex items-center justify-center gap-2 transition-colors ambient-shadow-lvl1"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            Novo Paciente
          </Link>
        </div>
      </div>

      {/* ── Visões ──────────────────────────────────────────── */}
      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-fit border border-outline-variant">
        {VISOES.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => { setVisao(id); setMarcados([]) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-label-md font-label-md transition-all ${
              visao === id
                ? 'bg-surface text-on-surface ambient-shadow-lvl1'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{icon}</span>
            {label}
            {id === 'encerrando' && totalEncerrando > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[#fff8e1] text-[#f57f17] text-label-sm leading-none">
                {totalEncerrando}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Ação em massa (só com seleção ativa) ─────────────── */}
      {marcados.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap rounded-xl border border-primary/30 bg-primary/5 px-5 py-3">
          <p className="text-body-md text-on-surface">
            <strong>{marcados.length}</strong> paciente{marcados.length === 1 ? '' : 's'} selecionado{marcados.length === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setMarcados([])} className="btn-ghost" disabled={processando}>
              Limpar seleção
            </button>
            <button onClick={aplicarAcaoEmMassa} className="btn-primary" disabled={processando}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {arquivandoEmMassa ? 'inventory_2' : 'unarchive'}
              </span>
              {processando
                ? 'Aplicando...'
                : arquivandoEmMassa ? 'Arquivar selecionados' : 'Devolver ao acompanhamento'}
            </button>
          </div>
        </div>
      )}

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline" style={{ fontSize: '20px' }}>search</span>
            <input
              type="text"
              className="input pl-10"
              placeholder="Buscar paciente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              className="input appearance-none pr-10"
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
              className="input appearance-none pl-10 pr-10"
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
              className="input appearance-none pr-10"
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
                  <th className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os pacientes desta página"
                      checked={marcados.length > 0 && marcados.length === patients.length}
                      onChange={(e) => setMarcados(e.target.checked ? patients.map((p) => p.id) : [])}
                    />
                  </th>
                  <th>Paciente</th>
                  <th>Procedimento</th>
                  <th>Cirurgia</th>
                  <th>Último Contato</th>
                  <th>Próximo Contato</th>
                  <th>Especialista</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-body-md font-body-md text-on-surface">
                {patients.map(p => {
                  const badge     = urgencyBadge[p.followup_urgency] ?? urgencyBadge.none
                  const isOverdue = p.followup_urgency === 'overdue'
                  return (
                    <tr
                      key={p.id}
                      className={`group transition-colors ${isOverdue ? 'overdue-row bg-error-container/10' : ''}`}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${p.name}`}
                          checked={marcados.includes(p.id)}
                          onChange={() => alternarMarcado(p.id)}
                        />
                      </td>

                      {/* Paciente */}
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary text-label-sm font-semibold border border-outline-variant shrink-0">
                            {getInitials(p.name)}
                          </div>
                          <div>
                            <Link to={`/patients/${p.id}`} className="font-label-md text-on-surface hover:text-primary transition-colors hover:underline">
                              {p.name}
                            </Link>
                            {/* Só aparece quando é informação nova: na aba de
                                arquivados o estado já é o próprio contexto. */}
                            {visao !== 'arquivados' && p.days_until_archive != null && p.days_until_archive <= AVISO_ENCERRAMENTO_DIAS && (
                              <span className="block mt-0.5 text-label-sm text-[#f57f17]">
                                {p.days_until_archive > 0
                                  ? `arquiva em ${p.days_until_archive} dia${p.days_until_archive === 1 ? '' : 's'}`
                                  : 'arquiva na próxima madrugada'}
                              </span>
                            )}
                            {visao === 'arquivados' && p.archived_at && (
                              <span className="block mt-0.5 text-label-sm text-outline">
                                arquivado em {format(parseISO(p.archived_at.replace(' ', 'T')), 'dd MMM yyyy', { locale: ptBR })}
                              </span>
                            )}
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
                          <button
                            onClick={() => setSelectedPatientId(p.id)}
                            className="p-1.5 text-outline hover:text-primary rounded hover:bg-surface-container-high transition-colors"
                            title="Visualizar"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>visibility</span>
                          </button>
                          <Link
                            to={`/patients/${p.id}`}
                            className="p-1.5 text-outline hover:text-primary rounded hover:bg-surface-container-high transition-colors"
                            title="Ver página completa"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>open_in_full</span>
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

        {/* ── Carregar mais ───────────────────────────────── */}
        {!loading && patients.length > 0 && (
          <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex items-center justify-between flex-wrap gap-3">
            <p className="text-label-sm font-label-sm text-outline">
              <span className="font-medium text-on-surface">{patients.length}</span>
              {' '}paciente{patients.length === 1 ? '' : 's'} carregado{patients.length === 1 ? '' : 's'}
              {!nextCursor && patients.length > PAGE_SIZE && ' — fim da lista'}
            </p>
            {nextCursor && (
              <button
                onClick={() => fetchPage(nextCursor)}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg border border-outline-variant text-label-md font-label-md text-on-surface hover:bg-surface hover:border-primary hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-outline/40 border-t-primary" />
                    Carregando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>expand_more</span>
                    Carregar mais
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      <PatientPanel
        patientId={selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
      />

      <ImportPatientsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => fetchPage(null)}
      />
    </div>
  )
}

