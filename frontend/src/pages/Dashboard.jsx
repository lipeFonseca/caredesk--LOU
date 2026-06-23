import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, AlertTriangle, Clock, CheckCircle2, TrendingUp, ChevronRight } from 'lucide-react'
import { api } from '@/services/api'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const urgencyLabel = {
  overdue: { label: 'Atrasado',    cls: 'badge-overdue' },
  due:     { label: 'Vence hoje',  cls: 'badge-due' },
  soon:    { label: 'Vence em breve', cls: 'badge-soon' },
  ok:      { label: 'Em dia',      cls: 'badge-ok' },
  none:    { label: '—',           cls: 'badge-paused' },
}

export default function Dashboard() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.patients.list({ status: 'active' })
      .then(data => setPatients(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const stats = {
    total:    patients.length,
    overdue:  patients.filter(p => p.followup_urgency === 'overdue').length,
    due:      patients.filter(p => p.followup_urgency === 'due').length,
    ok:       patients.filter(p => p.followup_urgency === 'ok').length,
  }

  const urgent = patients
    .filter(p => ['overdue', 'due', 'soon'].includes(p.followup_urgency))
    .sort((a, b) => {
      const order = { overdue: 0, due: 1, soon: 2 }
      return order[a.followup_urgency] - order[b.followup_urgency]
    })
    .slice(0, 10)

  const cards = [
    { label: 'Pacientes ativos',    value: stats.total,   icon: Users,        color: 'text-primary-600',  bg: 'bg-primary-50' },
    { label: 'Atrasados',           value: stats.overdue, icon: AlertTriangle, color: 'text-red-600',      bg: 'bg-red-50' },
    { label: 'Vencem hoje',         value: stats.due,     icon: Clock,         color: 'text-orange-600',   bg: 'bg-orange-50' },
    { label: 'Em dia',              value: stats.ok,      icon: CheckCircle2,  color: 'text-emerald-600',  bg: 'bg-emerald-50' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Visão geral dos pacientes ativos</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * .07 }}
            className="card"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                {loading ? (
                  <div className="h-8 w-12 bg-slate-100 rounded-lg animate-pulse mt-1" />
                ) : (
                  <p className="text-3xl font-bold text-slate-800 mt-1">{card.value}</p>
                )}
              </div>
              <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon size={18} className={card.color} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pacientes urgentes */}
      <div className="card !p-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary-600" />
            <h2 className="font-semibold text-slate-700 text-sm">Requer atenção</h2>
          </div>
          <Link to="/patients" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
            Ver todos <ChevronRight size={13} />
          </Link>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : urgent.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-400">
            <CheckCircle2 size={36} className="text-emerald-400 mb-2" />
            <p className="text-sm font-medium">Todos os follow-ups em dia!</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-border/50">
            {urgent.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: .1 + i * .04 }}
              >
                <Link
                  to={`/patients/${p.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                >
                  <UrgencyDot urgency={p.followup_urgency} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {p.procedure} · {p.agent_name ?? 'Sem agente'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={urgencyLabel[p.followup_urgency]?.cls}>
                      {urgencyLabel[p.followup_urgency]?.label}
                    </span>
                    {p.surgery_date && (
                      <span className="text-xs text-slate-400 hidden sm:block">
                        {format(parseISO(p.surgery_date), "dd MMM ''yy", { locale: ptBR })}
                      </span>
                    )}
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function UrgencyDot({ urgency }) {
  const colors = {
    overdue: 'bg-red-500',
    due:     'bg-orange-500',
    soon:    'bg-amber-400',
    ok:      'bg-emerald-500',
    none:    'bg-slate-300',
  }
  return (
    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors[urgency] ?? 'bg-slate-300'}
      ${urgency === 'overdue' ? 'animate-pulse-dot' : ''}`}
    />
  )
}
