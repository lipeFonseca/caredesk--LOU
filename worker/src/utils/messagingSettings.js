// Configuracao de mensageria editavel pelo painel (aba Mensageria em
// Configuracoes), guardada em app_settings.
//
// Trade-off assumido: app_settings e texto claro no D1, diferente de um Worker
// Secret. Foi decisao do usuario poder configurar pela interface sem depender de
// `wrangler secret put`. As mitigacoes estao aqui: o token nunca sai em claro
// numa leitura (maskSecret) e nunca entra no payload publico de branding.

export const MESSAGING_SETTING_KEYS = [
  'email_enabled',
  'email_relay_url',
  'email_relay_token',
  'email_from_name',
]

// Chaves que nunca podem voltar em claro numa resposta.
export const SECRET_SETTING_KEYS = ['email_relay_token']

const MASK_PREFIX = '••••••••'

// Mostra so os ultimos 4 caracteres — suficiente pra pessoa reconhecer qual
// token esta gravado, inutil pra quem quiser usa-lo.
export function maskSecret(valor) {
  if (!valor) return ''
  const texto = String(valor)
  return texto.length <= 4 ? MASK_PREFIX : `${MASK_PREFIX}${texto.slice(-4)}`
}

// O formulario recebe o valor mascarado e o devolve intacto quando a pessoa nao
// mexeu no campo. Gravar isso apagaria a credencial real, entao a escrita ignora
// qualquer valor que ainda esteja mascarado.
export function isMaskedValue(valor) {
  return typeof valor === 'string' && valor.startsWith(MASK_PREFIX)
}

export function redactSettings(settingsMap = {}) {
  const copia = { ...settingsMap }
  for (const chave of SECRET_SETTING_KEYS) {
    if (chave in copia) copia[chave] = maskSecret(copia[chave])
  }
  return copia
}

// ── Resolucao da configuracao de envio ────────────────────────
// app_settings tem prioridade sobre a variavel de ambiente: o que a pessoa
// configurou na interface e o que vale. O env fica como fallback pra quem ja
// tinha secret configurado antes desta aba existir.
export async function resolveEmailConfig(env) {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE key IN (${MESSAGING_SETTING_KEYS.map(() => '?').join(', ')})`
  ).bind(...MESSAGING_SETTING_KEYS).all()

  const salvo = Object.fromEntries((results ?? []).map((linha) => [linha.key, linha.value]))

  return {
    // Só desliga com o valor explicito '0'; ausente significa "nunca configurado",
    // e nesse caso quem manda e ter ou nao URL e token.
    enabled: salvo.email_enabled !== '0',
    url: salvo.email_relay_url || env.EMAIL_RELAY_URL || '',
    token: salvo.email_relay_token || env.EMAIL_RELAY_TOKEN || '',
    fromName: salvo.email_from_name || 'CareDesk',
  }
}
