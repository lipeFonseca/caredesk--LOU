import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CONTACT_TYPE_CONFIG, OUTCOME_CONFIG, getInitials } from '@/utils/contactDisplay'

const PAGE_SIZE = 20

function parseTs(ts) {
  if (!ts) return null
  // SQLite datetime('now') = 'YYYY-MM-DD HH:MM:SS' (UTC, sem timezone).
  // created_at de paciente pode vir ISO; normalizamos ambos.
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

function itemVisual(item) {
  if (item.kind === 'patient_created') {
    return { icon: 'person_add', tint: 'text-secondary' }
  }
  const cfg = CONTACT_TYPE_CONFIG[item.contact_type]
  return { icon: cfg?.icon ?? 'call', tint: 'text-primary' }
}

function itemTitle(item) {
  if (item.kind === 'patient_created') {
    return <>Paciente <span className="font-semibold">{item.patient_name}</span> cadastrado</>
  }
  const cfg = CONTACT_TYPE_CONFIG[item.contact_type]
  const typeLabel = cfg?.label ?? 'Contato'
  return <>{typeLabel} com <span className="font-semibold">{item.patient_name}</span></>
}

export default function Historico() {
  const [items,   setItems]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)

  const fetchPage = useCallback((pageNum) => {
    setLoading(true)
    api.activity.list({ page: pageNum, limit: PAGE_SIZE })
      .then(data => {
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
        setPage(pageNum)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchPage(1) }, [fetchPage])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-display-lg font-display-lg text-on-surface">Histórico</h2>
          {!loading && (
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-label-sm font-label-sm border border-primary/20">
              {total} registros
            </span>
          )}
        </div>
        <p className="text-body-md font-body-md text-on-surface-variant mt-1">
          Últimas alterações do sistema: pacientes cadastrados e contatos realizados.
        </p>
      </div>

      {/* ── Feed ────────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-6 flex flex-col gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-16 bg-surface-container-low animate-pulse rounded" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: '48px' }}>history</span>
            <p className="text-label-md font-label-md">Nenhuma atividade registrada ainda</p>
            <p className="text-body-md font-body-md text-outline">Cadastre um paciente ou registre um contato para começar</p>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/50">
            {items.map((item, idx) => {
              const visual  = itemVisual(item)
              const date    = parseTs(item.ts)
              const outcome = item.kind === 'contact' ? OUTCOME_CONFIG[item.outcome] : null
              return (
                <li key={`${item.kind}-${item.patient_id}-${item.ts}-${idx}`} className="flex items-start gap-4 px-6 py-4 hover:bg-surface-container-low transition-colors">
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 border border-outline-variant">
                    <span className={`material-symbols-outlined ${visual.tint}`} style={{ fontSize: '20px' }}>{visual.icon}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-body-md font-body-md text-on-surface">
                      <Link to={`/patients/${item.patient_id}`} className="hover:text-primary hover:underline transition-colors">
                        {itemTitle(item)}
                      </Link>
                    </p>
                    <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-label-sm font-label-sm text-on-surface-variant">
                      {item.agent_name && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-surface-container-highest flex items-center justify-center text-[10px] font-semibold text-primary border border-outline-variant">
                            {getInitials(item.agent_name)}
                          </span>
                          {item.agent_name}
                        </span>
                      )}
                      {outcome && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${outcome.cls}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{outcome.icon}</span>
                          {outcome.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {date && (
                    <div className="text-right shrink-0">
                      <p className="text-label-sm font-label-sm text-on-surface-variant">
                        {formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}
                      </p>
                      <p className="text-label-sm text-outline mt-0.5">
                        {format(date, "dd MMM yyyy, HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* ── Pagination ──────────────────────────────────── */}
        {!loading && items.length > 0 && (
          <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex items-center justify-between flex-wrap gap-3">
            <p className="text-label-sm font-label-sm text-outline">
              Mostrando{' '}
              <span className="font-medium text-on-surface">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
              </span>
              {' '}de{' '}
              <span className="font-medium text-on-surface">{total}</span>
              {' '}registros
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchPage(Math.max(1, page - 1))}
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
                      onClick={() => fetchPage(n)}
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
                onClick={() => fetchPage(Math.min(totalPages, page + 1))}
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
