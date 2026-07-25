import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import {
  authMiddleware,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  readCookie,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../middleware/auth.js'
import {
  generateResetCode,
  hashResetCode,
  resetCodeExpiryIso,
  isResetCodeUsable,
  timingSafeEqualHex,
  isStrongEnoughPassword,
  CODE_TTL_MINUTES,
} from '../utils/passwordReset.js'
import { sendEmail, buildResetCodeEmail } from '../services/email.js'

const auth = new Hono()

// path '/api/auth/refresh' porque o app monta estas rotas em /api/auth
const REFRESH_COOKIE_PATH = '/api/auth/refresh'

function setSessionCookies(c, access, refresh) {
  setCookie(c, 'access_token', access, {
    httpOnly: true, secure: true, sameSite: 'None',
    path: '/', maxAge: ACCESS_TOKEN_TTL_SECONDS,
  })
  setCookie(c, 'refresh_token', refresh, {
    httpOnly: true, secure: true, sameSite: 'None',
    path: REFRESH_COOKIE_PATH, maxAge: REFRESH_TOKEN_TTL_SECONDS,
  })
}

const RATE_LIMIT_MAX      = 5   // tentativas antes do bloqueio
const RATE_LIMIT_MINUTES  = 15  // minutos de bloqueio

// Le as chaves de rate limit e devolve o bloqueio ativo mais distante, se houver.
// Compartilhado por /login e /forgot-password — a regra de bloqueio e a mesma,
// so muda a chave.
async function readActiveLock(db, keys, now = new Date()) {
  const linhas = await Promise.all(keys.map((key) =>
    db.prepare('SELECT attempts, locked_until FROM login_rate_limit WHERE key = ?').bind(key).first()
  ))

  const bloqueiosAtivos = linhas
    .map((linha) => (linha?.locked_until ? new Date(linha.locked_until) : null))
    .filter((data) => data && data > now)
    .sort((a, b) => b - a)

  return { linhas, activeLock: bloqueiosAtivos[0] ?? null }
}

function tooManyAttempts(c, activeLock, mensagem, now = new Date()) {
  const retryAfterSeconds = Math.ceil((activeLock - now) / 1000)
  return c.json({ error: mensagem }, 429, { 'Retry-After': String(retryAfterSeconds) })
}

async function bumpRateLimit(db, key, currentAttempts) {
  const attempts = currentAttempts + 1
  const lockedUntil = attempts >= RATE_LIMIT_MAX
    ? new Date(Date.now() + RATE_LIMIT_MINUTES * 60 * 1000).toISOString()
    : null

  await db.prepare(`
    INSERT INTO login_rate_limit (key, attempts, locked_until, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      attempts     = excluded.attempts,
      locked_until = excluded.locked_until,
      updated_at   = excluded.updated_at
  `).bind(key, attempts, lockedUntil).run()
}

// ── POST /api/auth/login ──────────────────────────────────────
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'Email e senha são obrigatórios' }, 400)
  }

  // Rate limiting por IP e por email — bloqueia se qualquer uma das duas chaves estourar
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const emailKey = `email:${email.toLowerCase().trim()}`
  const ipKey = `ip:${ip}`

  const now = new Date()
  const { linhas: [rlIp, rlEmail], activeLock } = await readActiveLock(c.env.DB, [ipKey, emailKey], now)

  if (activeLock) {
    return tooManyAttempts(c, activeLock, `Muitas tentativas de login. Aguarde ${RATE_LIMIT_MINUTES} minutos.`, now)
  }

  const agent = await c.env.DB.prepare(
    'SELECT * FROM agents WHERE email = ? AND is_active = 1'
  ).bind(email.toLowerCase().trim()).first()

  // Verificação de senha usando Web Crypto (bcrypt não disponível no Worker).
  // Sempre roda o PBKDF2 (com hash real ou dummy) para nao vazar por timing se o email existe.
  const valid = await verifyPassword(password, agent ? agent.password_hash : DUMMY_HASH)

  if (!agent || !valid) {
    await Promise.all([
      bumpRateLimit(c.env.DB, ipKey, rlIp?.attempts || 0),
      bumpRateLimit(c.env.DB, emailKey, rlEmail?.attempts || 0),
    ])

    return c.json({ error: 'Credenciais inválidas' }, 401)
  }

  // Login bem-sucedido — zerar contadores
  await Promise.all([
    c.env.DB.prepare('DELETE FROM login_rate_limit WHERE key = ?').bind(ipKey).run(),
    c.env.DB.prepare('DELETE FROM login_rate_limit WHERE key = ?').bind(emailKey).run(),
  ])

  let access, refresh
  try {
    access = await signAccessToken(
      { sub: agent.id, email: agent.email, role: agent.role, name: agent.name },
      c.env.JWT_SECRET
    )
    refresh = await signRefreshToken({ sub: agent.id }, c.env.JWT_REFRESH_SECRET)
  } catch (err) {
    console.error('[auth/login] token generation failed', err)
    return c.json({ error: 'Falha ao gerar sessão' }, 500)
  }

  setSessionCookies(c, access, refresh)

  return c.json({
    agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role, avatar_url: agent.avatar_url || null }
  })
})

// ── POST /api/auth/refresh ────────────────────────────────────
// Renova o access token a partir do refresh token (cookie escopado
// so a esta rota). Le o agente de novo no banco pra refletir
// mudanca de role/desativacao sem esperar o refresh token expirar.
auth.post('/refresh', async (c) => {
  const refreshToken = readCookie(c.req.header('Cookie'), 'refresh_token')
  if (!refreshToken) return c.json({ error: 'Sessão expirada' }, 401)

  let payload
  try {
    payload = await verifyToken(refreshToken, c.env.JWT_REFRESH_SECRET)
  } catch {
    return c.json({ error: 'Sessão expirada' }, 401)
  }
  if (payload.type !== 'refresh') return c.json({ error: 'Sessão expirada' }, 401)

  const agent = await c.env.DB.prepare(
    'SELECT id, name, email, role, avatar_url, is_active FROM agents WHERE id = ?'
  ).bind(payload.sub).first()

  if (!agent || !agent.is_active) return c.json({ error: 'Sessão expirada' }, 401)

  const access = await signAccessToken(
    { sub: agent.id, email: agent.email, role: agent.role, name: agent.name },
    c.env.JWT_SECRET
  )
  setCookie(c, 'access_token', access, {
    httpOnly: true, secure: true, sameSite: 'None',
    path: '/', maxAge: ACCESS_TOKEN_TTL_SECONDS,
  })

  return c.json({
    agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role, avatar_url: agent.avatar_url || null }
  })
})

// ── POST /api/auth/logout ─────────────────────────────────────
auth.post('/logout', async (c) => {
  deleteCookie(c, 'access_token', { path: '/' })
  deleteCookie(c, 'refresh_token', { path: REFRESH_COOKIE_PATH })
  return c.json({ success: true })
})

// ── GET /api/auth/me ──────────────────────────────────────────
auth.get('/me', authMiddleware, async (c) => {
  const { sub } = c.get('agent')
  const agent = await c.env.DB.prepare(
    'SELECT id, name, email, role, avatar_url, created_at FROM agents WHERE id = ?'
  ).bind(sub).first()

  if (!agent) return c.json({ error: 'Agente não encontrado' }, 404)
  return c.json(agent)
})

// ── POST /api/auth/change-password ───────────────────────────
auth.post('/change-password', authMiddleware, async (c) => {
  const { currentPassword, newPassword } = await c.req.json()
  const { sub } = c.get('agent')

  if (!currentPassword || !newPassword) {
    return c.json({ error: 'Campos obrigatórios ausentes' }, 400)
  }
  if (newPassword.length < 8) {
    return c.json({ error: 'Nova senha deve ter ao menos 8 caracteres' }, 400)
  }

  const agent = await c.env.DB.prepare(
    'SELECT password_hash FROM agents WHERE id = ?'
  ).bind(sub).first()

  const valid = await verifyPassword(currentPassword, agent.password_hash)
  if (!valid) return c.json({ error: 'Senha atual incorreta' }, 401)

  const newHash = await hashPassword(newPassword)
  await c.env.DB.prepare(
    'UPDATE agents SET password_hash = ? WHERE id = ?'
  ).bind(newHash, sub).run()

  return c.json({ success: true })
})

// ── Helpers de senha (PBKDF2 via Web Crypto) ─────────────────
// ── POST /api/auth/forgot-password ───────────────────────────
// Dispara o codigo de reset por e-mail. Responde SEMPRE o mesmo corpo, com ou
// sem conta correspondente: qualquer diferenca (mensagem, status, tempo) viraria
// um oraculo pra descobrir quais e-mails existem no sistema.
auth.post('/forgot-password', async (c) => {
  const { email } = await c.req.json().catch(() => ({}))
  const emailNormalizado = typeof email === 'string' ? email.toLowerCase().trim() : ''

  const respostaGenerica = () => c.json({
    success: true,
    message: 'Se houver uma conta com esse e-mail, o código foi enviado.',
  })

  if (!emailNormalizado) return respostaGenerica()

  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const ipKey = `reset:ip:${ip}`
  const emailKey = `reset:email:${emailNormalizado}`

  const now = new Date()
  const { linhas: [rlIp, rlEmail], activeLock } = await readActiveLock(c.env.DB, [ipKey, emailKey], now)

  if (activeLock) {
    // Unico desvio da resposta generica, e proposital: sem 429 o proprio envio
    // de e-mail vira a arma (flood na caixa da vitima + estouro da cota diaria).
    return tooManyAttempts(c, activeLock, `Muitos pedidos de redefinição. Aguarde ${RATE_LIMIT_MINUTES} minutos.`, now)
  }

  // Cada pedido conta, tendo conta ou nao — senao o limite so valeria pra e-mail
  // existente e viraria, ele mesmo, um detector de conta.
  await Promise.all([
    bumpRateLimit(c.env.DB, ipKey, rlIp?.attempts || 0),
    bumpRateLimit(c.env.DB, emailKey, rlEmail?.attempts || 0),
  ])

  const agent = await c.env.DB.prepare(
    'SELECT id, name, email FROM agents WHERE email = ? AND is_active = 1'
  ).bind(emailNormalizado).first()

  if (!agent) return respostaGenerica()

  // Conta que usa login sem dominio (o admin default nasce como "admin") nao tem
  // pra onde enviar. Falha silenciosa de proposito, mesma resposta generica.
  if (!agent.email.includes('@')) {
    console.warn('[auth/forgot-password] conta sem e-mail valido cadastrado:', agent.id)
    return respostaGenerica()
  }

  const codigo = generateResetCode()
  const codeHash = await hashResetCode(codigo)

  // Invalida o que estava vivo antes: pedir um codigo novo deve aposentar o
  // anterior, senao varios codigos validos convivem e multiplicam as chances
  // de acerto por adivinhacao.
  await c.env.DB.prepare(`
    UPDATE password_reset_codes SET used_at = datetime('now')
    WHERE agent_id = ? AND used_at IS NULL
  `).bind(agent.id).run()

  await c.env.DB.prepare(`
    INSERT INTO password_reset_codes (agent_id, code_hash, expires_at)
    VALUES (?, ?, ?)
  `).bind(agent.id, codeHash, resetCodeExpiryIso(now)).run()

  const { subject, html } = buildResetCodeEmail({
    nomeDoAgente: agent.name,
    codigo,
    minutosDeValidade: CODE_TTL_MINUTES,
  })

  try {
    await sendEmail(c.env, { to: agent.email, subject, html })
  } catch (falhaNoEnvio) {
    // O codigo ja esta gravado; so a entrega falhou. Nao vaza isso na resposta —
    // o erro real vai pro log (e pra aba de Logs, se virar 500 em outro ponto).
    console.error('[auth/forgot-password] falha ao enviar e-mail', falhaNoEnvio)
  }

  return respostaGenerica()
})

// ── POST /api/auth/reset-password ────────────────────────────
// Fecha o fluxo: valida o codigo recebido por e-mail e grava a senha nova.
auth.post('/reset-password', async (c) => {
  const { email, code, newPassword } = await c.req.json().catch(() => ({}))
  const emailNormalizado = typeof email === 'string' ? email.toLowerCase().trim() : ''
  const codigoInformado = typeof code === 'string' ? code.trim() : ''

  if (!emailNormalizado || !codigoInformado || !newPassword) {
    return c.json({ error: 'Informe e-mail, código e nova senha' }, 400)
  }
  if (!isStrongEnoughPassword(newPassword)) {
    return c.json({ error: 'Nova senha deve ter ao menos 8 caracteres' }, 400)
  }

  // Mensagem unica pra codigo errado, expirado, ja usado ou conta inexistente:
  // distinguir os casos diria ao atacante em qual metade do problema ele esta.
  const codigoInvalido = () => c.json({ error: 'Código inválido ou expirado' }, 400)

  const agent = await c.env.DB.prepare(
    'SELECT id FROM agents WHERE email = ? AND is_active = 1'
  ).bind(emailNormalizado).first()

  if (!agent) return codigoInvalido()

  const registro = await c.env.DB.prepare(`
    SELECT id, code_hash, expires_at, attempts, used_at
    FROM password_reset_codes
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(agent.id).first()

  if (!isResetCodeUsable(registro)) return codigoInvalido()

  const hashInformado = await hashResetCode(codigoInformado)
  if (!timingSafeEqualHex(hashInformado, registro.code_hash)) {
    await c.env.DB.prepare(
      'UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?'
    ).bind(registro.id).run()
    return codigoInvalido()
  }

  const novoHash = await hashPassword(newPassword)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE agents SET password_hash = ? WHERE id = ?').bind(novoHash, agent.id),
    c.env.DB.prepare("UPDATE password_reset_codes SET used_at = datetime('now') WHERE id = ?").bind(registro.id),
    // Sem isso, quem acabou de redefinir a senha ainda pegaria o 429 das
    // tentativas que o fizeram esquecer/errar antes.
    c.env.DB.prepare('DELETE FROM login_rate_limit WHERE key IN (?, ?)')
      .bind(`email:${emailNormalizado}`, `reset:email:${emailNormalizado}`),
  ])

  return c.json({ success: true })
})

export async function hashPassword(password) {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const hashArr = Array.from(new Uint8Array(bits))
  const saltArr = Array.from(salt)
  return JSON.stringify({ salt: saltArr, hash: hashArr })
}

// Hash valido (mas de senha impossivel de adivinhar) usado so para equalizar
// o tempo de resposta quando o email nao existe — nunca corresponde a uma senha real.
const DUMMY_HASH = JSON.stringify({
  salt: Array.from({ length: 16 }, (_, i) => i),
  hash: Array.from({ length: 32 }, (_, i) => i * 7 % 256),
})

export async function verifyPassword(password, stored) {
  // Suporte ao placeholder do schema inicial
  if (stored === '$PLACEHOLDER_HASH$') stored = DUMMY_HASH
  try {
    const { salt, hash } = JSON.parse(stored)
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' },
      keyMaterial, 256
    )
    const derived = Array.from(new Uint8Array(bits))
    return timingSafeEqualBytes(derived, hash)
  } catch {
    return false
  }
}

function timingSafeEqualBytes(a, b) {
  const length = Math.max(a.length, b.length)
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

export default auth
