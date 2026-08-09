import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS_LABEL } from '@/utils/contactDisplay'

const CONFIG = {
  full: {
    row: 'flex items-center gap-6',
    avatar: 'w-20 h-20 rounded-full bg-surface-container-high text-primary flex items-center justify-center text-display-md font-semibold shrink-0 border-2 border-primary/20',
    info: undefined,
    Tag: 'h1',
    title: 'text-display-md font-display-md text-on-surface mb-1',
    subtitle: 'text-body-lg text-on-surface-variant mb-3 flex items-center gap-2',
    badges: 'flex flex-wrap gap-2',
    badge: 'px-2.5 py-1 rounded-full font-label-sm text-label-sm uppercase tracking-wider',
    statusBadge: 'px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm border border-outline-variant uppercase tracking-wider',
  },
  compact: {
    row: 'flex items-start gap-4',
    avatar: 'w-16 h-16 rounded-full bg-surface-container-high text-primary flex items-center justify-center text-display-md font-semibold shrink-0 border-2 border-primary/20',
    info: 'flex-1 min-w-0',
    Tag: 'h2',
    title: 'text-display-md font-display-md text-on-surface truncate',
    subtitle: 'text-body-md text-on-surface-variant flex items-center gap-1.5 mt-0.5 flex-wrap',
    badges: 'flex flex-wrap gap-2 mt-2',
    badge: 'px-2.5 py-0.5 rounded-full text-label-sm font-label-sm uppercase tracking-wider',
    statusBadge: 'px-2.5 py-0.5 rounded-full text-label-sm font-label-sm uppercase tracking-wider bg-surface-container-high text-on-surface-variant border border-outline-variant',
  },
}

// Avatar + nome + procedimento/data + badges de urgencia e status. Fica sem os
// botoes de acao ao redor de proposito: pagina completa abre modal local,
// drawer resumido navega pra pagina completa — interacao real demais pra
// forcar num componente so.
export default function PatientIdentitySummary({ patient, initials, urg, variant = 'full' }) {
  const cfg = CONFIG[variant]
  const Tag = cfg.Tag

  return (
    <div className={cfg.row}>
      <div className={cfg.avatar}>{initials}</div>
      <div className={cfg.info}>
        <Tag className={cfg.title}>{patient.name}</Tag>
        <p className={cfg.subtitle}>
          {patient.procedure}
          <span className="text-outline">•</span>
          {patient.surgery_date
            ? format(parseISO(patient.surgery_date), 'dd MMM. yyyy', { locale: ptBR })
            : '—'}
        </p>
        <div className={cfg.badges}>
          <span className={`${cfg.badge} ${urg.cls}`}>{urg.label}</span>
          <span className={cfg.statusBadge}>{STATUS_LABEL[patient.status]}</span>
        </div>
      </div>
    </div>
  )
}
