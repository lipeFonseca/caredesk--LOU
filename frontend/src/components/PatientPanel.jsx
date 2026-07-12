import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/services/api'
import { useAuthStore, useSettingsStore } from '@/store'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  buildProtocolTimeline,
  formatProtocolDay,
  formatProtocolDayShort,
  getNextFollowup,
  normalizeProtocolDays,
} from '@/utils/protocols'

const urgencyBadge = {
  overdue: { cls: 'bg-error-container text-on-error-container border border-error/30',   label: 'Atrasado' },
  due:     { cls: 'bg-[#fff8e1] text-[#f57f17] border border-[#ffecb3]',                label: 'Vence hoje' },
  soon:    { cls: 'bg-[#fff3e0] text-[#ef6c00] border border-[#ffe0b2]',                label: 'Em breve' },
  ok:      { cls: 'bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9]',               label: 'Em dia' },
  none:    { cls: 'bg-surface-container-highest text-on-surface-variant border border-outline-variant', label: '—' },
}

const statusLabel = { active: 'Ativo', paused: 'Pausado', discharged: 'Alta' }

const typeConfig = {
  call:      { icon: 'call',      color: 'text-primary',     label: 'Ligação' },
  email:     { icon: 'history',   color: 'text-primary',     label: 'Contato legado' },
  in_person: { icon: 'handshake', color: 'text-primary',     label: 'Presencial' },
}

const outcomeConfig = {
  reached:            { cls: 'bg-secondary-container/20 text-on-secondary-container', icon: 'check_circle', label: 'Contato realizado' },
  no_answer:          { cls: 'bg-surface-container-high text-on-surface-variant',     icon: 'phone_missed',  label: 'Sem resposta' },
  callback_scheduled: { cls: 'bg-[#fff8e1] text-[#f57f17]',                           icon: 'schedule',      label: 'Retorno agendado' },
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

export default function PatientPanel({ patientId, onClose }) {
  const { isAdmin } = useAuthStore()
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!patientId) { setPatient(null); return }
    setLoading(true)
    api.patients.get(patientId)
      .then(setPatient)
      .catch(() => onClose())
      .finally(() => setLoading(false))
  }, [patientId])

  const open = !!patientId

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: .2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[500px] z-50 bg-surface border-l border-outline-variant shadow-2xl flex flex-col overflow-hidden"
          >
            {/* ── Topo fixo ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant bg-surface shrink-0">
              <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
                <Link to="/patients" onClick={onClose} className="hover:text-primary transition-colors">
                  Pacientes
                </Link>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
                <span className="text-on-surface font-medium truncate max-w-[200px]">
                  {loading ? '…' : (patient?.name ?? '')}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            {/* ── Conteúdo rolável ───────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 space-y-4 animate-pulse">
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-16 rounded-full bg-surface-container-high" />
                    <div className="space-y-2 flex-1">
                      <div className="h-5 bg-surface-container-high rounded w-2/3" />
                      <div className="h-4 bg-surface-container-low rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-40 bg-surface-container-low rounded-xl" />
                  <div className="h-32 bg-surface-container-low rounded-xl" />
                  <div className="h-48 bg-surface-container-low rounded-xl" />
                </div>
              ) : patient ? (
                <PanelContent patient={patient} onClose={onClose} isAdmin={isAdmin} />
              ) : null}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function PanelContent({ patient, onClose, isAdmin }) {
  const getProtocolDays = useSettingsStore(s => s.getProtocolDays)
  const protocolDays    = normalizeProtocolDays(patient.protocol_days_parsed ?? getProtocolDays())
  const urg             = urgencyBadge[patient.followup_urgency] ?? urgencyBadge.none
  const nextFollowup    = getNextFollowup(patient, protocolDays)
  const timeline        = buildProtocolTimeline(patient, protocolDays)
  const initials        = getInitials(patient.name)

  return (
    <div className="p-5 space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full bg-surface-container-high text-primary flex items-center justify-center text-display-md font-semibold shrink-0 border-2 border-primary/20">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-display-md font-display-md text-on-surface truncate">{patient.name}</h2>
          <p className="text-body-md text-on-surface-variant flex items-center gap-1.5 mt-0.5 flex-wrap">
            {patient.procedure}
            <span className="text-outline">•</span>
            {patient.surgery_date
              ? format(parseISO(patient.surgery_date), "dd MMM. yyyy", { locale: ptBR })
              : '—'}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`px-2.5 py-0.5 rounded-full text-label-sm font-label-sm uppercase tracking-wider ${urg.cls}`}>
              {urg.label}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-label-sm font-label-sm uppercase tracking-wider bg-surface-container-high text-on-surface-variant border border-outline-variant">
              {statusLabel[patient.status]}
            </span>
          </div>
        </div>
      </div>

      {/* ── Botões de ação ──────────────────────────────────────── */}
      <div className="flex gap-2">
        <Link
          to={`/patients/${patient.id}`}
          onClick={onClose}
          className="flex-1 px-4 py-2 bg-surface text-on-surface border border-outline-variant rounded-lg text-label-md font-label-md hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_full</span>
          Ver completo
        </Link>
        <Link
          to={`/patients/${patient.id}`}
          state={{ openEdit: true }}
          onClick={onClose}
          className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg text-label-md font-label-md hover:opacity-90 transition-opacity ambient-shadow-lvl1 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Registrar Contato
        </Link>
      </div>

      {/* ── Próximo Contato ────────────────────────────────────── */}
      {nextFollowup && (
        <div className="bg-primary text-on-primary rounded-xl p-5 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }}
          />
          <div className="relative z-10">
            <p className="text-label-sm font-label-sm text-primary-fixed-dim uppercase tracking-wider mb-1 flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>event</span>
              Próximo Contato
            </p>
            <div className="text-headline-sm font-headline-sm mb-0.5">
              {format(nextFollowup.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </div>
            <p className="text-body-md text-primary-fixed mb-4">{nextFollowup.label}</p>
            <div className="flex items-center justify-between bg-black/10 rounded-lg px-4 py-3">
              <div>
                <div className="text-display-md font-display-md">{Math.abs(nextFollowup.daysRemaining)}</div>
                <div className="text-label-sm font-label-sm text-primary-fixed-dim uppercase tracking-wider">
                  {nextFollowup.daysRemaining >= 0 ? 'Dias Restantes' : 'Dias em Atraso'}
                </div>
              </div>
              <div className="relative w-14 h-14 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path fill="none" stroke="currentColor" strokeDasharray="100, 100" strokeWidth="3"
                    className="text-white/20"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path fill="none" stroke="currentColor"
                    strokeDasharray={`${nextFollowup.countdownProgress}, 100`}
                    strokeLinecap="round" strokeWidth="3"
                    className="text-white"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute text-label-sm font-label-sm font-bold">{nextFollowup.countdownProgress}%</span>
              </div>
            </div>
            <p className="text-[11px] text-primary-fixed-dim mt-3">
              Percentual restante até o próximo marco do protocolo.
            </p>
          </div>
        </div>
      )}

      {/* ── Dados Clínicos ───────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant p-5">
        <h3 className="text-label-md font-label-md text-on-surface font-semibold mb-4 pb-3 border-b border-outline-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: '18px' }}>patient_list</span>
          Dados Clínicos
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Telefone</p>
            <p className="text-body-md font-body-md text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: '14px' }}>call</span>
              <span className="truncate">{patient.phone || <span className="text-outline">—</span>}</span>
            </p>
          </div>
          <div>
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Especialista</p>
            <p className="text-body-md font-body-md text-on-surface flex items-center gap-1.5">
              {patient.agent_name ? (
                <>
                  <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-[9px] font-bold text-primary border border-outline-variant shrink-0">
                    {getInitials(patient.agent_name)}
                  </span>
                  <span className="truncate">{patient.agent_name}</span>
                </>
              ) : <span className="text-outline">Não atribuído</span>}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">Protocolo</p>
            <div className="flex flex-wrap gap-1">
              {protocolDays.map(d => (
                <span key={d} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  d < 0  ? 'bg-[#fff3e0] border-[#ffe0b2] text-[#ef6c00]'
                         : d === 0 ? 'bg-primary/10 border-primary/30 text-primary'
                         : 'bg-secondary/10 border-secondary/30 text-secondary'
                }`}>
                  {formatProtocolDay(d)}
                </span>
              ))}
            </div>
          </div>
          {patient.notes && (
            <div className="col-span-2 mt-1">
              <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Notas Clínicas</p>
              <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant text-body-md text-on-surface leading-relaxed">
                {patient.notes}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Linha do Tempo ──────────────────────────────────────── */}
      {timeline.length > 0 && (
        <div className="bg-surface rounded-xl border border-outline-variant p-5">
          <h3 className="text-label-md font-label-md text-on-surface font-semibold mb-3 pb-3 border-b border-outline-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: '18px' }}>timeline</span>
            Linha do Tempo
            <span className="ml-auto text-label-sm text-on-surface-variant">
              {timeline.filter(t => t.status === 'completed').length}/{timeline.length}
            </span>
          </h3>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-center gap-0" style={{ minWidth: 'max-content' }}>
              {timeline.map((item, i) => (
                <div key={item.day} className="flex items-center">
                  {i > 0 && (
                    <div className={`w-4 h-px ${
                      item.status === 'completed' ? 'bg-secondary' :
                      item.status === 'overdue'   ? 'bg-error/40' :
                      'bg-outline-variant'
                    }`} />
                  )}
                  <div className={`flex flex-col items-center px-1.5 py-1 rounded-lg border text-center min-w-[52px] ${
                    item.status === 'completed' ? 'bg-secondary/10 border-secondary/30 text-secondary' :
                    item.status === 'overdue'   ? 'bg-error-container/20 border-error/30 text-error'  :
                    item.status === 'due'       ? 'bg-[#fff8e1] border-[#ffecb3] text-[#f57f17]'   :
                    item.status === 'next'      ? 'bg-primary text-on-primary border-primary'         :
                    'bg-surface-container-low border-outline-variant text-on-surface-variant'
                  }`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>
                      {item.status === 'completed' ? 'check_circle' :
                       item.status === 'overdue'   ? 'warning' :
                       item.status === 'due'       ? 'event_available' :
                       item.status === 'next'      ? 'notifications_active' :
                       'radio_button_unchecked'}
                    </span>
                    <span className="text-[9px] font-bold whitespace-nowrap mt-0.5">
                      {formatProtocolDayShort(item.day)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Ações Rápidas ────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant p-5">
        <h3 className="text-label-md font-label-md text-on-surface font-semibold mb-4 pb-3 border-b border-outline-variant">
          Ações Rápidas
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: 'open_in_full',   label: 'Ver Página\nCompleta',  to: `/patients/${patient.id}` },
            { icon: 'call',           label: 'Fazer\nLigação',       href: patient.phone ? `tel:${patient.phone}` : null },
            { icon: 'edit',           label: 'Editar\nDados',         to: `/patients/${patient.id}` },
            ...(isAdmin()
              ? [{ icon: 'delete', label: 'Excluir\nPaciente', danger: true, to: `/patients/${patient.id}` }]
              : [{ icon: 'calendar_add_on', label: 'Reagendar', to: `/patients/${patient.id}` }]
            ),
          ].map((item, i) => {
            const cls = `flex flex-col items-center justify-center p-4 rounded-lg border transition-colors group ${
              item.danger
                ? 'bg-error-container/10 border-error/20 hover:bg-error-container/30'
                : 'bg-surface-container-low border-outline-variant hover:bg-surface-container-high'
            }`
            const iconCls = `material-symbols-outlined mb-2 transition-colors ${
              item.danger ? 'text-error' : 'text-outline group-hover:text-primary'
            }`
            const content = (
              <>
                <span className={iconCls}>{item.icon}</span>
                <span className="text-label-sm font-label-sm text-on-surface text-center leading-tight whitespace-pre-line">
                  {item.label}
                </span>
              </>
            )
            if (item.href) return (
              <a key={i} href={item.href} className={cls} target="_blank" rel="noopener noreferrer">
                {content}
              </a>
            )
            if (item.to) return (
              <Link key={i} to={item.to} onClick={onClose} className={cls}>
                {content}
              </Link>
            )
            return <button key={i} disabled className={`${cls} opacity-40`}>{content}</button>
          })}
        </div>
      </div>

      {/* ── Histórico ────────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant p-5">
        <h3 className="text-label-md font-label-md text-on-surface font-semibold mb-4 pb-3 border-b border-outline-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: '18px' }}>history</span>
          Histórico de Contatos
          <span className="ml-auto bg-surface-container-high text-on-surface-variant text-label-sm px-2 py-0.5 rounded-full border border-outline-variant">
            {patient.followup_logs?.length ?? 0}
          </span>
        </h3>
        {!patient.followup_logs?.length ? (
          <div className="flex flex-col items-center py-8 gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: '36px' }}>history_toggle_off</span>
            <p className="text-label-md font-label-md">Nenhum contato registrado</p>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-surface-container-high space-y-6">
            {patient.followup_logs.map(log => {
              const tc = typeConfig[log.contact_type] ?? typeConfig.call
              const oc = outcomeConfig[log.outcome] ?? outcomeConfig.no_answer
              return (
                <div key={log.id} className="relative">
                  <div className="absolute -left-[29px] w-4 h-4 rounded-full bg-secondary text-on-secondary flex items-center justify-center border-4 border-white shadow-sm">
                    <span className="material-symbols-outlined" style={{ fontSize: '8px', fontVariationSettings: "'FILL' 1, 'wght' 700" }}>check</span>
                  </div>
                  <div className="bg-surface border border-outline-variant rounded-lg p-3 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow">
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`material-symbols-outlined ${tc.color}`} style={{ fontSize: '16px' }}>{tc.icon}</span>
                        <span className="text-label-md font-label-md text-on-surface font-semibold">{tc.label}</span>
                      </div>
                      <span className="text-label-sm font-label-sm text-on-surface-variant">
                        {log.contact_date ? format(parseISO(log.contact_date), "dd MMM. yyyy", { locale: ptBR }) : '—'}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="text-body-md font-body-md text-on-surface-variant mb-2 line-clamp-2">{log.notes}</p>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-surface-container-highest">
                      <span className={`inline-flex items-center gap-1 text-label-sm font-label-sm px-1.5 py-0.5 rounded ${oc.cls}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{oc.icon}</span>
                        {oc.label}
                      </span>
                      <span className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                          {log.agent_name ? 'person' : 'smart_toy'}
                        </span>
                        {log.agent_name ?? 'Auto'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="pb-4" />
    </div>
  )
}
