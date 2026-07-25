import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { hashPassword } from './auth.js'
import {
  buildAssetResponse,
  deleteAssetIfPresent,
  putImageAsset,
  sanitizeScopedAssetKey,
} from '../utils/storage.js'
import { sanitizeOptionalPhone } from '../utils/contactFields.js'

const agents = new Hono()

agents.get('/avatar/:key', async (c) => {
  if (!c.env.LOGO_BUCKET) {
    return c.json({ error: 'Storage de avatars nao configurado' }, 503)
  }

  const key = sanitizeScopedAssetKey(c.req.param('key'), ['avatars/agents'])
  if (!key) return c.json({ error: 'Avatar nao encontrado' }, 404)

  const response = await buildAssetResponse(c.env.LOGO_BUCKET, key)
  if (!response) return c.json({ error: 'Avatar nao encontrado' }, 404)
  return response
})

agents.use('*', authMiddleware)

// ── GET /api/agents ───────────────────────────────────────────
agents.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, email, phone, role, is_active, avatar_url, created_at FROM agents ORDER BY name'
  ).all()
  return c.json(results)
})

// ── POST /api/agents (admin only) ────────────────────────────
agents.post('/', adminOnly, async (c) => {
  const { name, email, password, role, phone } = await c.req.json()

  if (!name || !email || !password) {
    return c.json({ error: 'Nome, email e senha são obrigatórios' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'Senha deve ter ao menos 8 caracteres' }, 400)
  }

  // Celular e opcional; o e-mail acima nao passa por aqui porque e credencial de
  // login, com regra propria (unicidade + lowercase).
  const celular = sanitizeOptionalPhone(phone)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM agents WHERE email = ?'
  ).bind(email.toLowerCase()).first()
  if (existing) return c.json({ error: 'Email já cadastrado' }, 409)

  const id = crypto.randomUUID()
  const hash = await hashPassword(password)

  await c.env.DB.prepare(`
    INSERT INTO agents (id, name, email, phone, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id, name, email.toLowerCase(),
    celular,
    hash,
    role || 'agent'
  ).run()

  return c.json({
    id, name, email: email.toLowerCase(), phone: celular, role: role || 'agent', avatar_url: null
  }, 201)
})

// ── PATCH /api/agents/:id (admin only) ───────────────────────
agents.patch('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const allowed = ['name','email','phone','role','is_active']
  const fields = Object.keys(body).filter(k => allowed.includes(k))
  if (!fields.length) return c.json({ error: 'Nenhum campo válido' }, 400)

  const sets = fields.map(f => `${f} = ?`).join(', ')
  const values = fields.map((f) => (f === 'phone' ? sanitizeOptionalPhone(body[f]) : body[f]))
  await c.env.DB.prepare(
    `UPDATE agents SET ${sets} WHERE id = ?`
  ).bind(...values, id).run()

  return c.json({ success: true })
})

agents.post('/:id/avatar', adminOnly, async (c) => {
  const id = c.req.param('id')

  if (!c.env.LOGO_BUCKET) {
    return c.json({ error: 'Storage de avatars nao configurado no Worker' }, 503)
  }

  const existingAgent = await c.env.DB.prepare(
    'SELECT id, avatar_storage_key FROM agents WHERE id = ?'
  ).bind(id).first()
  if (!existingAgent) return c.json({ error: 'Agente nao encontrado' }, 404)

  const formData = await c.req.formData()
  const file = formData.get('file') || formData.get('avatar')

  let objectKey
  try {
    const stored = await putImageAsset(c.env.LOGO_BUCKET, file, {
      folder: 'avatars/agents',
      maxSizeMb: 3,
    })
    objectKey = stored.objectKey
  } catch (err) {
    return c.json({ error: err.message || 'Nao foi possivel enviar o avatar' }, 400)
  }

  await deleteAssetIfPresent(c.env.LOGO_BUCKET, existingAgent.avatar_storage_key)

  const avatarUrl = new URL(`/api/agents/avatar/${encodeURIComponent(objectKey)}`, c.req.url).toString()
  await c.env.DB.prepare(
    'UPDATE agents SET avatar_url = ?, avatar_storage_key = ? WHERE id = ?'
  ).bind(avatarUrl, objectKey, id).run()

  return c.json({ success: true, avatar_url: avatarUrl })
})

agents.delete('/:id/avatar', adminOnly, async (c) => {
  const id = c.req.param('id')

  const existingAgent = await c.env.DB.prepare(
    'SELECT id, avatar_storage_key FROM agents WHERE id = ?'
  ).bind(id).first()
  if (!existingAgent) return c.json({ error: 'Agente nao encontrado' }, 404)

  await deleteAssetIfPresent(c.env.LOGO_BUCKET, existingAgent.avatar_storage_key)

  await c.env.DB.prepare(
    'UPDATE agents SET avatar_url = NULL, avatar_storage_key = NULL WHERE id = ?'
  ).bind(id).run()

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
