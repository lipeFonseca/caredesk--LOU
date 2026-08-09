import { format, parseISO } from 'date-fns'
import { formatProtocolDayShort } from '@/utils/protocols'

const STATUS_CLS = {
  completed: 'bg-secondary/10 border-secondary/30 text-secondary',
  overdue:   'bg-error-container/20 border-error/30 text-error',
  due:       'bg-[#fff8e1] border-[#ffecb3] text-[#f57f17]',
  next:      'bg-primary text-on-primary border-primary',
}
const STATUS_ICON = {
  completed: 'check_circle',
  overdue:   'warning',
  due:       'event_available',
  next:      'notifications_active',
}
const CONNECTOR_CLS = {
  completed: 'bg-secondary',
  overdue:   'bg-error/40',
}

const LEGEND = [
  { cls: 'bg-secondary/10 border-secondary/30 text-secondary', label: 'Concluído' },
  { cls: 'bg-error-container/20 border-error/30 text-error',   label: 'Atrasado' },
  { cls: 'bg-primary text-on-primary border-primary',          label: 'Próximo' },
  { cls: 'bg-surface-container-low border-outline-variant text-on-surface-variant', label: 'Pendente' },
]

const CONFIG = {
  // Pagina completa: chip maior, mostra a data embaixo e a legenda no rodape.
  full: {
    wrapper: 'bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6',
    heading: 'text-headline-sm font-headline-sm text-on-surface mb-4 pb-4 border-b border-outline-variant flex items-center gap-2',
    headingIcon: undefined,
    count: 'ml-1 bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm px-2 py-0.5 rounded-full border border-outline-variant',
    connector: 'w-6 h-0.5',
    chip: 'flex flex-col items-center px-2 py-1.5 rounded-lg border text-center min-w-[64px] relative',
    chipIcon: '14px',
    chipLabel: 'text-label-sm font-label-sm font-semibold whitespace-nowrap mt-0.5',
    showDate: true,
    showLegend: true,
  },
  // Drawer resumido: tudo compacto, sem data e sem legenda (espaco curto).
  compact: {
    wrapper: 'bg-surface rounded-xl border border-outline-variant p-5',
    heading: 'text-label-md font-label-md text-on-surface font-semibold mb-3 pb-3 border-b border-outline-variant flex items-center gap-2',
    headingIcon: '18px',
    count: 'ml-auto text-label-sm text-on-surface-variant',
    connector: 'w-4 h-px',
    chip: 'flex flex-col items-center px-1.5 py-1 rounded-lg border text-center min-w-[52px]',
    chipIcon: '11px',
    chipLabel: 'text-[9px] font-bold whitespace-nowrap mt-0.5',
    showDate: false,
    showLegend: false,
  },
}

export default function PatientProtocolTimeline({ timeline, variant = 'full' }) {
  if (!timeline.length) return null
  const cfg = CONFIG[variant]
  const completedCount = timeline.filter((t) => t.status === 'completed').length

  return (
    <div className={cfg.wrapper}>
      <h2 className={cfg.heading}>
        <span className="material-symbols-outlined text-outline" style={cfg.headingIcon ? { fontSize: cfg.headingIcon } : undefined}>timeline</span>
        Linha do Tempo
        <span className={cfg.count}>{completedCount}/{timeline.length}</span>
      </h2>
      <div className={variant === 'full' ? 'overflow-x-auto pb-2' : 'overflow-x-auto pb-1'}>
        <div className="flex items-center gap-0" style={{ minWidth: 'max-content' }}>
          {timeline.map((item, i) => (
            <div key={item.day} className="flex items-center">
              {i > 0 && (
                <div className={`${cfg.connector} ${CONNECTOR_CLS[item.status] ?? 'bg-outline-variant'}`} />
              )}
              <div className={`${cfg.chip} ${STATUS_CLS[item.status] ?? 'bg-surface-container-low border-outline-variant text-on-surface-variant'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: cfg.chipIcon }}>
                  {STATUS_ICON[item.status] ?? 'radio_button_unchecked'}
                </span>
                <span className={cfg.chipLabel}>{formatProtocolDayShort(item.day)}</span>
                {cfg.showDate && (
                  <span className="text-[10px] text-inherit opacity-70 whitespace-nowrap">
                    {format(parseISO(item.dateStr), 'dd/MM')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {cfg.showLegend && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-outline-variant">
          {LEGEND.map(({ cls, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
              <span className={`w-3 h-3 rounded-sm border inline-block ${cls}`} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
