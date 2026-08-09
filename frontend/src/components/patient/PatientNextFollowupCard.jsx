import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CONFIG = {
  full: {
    wrapper: 'bg-primary text-on-primary rounded-xl ambient-shadow-lvl2 p-6 relative overflow-hidden',
    heading: 'text-label-sm font-label-sm text-primary-fixed-dim uppercase tracking-wider mb-2 flex items-center gap-2',
    icon: '16px',
    date: 'text-display-md font-display-md mb-1',
    dateFormat: "dd MMM. yyyy",
    label: 'text-body-lg text-primary-fixed mb-6',
    counter: 'flex items-center justify-between bg-black/10 rounded-lg p-4',
    circle: 'relative w-16 h-16 flex items-center justify-center',
  },
  compact: {
    wrapper: 'bg-primary text-on-primary rounded-xl p-5 relative overflow-hidden',
    heading: 'text-label-sm font-label-sm text-primary-fixed-dim uppercase tracking-wider mb-1 flex items-center gap-1',
    icon: '14px',
    date: 'text-headline-sm font-headline-sm mb-0.5',
    dateFormat: "dd 'de' MMMM 'de' yyyy",
    label: 'text-body-md text-primary-fixed mb-4',
    counter: 'flex items-center justify-between bg-black/10 rounded-lg px-4 py-3',
    circle: 'relative w-14 h-14 flex items-center justify-center',
  },
}

// Card do proximo contato agendado — drawer resumido (PatientPanel) e pagina
// completa (PatientDetail) mostram o mesmo dado, so em tamanhos diferentes.
export default function PatientNextFollowupCard({ nextFollowup, variant = 'full' }) {
  const cfg = CONFIG[variant]

  return (
    <div className={cfg.wrapper}>
      <div
        className="absolute inset-0 opacity-10"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }}
      />
      <div className="relative z-10">
        <p className={cfg.heading}>
          <span className="material-symbols-outlined" style={{ fontSize: cfg.icon }}>event</span>
          Próximo Contato
        </p>
        <div className={cfg.date}>
          {format(nextFollowup.date, cfg.dateFormat, { locale: ptBR })}
        </div>
        <p className={cfg.label}>{nextFollowup.label}</p>
        <div className={cfg.counter}>
          <div>
            <div className="text-display-md font-display-md">{Math.abs(nextFollowup.daysRemaining)}</div>
            <div className="text-label-sm font-label-sm text-primary-fixed-dim uppercase tracking-wider">
              {nextFollowup.daysRemaining >= 0 ? 'Dias Restantes' : 'Dias em Atraso'}
            </div>
          </div>
          <div className={cfg.circle}>
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                fill="none" stroke="currentColor"
                strokeDasharray="100, 100" strokeWidth="3"
                className="text-white/20"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                fill="none" stroke="currentColor"
                strokeDasharray={`${nextFollowup.countdownProgress}, 100`}
                strokeLinecap="round" strokeWidth="3"
                className="text-white"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-label-sm font-label-sm font-bold">{nextFollowup.countdownProgress}%</span>
          </div>
        </div>
        <p className="text-[11px] text-primary-fixed-dim mt-3">
          Percentual restante até o próximo marco do protocolo.
        </p>
      </div>
    </div>
  )
}
