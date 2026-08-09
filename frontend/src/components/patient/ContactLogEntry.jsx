import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CONTACT_TYPE_CONFIG, OUTCOME_CONFIG } from '@/utils/contactDisplay'

const SIZE = {
  full:    { dot: 'w-5 h-5 -left-[35px] sm:-left-[43px]', card: 'p-4', icon: '10px' },
  compact: { dot: 'w-4 h-4 -left-[29px]',                  card: 'p-3', icon: '8px' },
}

// Usado no drawer resumido (PatientPanel) e na pagina completa (PatientDetail) —
// os dois listavam o historico de contato com o mesmo dado, cada um com sua
// propria copia da marcacao. O drawer tinha ficado pra tras: nao mostrava nem
// o aviso de agente removido da equipe nem a data do proximo contato marcado.
export default function ContactLogEntry({ log, variant = 'full' }) {
  const tc = CONTACT_TYPE_CONFIG[log.contact_type] ?? CONTACT_TYPE_CONFIG.call
  const oc = OUTCOME_CONFIG[log.outcome] ?? OUTCOME_CONFIG.no_answer
  const size = SIZE[variant]

  return (
    <div className="relative">
      <div className={`absolute ${size.dot} rounded-full bg-secondary text-on-secondary flex items-center justify-center border-4 border-white shadow-sm`}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: size.icon, fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 20" }}
        >check</span>
      </div>
      <div className={`bg-surface border border-outline-variant rounded-lg ${size.card} hover:shadow-[0_4px_6px_rgba(0,0,0,0.08)] transition-shadow`}>
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
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
          {/* Autoria preservada: agente excluido continua creditado pelo nome
              gravado no contato. So e "Sistema Automatico" quando de fato nao
              houve pessoa — antes, agente removido caia nesse rotulo e o
              registro clinico mentia sobre quem ligou. */}
          <span className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
              {log.agent_name ? 'person' : 'smart_toy'}
            </span>
            {log.agent_name ?? 'Sistema Automatico'}
            {log.agent_removed ? (
              <span className="text-outline" title="Este agente não faz mais parte da equipe">
                (fora da equipe)
              </span>
            ) : null}
          </span>
        </div>
        {log.next_followup_date && (
          <p className="text-label-sm font-label-sm text-primary mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>event</span>
            Próximo: {format(parseISO(log.next_followup_date), 'dd/MM/yyyy')}
          </p>
        )}
      </div>
    </div>
  )
}
