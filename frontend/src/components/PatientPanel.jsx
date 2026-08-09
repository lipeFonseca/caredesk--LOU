import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/services/api'
import { useAuthStore } from '@/store'
import {
  buildProtocolTimeline,
  getNextFollowup,
  normalizeProtocolDays,
} from '@/utils/protocols'
import { URGENCY_BADGE, getInitials } from '@/utils/contactDisplay'
import PatientIdentitySummary from '@/components/patient/PatientIdentitySummary'
import PatientNextFollowupCard from '@/components/patient/PatientNextFollowupCard'
import PatientProtocolTimeline from '@/components/patient/PatientProtocolTimeline'
import ProtocolDayChips from '@/components/patient/ProtocolDayChips'
import ContactLogEntry from '@/components/patient/ContactLogEntry'

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
  const protocolDays    = normalizeProtocolDays(patient.protocol_days_parsed)
  const urg             = URGENCY_BADGE[patient.followup_urgency] ?? URGENCY_BADGE.none
  const nextFollowup    = getNextFollowup(patient, protocolDays)
  const timeline        = buildProtocolTimeline(patient, protocolDays)
  const initials        = getInitials(patient.name)

  return (
    <div className="p-5 space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <PatientIdentitySummary patient={patient} initials={initials} urg={urg} variant="compact" />

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
      {nextFollowup && <PatientNextFollowupCard nextFollowup={nextFollowup} variant="compact" />}

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
            <ProtocolDayChips days={protocolDays} variant="compact" />
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
      <PatientProtocolTimeline timeline={timeline} variant="compact" />

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
            {patient.followup_logs.map(log => (
              <ContactLogEntry key={log.id} log={log} variant="compact" />
            ))}
          </div>
        )}
      </div>

      <div className="pb-4" />
    </div>
  )
}
