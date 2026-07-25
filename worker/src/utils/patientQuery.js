// Montagem das consultas da lista de pacientes: busca e paginacao por cursor.
// Fica fora da rota pra ser testavel sem D1.

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// Espelha o CHECK de `patients.status` no schema. Vive aqui porque a rota PATCH
// validava contra ['active','inactive','done'] — valores que o banco nem aceita
// —, entao Pausado e Alta respondiam 400 e nao havia como mudar o status de um
// paciente. Duas listas separadas foi o que permitiu a divergencia passar.
export const PATIENT_STATUSES = Object.freeze(['active', 'paused', 'discharged'])

export function isValidPatientStatus(valor) {
  return PATIENT_STATUSES.includes(valor)
}

// ── Busca ────────────────────────────────────────────────────
// Dois caminhos, escolhidos pelo formato do que foi digitado:
//
// - so digitos  -> telefone, casado por trecho em `phone_digits`.
// - resto       -> nome/procedimento/e-mail via FTS5. `LIKE '%x%'` faria SCAN.
//
// LIMITACAO aceita no telefone: quem procura digita o miolo do numero
// ("98877"), nao o DDD, entao prefixo nao serve e o casamento e por trecho.
// Isso varre o INDICE de phone_digits em vez da tabela — indice estreito, so
// digitos, so linhas ativas. Custo aceitavel na janela de ~54k pacientes; se um
// dia doer, o caminho e indexar tambem o numero sem DDD.
export function classifySearchTerm(termo) {
  const limpo = String(termo ?? '').trim()
  if (!limpo) return { kind: 'none' }

  const digitos = limpo.replace(/\D/g, '')

  // Um termo com digitos suficientes e sem letras e telefone, mesmo pontuado.
  if (digitos.length >= 4 && !/[a-zA-ZÀ-ÿ]/.test(limpo)) {
    return { kind: 'phone', digits: digitos }
  }

  return { kind: 'text', query: buildFtsQuery(limpo) }
}

// Cada palavra vira prefixo (`mari*` acha "Mariana") e todas precisam casar.
// As aspas evitam que o texto do usuario seja lido como sintaxe do FTS5 — sem
// isso um `-` ou `*` digitado por acidente vira operador e a consulta estoura.
export function buildFtsQuery(termo) {
  const palavras = String(termo)
    .split(/\s+/)
    .map((palavra) => palavra.replace(/["*]/g, '').trim())
    .filter(Boolean)

  if (!palavras.length) return ''
  return palavras.map((palavra) => `"${palavra}"*`).join(' AND ')
}

// ── Cursor ───────────────────────────────────────────────────
// Ordenacao e (surgery_date DESC, id DESC). `surgery_date` sozinho nao e unico:
// sem o desempate por id, duas paginas podem repetir ou pular registro quando
// varios pacientes operam no mesmo dia.
export function encodeCursor({ surgery_date, id }) {
  return btoa(`${surgery_date}|${id}`)
}

export function decodeCursor(cursor) {
  if (!cursor) return null
  try {
    const [surgery_date, id] = atob(cursor).split('|')
    if (!surgery_date || !id) return null
    return { surgery_date, id }
  } catch {
    // Cursor corrompido/forjado cai na primeira pagina em vez de derrubar a
    // listagem — nao ha nada de sensivel nele, e o pior caso e recomecar.
    return null
  }
}

export function normalizePageSize(limit) {
  const numero = parseInt(limit, 10)
  if (!Number.isInteger(numero)) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.max(1, numero))
}

// ── WHERE compartilhado ──────────────────────────────────────
// Devolve fragmento + binds na mesma ordem, pra rota so concatenar.
// Janela de acompanhamento e quanto antes o paciente entra em "encerrando".
// Precisam bater com JANELA_DE_ACOMPANHAMENTO_MESES de services/arquivamento.js.
export const JANELA_MESES = 6
export const AVISO_ENCERRAMENTO_DIAS = 30

// Dias que faltam pro arquivamento automatico. Negativo = ja passou da janela e
// so nao foi arquivado porque o cron ainda nao rodou.
export const SQL_DIAS_ATE_ARQUIVAR = `
  CAST(julianday(date(p.surgery_date, '+${JANELA_MESES} months')) - julianday(date('now')) AS INTEGER)
`

// `archived`: 'none' (padrao) | 'only' | 'all'
// `endingSoon`: só os que arquivam dentro da janela de aviso
export function buildPatientFilters({ status, agent_id, from, to, archived, endingSoon }) {
  const clausulas = []
  const binds = []

  // O predicado de arquivamento nao muda so o resultado, muda o PLANO: e ele
  // que torna os indices parciais elegiveis. Por isso 'all' (que o remove) deve
  // ser usado so onde realmente se precisa da base inteira.
  if (archived === 'only')      clausulas.push('p.archived_at IS NOT NULL')
  else if (archived !== 'all')  clausulas.push('p.archived_at IS NULL')

  if (endingSoon) {
    clausulas.push(`date(p.surgery_date, '+${JANELA_MESES} months') <= date('now', '+${AVISO_ENCERRAMENTO_DIAS} days')`)
  }

  if (status)   { clausulas.push('p.status = ?');            binds.push(status) }
  if (agent_id) { clausulas.push('p.assigned_agent_id = ?'); binds.push(agent_id) }
  if (from)     { clausulas.push('p.surgery_date >= ?');     binds.push(from) }
  if (to)       { clausulas.push('p.surgery_date <= ?');     binds.push(to) }

  return { sql: clausulas.length ? ` WHERE ${clausulas.join(' AND ')}` : '', binds }
}

// Aceita só os valores conhecidos; qualquer outra coisa cai no padrão seguro.
export function normalizeArchivedFilter(valor) {
  return ['only', 'all'].includes(valor) ? valor : 'none'
}
