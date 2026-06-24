import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useNotifStore } from '@/store'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const urgencyConfig = {
  overdue: {
    bar:   'bg-error',
    badge: 'bg-error/10 text-error',
    label: 'Atrasado',
    btn:   'bg-primary text-on-primary hover:bg-on-primary-fixed-variant',
  },
  due: {
    bar:   'bg-tertiary-container',
    badge: 'bg-tertiary-container/10 text-tertiary-container',
    label: 'Hoje',
    btn:   'bg-primary text-on-primary hover:bg-on-primary-fixed-variant',
  },
  soon: {
    bar:   'bg-primary',
    badge: 'bg-surface-container-highest text-on-surface-variant',
    label: 'Em breve',
    btn:   'bg-surface-container-high text-on-surface hover:bg-surface-dim',
  },
}

const activityConfig = {
  followup_overdue: {
    icon:  'priority_high',
    bg:    'bg-error/10',
    color: 'text-error',
    label: 'Follow-up atrasado',
  },
  followup_due: {
    icon:  'notifications_active',
    bg:    'bg-primary/10',
    color: 'text-primary',
    label: 'Follow-up pendente',
  },
}

export default function Dashboard() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading]   = useState(true)
  const { notifications }       = useNotifStore()

  useEffect(() => {
    api.patients.list({ status: 'active' })
      .then(data => setPatients(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const stats = {
    total:   patients.length,
    overdue: patients.filter(p => p.followup_urgency === 'overdue').length,
    due:     patients.filter(p => p.followup_urgency === 'due').length,
    ok:      patients.filter(p => p.followup_urgency === 'ok').length,
  }

  const todayContacts = patients
    .filter(p => ['overdue', 'due', 'soon'].includes(p.followup_urgency))
    .sort((a, b) => {
      const order = { overdue: 0, due: 1, soon: 2 }
      return order[a.followup_urgency] - order[b.followup_urgency]
    })
    .slice(0, 10)

  const kpiCards = [
    {
      label:      'Pacientes Ativos',
      value:      stats.total,
      icon:       'group',
      iconBg:     'bg-primary/10',
      iconColor:  'text-primary',
      valueColor: 'text-on-surface',
    },
    {
      label:      'Follow-ups Hoje',
      value:      stats.due,
      icon:       'calendar_month',
      iconBg:     'bg-tertiary-container/10',
      iconColor:  'text-tertiary-container',
      valueColor: 'text-on-surface',
    },
    {
      label:      'Atrasados',
      value:      stats.overdue,
      icon:       'warning',
      iconBg:     'bg-error/10',
      iconColor:  'text-error',
      valueColor: 'text-error',
    },
    {
      label:      'Em Dia',
      value:      stats.ok,
      icon:       'check_circle',
      iconBg:     'bg-secondary/10',
      iconColor:  'text-secondary',
      valueColor: 'text-on-surface',
    },
  ]

  return (
    <div className="flex flex-col xl:flex-row gap-8 w-full">

      {/* ── Coluna principal ───────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-8">

        {/* KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((card, i) => (
            <div key={i} className="bg-surface-container-low p-5 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className={`w-10 h-10 ${card.iconBg} flex items-center justify-center ${card.iconColor}`}>
                  <span className="material-symbols-outlined fill-icon">{card.icon}</span>
                </div>
              </div>
              <div>
                <p className="text-label-md font-label-md text-on-surface-variant">{card.label}</p>
                {loading ? (
                  <div className="h-8 w-12 bg-outline-variant/20 animate-pulse mt-1 rounded" />
                ) : (
                  <h3 className={`text-display-md font-display-md mt-1 ${card.valueColor}`}>
                    {card.value}
                  </h3>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* Contatos de Hoje */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-surface-container p-4">
            <h3 className="text-headline-sm font-headline-sm text-on-surface">Contatos de Hoje</h3>
            <Link
              to="/patients"
              className="text-label-md font-label-md text-primary hover:text-primary-fixed-dim transition-colors flex items-center gap-1"
            >
              Ver todos <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-surface-container-low animate-pulse" />
              ))}
            </div>
          ) : todayContacts.length === 0 ? (
            <div className="bg-surface-container-low p-10 flex flex-col items-center gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined fill-icon text-secondary" style={{ fontSize: '40px' }}>check_circle</span>
              <p className="text-label-md font-label-md">Todos os follow-ups em dia!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {todayContacts.map(p => {
                const cfg = urgencyConfig[p.followup_urgency] ?? urgencyConfig.soon
                return (
                  <div
                    key={p.id}
                    className="bg-surface-container-low flex items-center p-4 gap-4 relative overflow-hidden hover:bg-surface-container transition-colors"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />
                    <div className="flex-grow pl-2 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="text-label-md font-label-md text-on-surface font-semibold truncate">{p.name}</h4>
                        <span className={`text-[10px] font-label-sm uppercase tracking-wider px-2 py-0.5 shrink-0 ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-body-md font-body-md text-on-surface-variant truncate">
                        {p.procedure}
                        {p.agent_name && <span className="text-outline"> · {p.agent_name}</span>}
                      </p>
                    </div>
                    <Link
                      to={`/patients/${p.id}`}
                      className={`shrink-0 px-4 py-2 text-label-md font-label-md transition-colors ${cfg.btn}`}
                    >
                      Registrar Contato
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Sidebar: Atividade Recente ─────────────────────── */}
      <aside className="w-full xl:w-[320px] shrink-0">
        <div className="bg-surface-container-low p-6">
          <h3 className="text-headline-sm font-headline-sm text-on-surface mb-6">Atividade Recente</h3>

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: '36px' }}>notifications_none</span>
              <p className="text-body-md font-body-md text-center">Nenhuma atividade recente</p>
            </div>
          ) : (
            <div
              className="relative flex flex-col gap-6"
              style={{
                paddingLeft: '2.5rem',
              }}
            >
              {/* Linha vertical da timeline */}
              <div
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-outline-variant/30 to-transparent"
                style={{ left: '1.25rem' }}
              />

              {notifications.slice(0, 7).map(n => {
                const cfg = activityConfig[n.type] ?? activityConfig.followup_due
                return (
                  <div key={n.id} className="relative flex items-start gap-4">
                    <div
                      className={`absolute w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 border-surface-container-low z-10 ${cfg.bg}`}
                      style={{ left: '-2.5rem' }}
                    >
                      <span className={`material-symbols-outlined ${cfg.color}`} style={{ fontSize: '16px' }}>
                        {cfg.icon}
                      </span>
                    </div>
                    <div className="flex-grow pb-1 min-w-0">
                      <p className="text-label-md font-label-md text-on-surface">
                        {cfg.label}
                        {n.patient_name && (
                          <> — <span className="font-semibold">{n.patient_name}</span></>
                        )}
                      </p>
                      {n.procedure && (
                        <p className="text-body-md font-body-md text-on-surface-variant mt-0.5 truncate">
                          {n.procedure}
                        </p>
                      )}
                      <span className="text-label-sm font-label-sm text-outline mt-1 block">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                        {!n.is_read && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary ml-2 align-middle" />
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
