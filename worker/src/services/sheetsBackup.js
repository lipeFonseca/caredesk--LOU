// Backup diario do CareDesk pra Google Planilhas, com restore de verdade em
// mente (nao so uma copia de leitura) — ver docs/GOOGLE-SHEETS-BACKUP.md e a
// secao "Backup e restore" do README pro desenho completo.
//
// Transporte: mesma ponte via Apps Script do e-mail (worker/src/services/email.js),
// publicacao propria — token e planilha independentes do relay de e-mail.
//
// agents/contact_protocols/patients sao reescritos por inteiro toda noite
// (foto do estado atual). followup_logs e incremental — cresce pra sempre,
// entao so manda o que e novo desde o ultimo backup confirmado.

import { resolveBackupConfig, BACKUP_FOLLOWUP_SYNC_KEY } from '../utils/backupSettings.js'

const TAMANHO_LOTE = 500

const TABELA_AGENTS = {
  table: 'agents',
  sheet: 'Agentes',
  action: 'backup_agents',
  colunas: ['id', 'name', 'email', 'phone', 'role', 'is_active', 'avatar_url', 'created_at'],
}

const TABELA_PROTOCOLS = {
  table: 'contact_protocols',
  sheet: 'Protocolos',
  action: 'backup_protocols',
  colunas: ['id', 'name', 'description', 'days', 'color', 'is_default', 'is_custom', 'created_at', 'updated_at'],
}

const TABELA_PATIENTS = {
  table: 'patients',
  sheet: 'Pacientes',
  action: 'backup_patients',
  // cpf fica de fora de proposito — decisao do usuario, ver README.
  colunas: [
    'id', 'name', 'phone', 'phone_digits', 'email', 'responsavel', 'data_nascimento',
    'procedure', 'surgery_date', 'assigned_agent_id', 'protocol_id', 'status', 'notes',
    'created_by', 'created_by_name', 'archived_at', 'next_followup_date', 'created_at', 'updated_at',
  ],
}

const TABELA_FOLLOWUPS = {
  table: 'followup_logs',
  sheet: 'Contatos',
  action: 'backup_followups',
  colunas: [
    'id', 'patient_id', 'agent_id', 'agent_name_snapshot', 'contact_date', 'contact_type',
    'outcome', 'notes', 'next_followup_date', 'is_extra_contact', 'is_backfilled', 'created_at',
  ],
}

// Exportado pro script de restore (worker/scripts/restore-from-backup.js)
// reusar exatamente a mesma lista de tabelas/colunas/ordem de dependencia —
// sem isso, backup e restore podiam divergir silenciosamente com o tempo.
export const TABELAS_BACKUP = [TABELA_AGENTS, TABELA_PROTOCOLS, TABELA_PATIENTS, TABELA_FOLLOWUPS]

// ── Ponto de entrada, chamado pela faxina noturna ──────────────
// `apenasAgents` existe pro botao "Testar conexao" da aba Backup: confirma
// URL/token/planilha com um lote pequeno e rapido, sem rodar o backup
// completo (nem mexer na marca d'agua de followups) so pra validar config.
export async function runDailyBackup(env, { apenasAgents = false } = {}) {
  const config = await resolveBackupConfig(env)

  if (!config.enabled || !config.url || !config.token) {
    return { skipped: true }
  }

  const agents = await exportarTabelaCompleta(env.DB, config, TABELA_AGENTS)
  if (apenasAgents) {
    return { skipped: false, agents }
  }

  const protocols = await exportarTabelaCompleta(env.DB, config, TABELA_PROTOCOLS)
  const patients = await exportarTabelaCompleta(env.DB, config, TABELA_PATIENTS)
  const followups = await exportarFollowupsIncremental(env, config)

  return { skipped: false, agents, protocols, patients, followups }
}

// ── Tabelas reescritas por inteiro (foto do estado atual) ──────
// Paginacao por chave (id > ultimoId), nao OFFSET — proporcional ao tamanho
// da tabela, sem custo crescente conforme pagina avanca (mesma preocupacao
// de rows_read documentada no README).
async function exportarTabelaCompleta(db, config, tabela) {
  const listaColunas = tabela.colunas.join(', ')
  let ultimoId = ''
  let totalEnviado = 0
  let chunkIndex = 0
  let paginaAtual

  do {
    const { results } = await db.prepare(`
      SELECT ${listaColunas} FROM ${tabela.table}
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ?
    `).bind(ultimoId, TAMANHO_LOTE).all()

    paginaAtual = results ?? []
    // Tabela vazia manda mesmo assim um lote vazio no chunk 0, so pra
    // limpar/criar a aba com o cabecalho certo; a partir do chunk 1, pagina
    // vazia so significa "acabou" (nao ha nada novo pra mandar).
    if (paginaAtual.length === 0 && chunkIndex > 0) break

    const linhas = montarLinhas(tabela.colunas, paginaAtual)
    ultimoId = paginaAtual.length > 0 ? paginaAtual[paginaAtual.length - 1].id : ultimoId

    await postParaAppsScript(config, {
      action: tabela.action,
      sheet: tabela.sheet,
      mode: 'overwrite',
      headers: tabela.colunas,
      rows: linhas,
      chunk_index: chunkIndex,
    })

    totalEnviado += linhas.length
    chunkIndex += 1
  } while (paginaAtual.length === TAMANHO_LOTE)

  return { rows: totalEnviado }
}

// ── followup_logs: incremental, so o que e novo desde o ultimo backup ──
// Janela fixada no INICIO da rodada (nao no maior created_at devolvido) —
// evita perder linha criada no meio da exportacao, e evita a marca d'agua
// avancar em cima de timestamp que colide com outra linha ainda nao enviada.
async function exportarFollowupsIncremental(env, config) {
  const desde = await lerMarcaDagua(env.DB)
  const inicioDaRodada = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const listaColunas = TABELA_FOLLOWUPS.colunas.join(', ')
  let offset = 0
  let totalEnviado = 0
  let chunkIndex = 0
  let paginaAtual

  do {
    const { results } = await env.DB.prepare(`
      SELECT ${listaColunas} FROM followup_logs
      WHERE datetime(created_at) > datetime(?) AND datetime(created_at) <= datetime(?)
      ORDER BY created_at ASC, id ASC
      LIMIT ? OFFSET ?
    `).bind(desde, inicioDaRodada, TAMANHO_LOTE, offset).all()

    paginaAtual = results ?? []
    if (paginaAtual.length === 0) break

    const linhas = montarLinhas(TABELA_FOLLOWUPS.colunas, paginaAtual)

    await postParaAppsScript(config, {
      action: TABELA_FOLLOWUPS.action,
      sheet: TABELA_FOLLOWUPS.sheet,
      mode: 'append',
      headers: TABELA_FOLLOWUPS.colunas,
      rows: linhas,
      chunk_index: chunkIndex,
    })

    totalEnviado += linhas.length
    offset += TAMANHO_LOTE
    chunkIndex += 1
  } while (paginaAtual.length === TAMANHO_LOTE)

  // So avanca a marca d'agua depois que todo lote da rodada foi confirmado —
  // se cair no meio, a proxima rodada reenvia a partir da marca antiga (no
  // pior caso duplica linha na planilha, nunca pula).
  await gravarMarcaDagua(env.DB, inicioDaRodada)

  return { rows: totalEnviado }
}

async function lerMarcaDagua(db) {
  const linha = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(BACKUP_FOLLOWUP_SYNC_KEY).first()
  return linha?.value || '1970-01-01 00:00:00'
}

async function gravarMarcaDagua(db, valor) {
  await db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(BACKUP_FOLLOWUP_SYNC_KEY, valor).run()
}

// ── Helpers puros, testaveis sem D1 nem fetch ──────────────────
export function montarLinhas(colunas, registros) {
  return registros.map((registro) => colunas.map((coluna) => registro[coluna] ?? ''))
}

// ── Chamada de rede, mesmo formato de sendEmail() em email.js ──
async function postParaAppsScript(config, payload) {
  const resposta = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Token no corpo, nao em header — o Apps Script perde header customizado
    // no redirect interno (mesmo motivo documentado em email.js).
    body: JSON.stringify({ token: config.token, ...payload }),
  })

  const corpo = await resposta.text()
  let resultado
  try {
    resultado = JSON.parse(corpo)
  } catch {
    throw new Error(`Resposta inesperada do relay de backup: ${corpo.slice(0, 200)}`)
  }

  // Apps Script responde 200 com erro no corpo em varias falhas — status
  // sozinho nao confirma sucesso (mesmo cuidado de email.js).
  if (!resposta.ok || !resultado.ok) {
    throw new Error(`Falha no backup (${payload.action}, lote ${payload.chunk_index}): ${resultado.error ?? resposta.status}`)
  }

  return resultado
}
