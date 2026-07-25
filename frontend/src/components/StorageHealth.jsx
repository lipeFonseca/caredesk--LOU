import { useState, useEffect } from 'react'
import { api } from '@/services/api'

// Ocupação do banco na aba de Logs.
//
// FORMA: razão contra um limite pede medidor, não pizza de duas fatias — com o
// banco em 0,05% do teto, uma fatia seria invisível. A composição usa barra
// empilhada, que compara partes sem depender de julgar ângulo.
//
// Cores: paleta categórica validada para daltonismo, nos quatro primeiros slots
// na ordem. Cada série é rotulada na legenda com o valor, então identidade nunca
// depende só da cor.
const SERIES = [
  { key: 'patients_total',   label: 'Pacientes',      light: '#2a78d6', dark: '#3987e5' },
  { key: 'followups_total',  label: 'Contatos',       light: '#eb6834', dark: '#d95926' },
  { key: 'error_logs_total', label: 'Logs de erro',   light: '#1baf7a', dark: '#199e70' },
  { key: '__overhead',       label: 'Estrutura',      light: '#eda100', dark: '#c98500' },
]

function formatarBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function StorageHealth() {
  const [dados, setDados] = useState(null)
  const [erro, setErro]   = useState(false)

  useEffect(() => {
    api.logs.storage().then(setDados).catch(() => setErro(true))
  }, [])

  if (erro) return null
  if (!dados) return <div className="h-40 bg-surface-container-low animate-pulse rounded-xl" />

  const usado = dados.used_bytes ?? 0
  const limite = dados.limit_bytes ?? 1
  const percentual = (usado / limite) * 100

  const fatias = SERIES.map((serie) => {
    const tabela = serie.key === '__overhead'
      ? { rows: null, bytes: dados.overhead_bytes ?? 0 }
      : (dados.tables ?? []).find((t) => t.key === serie.key) ?? { rows: 0, bytes: 0 }

    return { ...serie, ...tabela, share: usado ? (tabela.bytes / usado) * 100 : 0 }
  }).filter((fatia) => fatia.bytes > 0)

  // Faixas de atenção: o medidor muda de cor conforme aproxima do teto, mas o
  // percentual sempre aparece escrito ao lado — cor não carrega o aviso sozinha.
  const statusDoUso =
    percentual >= 90 ? { cor: '#d03b3b', rotulo: 'crítico' } :
    percentual >= 70 ? { cor: '#fab219', rotulo: 'atenção' } :
                       { cor: '#0ca30c', rotulo: 'saudável' }

  return (
    <div className="viz-armazenamento bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
      <style>{`
        .viz-armazenamento { --serie-1:#2a78d6; --serie-2:#eb6834; --serie-3:#1baf7a; --serie-4:#eda100; --trilho:#e1e0d9; }
        html.dark .viz-armazenamento { --serie-1:#3987e5; --serie-2:#d95926; --serie-3:#199e70; --serie-4:#c98500; --trilho:#2c2c2a; }
      `}</style>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h3 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-outline">database</span>
            Ocupação do banco
          </h3>
          <p className="text-label-sm text-outline mt-1">
            Estimativa a partir do volume de registros — o D1 não expõe o tamanho real ao aplicativo.
          </p>
        </div>
        <div className="text-right">
          {/* Figura de destaque: o número que a tela existe para comunicar. */}
          <p className="text-display-md text-on-surface leading-none">{formatarBytes(usado)}</p>
          <p className="text-label-sm text-on-surface-variant mt-1">
            de {formatarBytes(limite)} · {percentual < 0.1 ? '<0,1' : percentual.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Medidor: razão contra o limite */}
      <div className="mb-2">
        <div className="h-3 w-full rounded-full overflow-hidden" style={{ background: 'var(--trilho)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.max(percentual, 0.6)}%`, background: statusDoUso.cor }}
          />
        </div>
        <p className="text-label-sm text-on-surface-variant mt-2 flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: statusDoUso.cor }} />
          Uso {statusDoUso.rotulo} — plano gratuito permite {formatarBytes(limite)} por banco
        </p>
      </div>

      {/* Composição: barra empilhada com 2px de respiro entre segmentos */}
      <div className="mt-6">
        <p className="text-label-sm font-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">
          O que ocupa o espaço
        </p>
        <div className="flex h-6 w-full rounded overflow-hidden gap-[2px]">
          {fatias.map((fatia, indice) => (
            <div
              key={fatia.key}
              title={`${fatia.label}: ${formatarBytes(fatia.bytes)}`}
              style={{
                width: `${Math.max(fatia.share, 1)}%`,
                background: `var(--serie-${indice + 1})`,
              }}
              className="first:rounded-l last:rounded-r"
            />
          ))}
        </div>

        {/* Legenda com valor — identidade nunca depende só da cor */}
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {fatias.map((fatia, indice) => (
            <li key={fatia.key} className="flex items-center justify-between gap-3 text-body-md">
              <span className="flex items-center gap-2 text-on-surface-variant">
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{ background: `var(--serie-${indice + 1})` }}
                />
                {fatia.label}
                {fatia.rows !== null && (
                  <span className="text-outline">
                    ({fatia.rows.toLocaleString('pt-BR')} {fatia.rows === 1 ? 'registro' : 'registros'})
                  </span>
                )}
              </span>
              <span className="text-on-surface tabular-nums shrink-0">{formatarBytes(fatia.bytes)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
