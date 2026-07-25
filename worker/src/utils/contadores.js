// Contadores materializados. Existem por causa do modelo de cobranca do D1:
// o plano free da 5 milhoes de LINHAS LIDAS por dia, e um COUNT(*) sobre a base
// ativa le uma entrada de indice por paciente. Materializado, custa 1 linha.
//
// Coluna derivada tem risco de desincronizar; a rede de seguranca e a
// reconciliacao noturna, igual ao que ja e feito com next_followup_date.

export const CONTADOR_PACIENTES_ATIVOS = 'patients_active'
export const CONTADOR_PACIENTES_TOTAL  = 'patients_total'
export const CONTADOR_CONTATOS         = 'followups_total'
export const CONTADOR_LOGS             = 'error_logs_total'

// ── Estimativa de ocupacao do banco ──────────────────────────
// O D1 nao expoe o tamanho: `PRAGMA page_count` e a tabela `dbstat` estao
// bloqueados, e o numero oficial so existe na API da Cloudflare — que exigiria
// guardar um token de conta dentro do Worker so pra alimentar uma tela.
//
// Entao estimamos. Os fatores abaixo incluem o registro, os indices em que a
// linha entra e o overhead de pagina; foram calibrados contra o tamanho real
// reportado por `wrangler d1 info`. LIMITACAO: e aproximacao, nao medicao — erra
// mais quanto menor a base, porque o overhead fixo domina. Serve pra responder
// "estou perto do teto?", nao pra auditoria de bytes.
export const BYTES_POR_LINHA = Object.freeze({
  [CONTADOR_PACIENTES_TOTAL]: 800,  // linha + 7 indices + entrada no FTS
  [CONTADOR_CONTATOS]:        300,
  [CONTADOR_LOGS]:            900,  // stack de erro e o campo mais pesado do banco
})

// Estruturas vazias (tabelas, indices, FTS) medidas com a base praticamente
// zerada: 262 kB com 7 pacientes.
export const OVERHEAD_BASE_BYTES = 260_000

// Limite do plano free por BANCO. A conta inteira tem 5 GB, mas distribuidos em
// ate 10 bancos — como o CareDesk usa um so, o teto que vale e este.
export const LIMITE_BANCO_BYTES = 500 * 1024 * 1024

export async function lerContador(db, chave) {
  const linha = await db.prepare('SELECT value FROM system_counters WHERE key = ?').bind(chave).first()
  return linha?.value ?? 0
}

// `delta` pode ser negativo. O INSERT cobre o caso de a chave ainda nao existir
// (banco novo antes da reconciliacao).
export async function ajustarContador(db, chave, delta) {
  if (!delta) return
  await db.prepare(`
    INSERT INTO system_counters (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = MAX(0, value + ?),
      updated_at = datetime('now')
  `).bind(chave, Math.max(0, delta), delta).run()
}

// ── Leitura para a tela de ocupacao ──────────────────────────
// Uma consulta, poucas linhas: os valores ja estao materializados.
export async function lerOcupacao(db) {
  const { results } = await db.prepare(
    'SELECT key, value FROM system_counters'
  ).all()

  const contadores = Object.fromEntries((results ?? []).map((l) => [l.key, l.value]))

  const porTabela = Object.entries(BYTES_POR_LINHA).map(([chave, bytesPorLinha]) => ({
    key: chave,
    rows: contadores[chave] ?? 0,
    bytes: (contadores[chave] ?? 0) * bytesPorLinha,
  }))

  const bytesDados = porTabela.reduce((soma, t) => soma + t.bytes, 0)

  return {
    tables: porTabela,
    overhead_bytes: OVERHEAD_BASE_BYTES,
    used_bytes: bytesDados + OVERHEAD_BASE_BYTES,
    limit_bytes: LIMITE_BANCO_BYTES,
    patients_active: contadores[CONTADOR_PACIENTES_ATIVOS] ?? 0,
  }
}

// Paga o COUNT(*) completo uma vez por noite pra corrigir qualquer divergencia
// — o oposto de pagar a cada carregamento de tela.
export async function reconciliarContadores(db) {
  const totais = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM patients WHERE archived_at IS NULL AND status = 'active') AS ativos,
      (SELECT COUNT(*) FROM patients)      AS pacientes,
      (SELECT COUNT(*) FROM followup_logs) AS contatos,
      (SELECT COUNT(*) FROM error_logs)    AS logs
  `).first()

  const paraGravar = [
    [CONTADOR_PACIENTES_ATIVOS, totais?.ativos ?? 0],
    [CONTADOR_PACIENTES_TOTAL,  totais?.pacientes ?? 0],
    [CONTADOR_CONTATOS,         totais?.contatos ?? 0],
    [CONTADOR_LOGS,             totais?.logs ?? 0],
  ]

  await db.batch(paraGravar.map(([chave, valor]) => db.prepare(`
    INSERT INTO system_counters (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(chave, valor)))

  return totais?.ativos ?? 0
}

// Um paciente conta como ativo quando esta em `active` E nao arquivado.
// Centralizado aqui pra que a regra do contador nao divirja da consulta que a
// reconciliacao usa.
export function contaComoAtivo(paciente) {
  return paciente?.status === 'active' && !paciente?.archived_at
}
