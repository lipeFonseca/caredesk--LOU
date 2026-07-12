import { Hono } from 'hono'
import { signToken, authMiddleware } from '../middleware/auth.js'

const auth = new Hono()

const RATE_LIMIT_MAX      = 5   // tentativas antes do bloqueio
const RATE_LIMIT_MINUTES  = 15  // minutos de bloqueio

// ── POST /api/auth/login ──────────────────────────────────────
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'Email e senha são obrigatórios' }, 400)
  }

  // Rate limiting por IP
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const rl = await c.env.DB.prepare(
    'SELECT attempts, locked_until FROM login_rate_limit WHERE key = ?'
  ).bind(ip).first()

  if (rl?.locked_until && new Date(rl.locked_until) > new Date()) {
    return c.json({ error: 'Muitas tentativas de login. Aguarde 15 minutos.' }, 429)
  }

  const agent = await c.env.DB.prepare(
    'SELECT * FROM agents WHERE email = ? AND is_active = 1'
  ).bind(email.toLowerCase().trim()).first()

  // Verificação de senha usando Web Crypto (bcrypt não disponível no Worker)
  const valid = agent ? await verifyPassword(password, agent.password_hash) : false

  if (!agent || !valid) {
    // Incrementar contador de tentativas
    const attempts = (rl?.attempts || 0) + 1
    const lockedUntil = attempts >= RATE_LIMIT_MAX
      ? new Date(Date.now() + RATE_LIMIT_MINUTES * 60 * 1000).toISOString()
      : null
    await c.env.DB.prepare(`
      INSERT INTO login_rate_limit (key, attempts, locked_until, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        attempts     = excluded.attempts,
        locked_until = excluded.locked_until,
        updated_at   = excluded.updated_at
    `).bind(ip, attempts, lockedUntil).run()

    return c.json({ error: 'Credenciais inválidas' }, 401)
  }

  // Login bem-sucedido — zerar contador
  await c.env.DB.prepare(
    'DELETE FROM login_rate_limit WHERE key = ?'
  ).bind(ip).run()

  let token
  try {
    token = await signToken(
      { sub: agent.id, email: agent.email, role: agent.role, name: agent.name },
      c.env.JWT_SECRET
    )
  } catch (err) {
    console.error('[auth/login] token generation failed', err)
    return c.json({ error: 'Falha ao gerar sessão' }, 500)
  }

  return c.json({
    token,
    agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role, avatar_url: agent.avatar_url || null }
  })
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

export async function verifyPassword(password, stored) {
  // Suporte ao placeholder do schema inicial
  if (stored === '$PLACEHOLDER_HASH$') return false
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
    return derived.every((b, i) => b === hash[i])
  } catch {
    return false
  }
}

export default auth
