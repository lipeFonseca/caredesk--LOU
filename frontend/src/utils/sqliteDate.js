// SQLite grava datetime('now') como 'YYYY-MM-DD HH:MM:SS' em UTC, sem sufixo de
// timezone — `new Date()` interpretaria isso como horario local e jogaria o
// registro 3h pro passado/futuro. Colunas mais antigas (created_at de paciente)
// podem vir em ISO. Normaliza os dois formatos.
export function parseSqliteTimestamp(valor) {
  if (!valor) return null

  const normalizado = valor.includes('T') ? valor : valor.replace(' ', 'T') + 'Z'
  const data = new Date(normalizado)
  return Number.isNaN(data.getTime()) ? null : data
}
