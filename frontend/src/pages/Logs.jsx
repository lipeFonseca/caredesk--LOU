import { useState, useEffect, useCallback } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/services/api'
import { parseSqliteTimestamp } from '@/utils/sqliteDate'

const PAGE_SIZE = 20

export default function Logs() {
  const [items,     setItems]     = useState([])
  const [total,     setTotal]     = useState(0)
  const [retencao,  setRetencao]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(1)
  // Stack e longo e ruidoso: fica recolhido, aberto um por vez sob demanda.
  const [stackAberto, setStackAberto] = useState(null)

  const fetchPage = useCallback((pageNum) => {
    setLoading(true)
    setStackAberto(null)
    api.logs.list({ page: pageNum, limit: PAGE_SIZE })
      .then(data => {
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
        setRetencao(data.retention_days ?? null)
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
          <h2 className="text-display-lg font-display-lg text-on-surface">Logs</h2>
          {!loading && total > 0 && (
            <span className="bg-error/10 text-error px-3 py-1 rounded-full text-label-sm font-label-sm border border-error/20">
              {total} {total === 1 ? 'erro' : 'erros'}
            </span>
          )}
        </div>
        <p className="text-body-md font-body-md text-on-surface-variant mt-1">
          Erros de servidor registrados pela API.
          {retencao && ` Mantidos por ${retencao} dias e removidos automaticamente depois disso.`}
        </p>
      </div>

      {/* ── Lista ───────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-6 flex flex-col gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-16 bg-surface-container-low animate-pulse rounded" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: '48px' }}>check_circle</span>
            <p className="text-label-md font-label-md">Nenhum erro registrado</p>
            <p className="text-body-md font-body-md text-outline">A API não retornou erro interno no período retido</p>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/50">
            {items.map((item) => {
              const data = parseSqliteTimestamp(item.occurred_at)
              const aberto = stackAberto === item.id
              return (
                <li key={item.id} className="px-6 py-4 hover:bg-surface-container-low transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center shrink-0 border border-error/20">
                      <span className="material-symbols-outlined text-error" style={{ fontSize: '20px' }}>error</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-body-md font-body-md text-on-surface break-words">{item.message}</p>

                      <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-label-sm font-label-sm text-on-surface-variant">
                        {item.path && (
                          <span className="font-mono text-label-sm px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant">
                            {item.method} {item.path}
                          </span>
                        )}
                        {item.agent_email && (
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>person</span>
                            {item.agent_email}
                          </span>
                        )}
                        {item.ip && (
                          <span className="inline-flex items-center gap-1 text-outline">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>lan</span>
                            {item.ip}
                          </span>
                        )}
                        {item.stack && (
                          <button
                            onClick={() => setStackAberto(aberto ? null : item.id)}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                              {aberto ? 'expand_less' : 'expand_more'}
                            </span>
                            {aberto ? 'Ocultar detalhes' : 'Ver detalhes'}
                          </button>
                        )}
                      </div>
                    </div>

                    {data && (
                      <div className="text-right shrink-0">
                        <p className="text-label-sm font-label-sm text-on-surface-variant">
                          {formatDistanceToNow(data, { addSuffix: true, locale: ptBR })}
                        </p>
                        <p className="text-label-sm text-outline mt-0.5">
                          {format(data, "dd MMM yyyy, HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>

                  {aberto && (
                    <pre className="mt-3 ml-14 p-3 rounded bg-surface-container-high border border-outline-variant text-label-sm text-on-surface-variant overflow-x-auto whitespace-pre-wrap break-words">
                      {item.stack}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* ── Paginação ───────────────────────────────────── */}
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
