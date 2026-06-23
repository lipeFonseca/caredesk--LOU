import { Hono } from 'hono'
import { signToken, authMiddleware } from '../middleware/auth.js'

const auth = new Hono()

// ── POST /api/auth/login ──────────────────────────────────────
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'Email e senha são obrigatórios' }, 400)
  }

  const agent = await c.env.DB.prepare(
    'SELECT * FROM agents WHERE email = ? AND is_active = 1'
  ).bind(email.toLowerCase().trim()).first()

  if (!agent) {
    return c.json({ error: 'Credenciais inválidas' }, 401)
  }

  // Verificação de senha usando Web Crypto (bcrypt não disponível no Worker)
  const valid = await verifyPassword(password, agent.password_hash)
  if (!valid) {
    return c.json({ error: 'Credenciais inválidas' }, 401)
  }

  const token = await signToken(
    { sub: agent.id, email: agent.email, role: agent.role, name: agent.name },
    c.env.JWT_SECRET
  )

  return c.json({
    token,
    agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role }
  })
})

// ── GET /api/auth/me ──────────────────────────────────────────
auth.get('/me', authMiddleware, async (c) => {
  const { sub } = c.get('agent')
  const agent = await c.env.DB.prepare(
    'SELECT id, name, email, role, telegram_chat_id, created_at FROM agents WHERE id = ?'
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
