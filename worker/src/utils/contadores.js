// Contadores materializados. Existem por causa do modelo de cobranca do D1:
// o plano free da 5 milhoes de LINHAS LIDAS por dia, e um COUNT(*) sobre a base
// ativa le uma entrada de indice por paciente. Materializado, custa 1 linha.
//
// Coluna derivada tem risco de desincronizar; a rede de seguranca e a
// reconciliacao noturna, igual ao que ja e feito com next_followup_date.

export const CONTADOR_PACIENTES_ATIVOS = 'patients_active'

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

// Paga o COUNT(*) completo uma vez por noite pra corrigir qualquer divergencia
// — o oposto de pagar a cada carregamento do Dashboard.
export async function reconciliarContadores(db) {
  const { total } = await db.prepare(`
    SELECT COUNT(*) AS total FROM patients
    WHERE archived_at IS NULL AND status = 'active'
  `).first()

  await db.prepare(`
    INSERT INTO system_counters (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(CONTADOR_PACIENTES_ATIVOS, total).run()

  return total
}

// Um paciente conta como ativo quando esta em `active` E nao arquivado.
// Centralizado aqui pra que a regra do contador nao divirja da consulta que a
// reconciliacao usa.
export function contaComoAtivo(paciente) {
  return paciente?.status === 'active' && !paciente?.archived_at
}
