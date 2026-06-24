import { Hono } from 'hono'
import { hashPassword } from './auth.js'

const setup = new Hono()

// Disponível apenas fora de produção
setup.use('*', async (c, next) => {
  if (c.env.APP_ENV === 'production') {
    return c.json({ error: 'Not available in production' }, 403)
  }
  await next()
})

// POST /api/setup/admin
// Cria (ou sobrescreve) o usuário admin padrão
setup.post('/admin', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name     = body.name  || 'Administrador'
  const email    = body.email
  const password = body.password

  if (!email || !password) {
    return c.json({ error: 'Email e senha são obrigatórios' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'Senha deve ter ao menos 8 caracteres' }, 400)
  }

  const hash = await hashPassword(password)

  await c.env.DB.prepare(`
    INSERT INTO agents (id, name, email, password_hash, role)
    VALUES ('admin-default-0000-0000-000000000001', ?, ?, ?, 'admin')
    ON CONFLICT(id) DO UPDATE SET
      name          = excluded.name,
      email         = excluded.email,
      password_hash = excluded.password_hash
  `).bind(name, email.toLowerCase(), hash).run()

  return c.json({ success: true, message: `Admin criado: ${email}` })
})

export default setup
