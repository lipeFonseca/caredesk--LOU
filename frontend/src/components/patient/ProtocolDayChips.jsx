import { formatProtocolDay } from '@/utils/protocols'

const SIZE = {
  full:    'px-2 py-0.5 rounded text-label-sm font-label-sm border',
  compact: 'px-1.5 py-0.5 rounded text-[10px] font-semibold border',
}

// Antes do dia da cirurgia, dia da cirurgia (0) e depois usam cores diferentes
// de proposito — e a mesma leitura visual que a linha do tempo do protocolo.
export default function ProtocolDayChips({ days, variant = 'full' }) {
  return (
    <div className={variant === 'compact' ? 'flex flex-wrap gap-1' : 'flex flex-wrap gap-1.5'}>
      {days.map((d) => (
        <span
          key={d}
          className={`${SIZE[variant]} ${
            d < 0
              ? 'bg-[#fff3e0] border-[#ffe0b2] text-[#ef6c00]'
              : d === 0
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-secondary/10 border-secondary/30 text-secondary'
          }`}
        >
          {formatProtocolDay(d)}
        </span>
      ))}
    </div>
  )
}
