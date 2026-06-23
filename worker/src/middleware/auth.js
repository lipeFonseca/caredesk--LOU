import { SignJWT, jwtVerify } from 'jose'

// ── Gera token JWT ────────────────────────────────────────────
export async function signToken(payload, secret) {
  const key = new TextEncoder().encode(secret)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(key)
}

// ── Middleware: valida JWT em rotas protegidas ────────────────
export async function authMiddleware(c, next) {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Não autenticado' }, 401)
  }
  const token = header.slice(7)
  try {
    const key = new TextEncoder().encode(c.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, key)
    c.set('agent', payload)
    await next()
  } catch {
    return c.json({ error: 'Token inválido ou expirado' }, 401)
  }
}

// ── Middleware: apenas admins ─────────────────────────────────
export async function adminOnly(c, next) {
  const agent = c.get('agent')
  if (agent?.role !== 'admin') {
    return c.json({ error: 'Acesso restrito a administradores' }, 403)
  }
  await next()
}
