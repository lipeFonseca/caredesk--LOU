// Configuracao do backup diario pro Google Sheets (aba Backup, em
// Configuracoes), guardada em app_settings. Espelha messagingSettings.js —
// mesmo trade-off assumido (texto claro no D1, token nunca sai em claro numa
// leitura), mesma razao (usuario configurar pela interface sem depender de
// `wrangler secret put`).
//
// Credenciais propositalmente independentes das do relay de e-mail: o
// usuario pode (e e recomendado) usar uma conta Google separada pro backup,
// entao nao ha fallback cruzado entre as duas.

export const BACKUP_SETTING_KEYS = [
  'backup_enabled',
  'backup_relay_url',
  'backup_relay_token',
]

// Chave interna do service (marca d'agua do que ja foi exportado de
// followup_logs) — nunca exposta na tela, nunca editavel via PATCH.
export const BACKUP_FOLLOWUP_SYNC_KEY = 'backup_followup_logs_synced_until'

// Chaves que nunca podem voltar em claro numa resposta.
export const SECRET_SETTING_KEYS = ['backup_relay_token']

const MASK_PREFIX = '••••••••'

export function maskSecret(valor) {
  if (!valor) return ''
  const texto = String(valor)
  return texto.length <= 4 ? MASK_PREFIX : `${MASK_PREFIX}${texto.slice(-4)}`
}

export function isMaskedValue(valor) {
  return typeof valor === 'string' && valor.startsWith(MASK_PREFIX)
}

export function redactBackupSettings(settingsMap = {}, { isAdmin = false } = {}) {
  const copia = { ...settingsMap }

  if (!isAdmin) {
    for (const chave of BACKUP_SETTING_KEYS) delete copia[chave]
    return copia
  }

  for (const chave of SECRET_SETTING_KEYS) {
    if (chave in copia) copia[chave] = maskSecret(copia[chave])
  }
  return copia
}

// ── Resolucao da configuracao de backup ───────────────────────
export async function resolveBackupConfig(env) {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE key IN (${BACKUP_SETTING_KEYS.map(() => '?').join(', ')})`
  ).bind(...BACKUP_SETTING_KEYS).all()

  const salvo = Object.fromEntries((results ?? []).map((linha) => [linha.key, linha.value]))

  return {
    // So desliga com '0' explicito; ausente significa "nunca configurado".
    enabled: salvo.backup_enabled === '1',
    url: salvo.backup_relay_url || '',
    token: salvo.backup_relay_token || '',
  }
}
