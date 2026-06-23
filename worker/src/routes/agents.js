import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { hashPassword } from './auth.js'

const agents = new Hono()
agents.use('*', authMiddleware)

// ── GET /api/agents ───────────────────────────────────────────
agents.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, email, role, telegram_chat_id, is_active, created_at FROM agents ORDER BY name'
  ).all()
  return c.json(results)
})

// ── POST /api/agents (admin only) ────────────────────────────
agents.post('/', adminOnly, async (c) => {
  const { name, email, password, role, telegram_chat_id } = await c.req.json()

  if (!name || !email || !password) {
    return c.json({ error: 'Nome, email e senha são obrigatórios' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'Senha deve ter ao menos 8 caracteres' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM agents WHERE email = ?'
  ).bind(email.toLowerCase()).first()
  if (existing) return c.json({ error: 'Email já cadastrado' }, 409)

  const id = crypto.randomUUID()
  const hash = await hashPassword(password)

  await c.env.DB.prepare(`
    INSERT INTO agents (id, name, email, password_hash, role, telegram_chat_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id, name, email.toLowerCase(),
    hash,
    role || 'agent',
    telegram_chat_id || null
  ).run()

  return c.json({
    id, name, email: email.toLowerCase(), role: role || 'agent'
  }, 201)
})

// ── PATCH /api/agents/:id (admin only) ───────────────────────
agents.patch('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const allowed = ['name','email','role','telegram_chat_id','is_active']
  const fields = Object.keys(body).filter(k => allowed.includes(k))
  if (!fields.length) return c.json({ error: 'Nenhum campo válido' }, 400)

  const sets = fields.map(f => `${f} = ?`).join(', ')
  await c.env.DB.prepare(
    `UPDATE agents SET ${sets} WHERE id = ?`
  ).bind(...fields.map(f => body[f]), id).run()

  return c.json({ success: true })
})

// ── POST /api/agents/:id/reset-password (admin only) ─────────
agents.post('/:id/reset-password', adminOnly, async (c) => {
  const id = c.req.param('id')
  const { newPassword } = await c.req.json()

  if (!newPassword || newPassword.length < 8) {
    return c.json({ error: 'Senha deve ter ao menos 8 caracteres' }, 400)
  }

  const hash = await hashPassword(newPassword)
  await c.env.DB.prepare(
    'UPDATE agents SET password_hash = ? WHERE id = ?'
  ).bind(hash, id).run()

  return c.json({ success: true })
})

export default agents
