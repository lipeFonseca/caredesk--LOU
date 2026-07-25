// Regras puras do fluxo de reset de senha por codigo.
// Ficam fora das rotas pra serem testaveis sem D1.

export const CODE_LENGTH        = 6
export const CODE_TTL_MINUTES   = 15
export const MAX_CODE_ATTEMPTS  = 5

// ── Gera o codigo numerico enviado por e-mail ─────────────────
// Rejection sampling em vez de `% 1000000`: o modulo direto sobre 2^32 favorece
// levemente os primeiros codigos do intervalo. O viés seria pequeno, mas aqui a
// entropia ja e curta (10^6) e nao ha motivo pra abrir mao dela.
export function generateResetCode() {
  const espaco = 10 ** CODE_LENGTH
  const maiorMultiplo = Math.floor(0x100000000 / espaco) * espaco

  let valor
  do {
    valor = crypto.getRandomValues(new Uint32Array(1))[0]
  } while (valor >= maiorMultiplo)

  return String(valor % espaco).padStart(CODE_LENGTH, '0')
}

// ── Hash do codigo pro banco ──────────────────────────────────
// SHA-256 puro (sem PBKDF2, ao contrario da senha): o codigo e aleatorio, tem
// vida de 15 minutos e limite de tentativas, entao nao ha o que proteger contra
// ataque de dicionario offline.
export async function hashResetCode(code) {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function resetCodeExpiryIso(agora = new Date()) {
  return new Date(agora.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString()
}

// ── Diz se um registro de codigo ainda pode ser usado ─────────
export function isResetCodeUsable(registro, agora = new Date()) {
  if (!registro) return false
  if (registro.used_at) return false
  if (registro.attempts >= MAX_CODE_ATTEMPTS) return false
  return new Date(registro.expires_at) > agora
}

// Comparacao em tempo constante entre dois hashes hex de mesmo tamanho.
export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false

  const tamanho = Math.max(a.length, b.length)
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < tamanho; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function isStrongEnoughPassword(senha) {
  return typeof senha === 'string' && senha.length >= 8
}

// ── Faxina noturna ────────────────────────────────────────────
// Roda no cron da meia-noite. O fluxo normal ja apaga o codigo ao usar e ao
// pedir um novo, entao aqui sobra so o caso de quem pediu codigo e nunca voltou.
// Codigo vive 15 minutos: na meia-noite, qualquer coisa ainda na tabela ja e
// lixo — o filtro por expiracao existe pra nunca derrubar um pedido em curso.
export async function purgeExpiredResetCodes(env) {
  // `datetime(expires_at)` e obrigatorio, nao enfeite: a coluna e gravada pelo
  // JS em ISO ("2026-07-25T06:50:31.514Z") e datetime('now') devolve o formato
  // do SQLite ("2026-07-25 18:03:49"). Comparadas como texto, 'T' (0x54) fica
  // DEPOIS do espaco (0x20), entao um codigo vencido era lido como futuro e a
  // limpeza nunca apagava nada. datetime() normaliza os dois lados.
  const { meta } = await env.DB.prepare(
    "DELETE FROM password_reset_codes WHERE datetime(expires_at) < datetime('now')"
  ).run()

  return meta?.changes ?? 0
}
