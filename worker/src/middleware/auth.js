// ── Gera token JWT ────────────────────────────────────────────
export async function signToken(payload, secret) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const claims = {
    ...payload,
    iat: now,
    exp: now + 8 * 60 * 60,
  }

  return signJwtParts(header, claims, secret)
}

// ── Middleware: valida JWT em rotas protegidas ────────────────
export async function authMiddleware(c, next) {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Não autenticado' }, 401)
  }
  const token = header.slice(7)
  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET)
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

async function verifyToken(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token')

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const data = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = await signHmac(data, secret)

  if (!timingSafeEqual(expectedSignature, encodedSignature)) {
    throw new Error('Invalid signature')
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload))
  const now = Math.floor(Date.now() / 1000)

  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('Expired token')
  }

  return payload
}

async function signJwtParts(header, payload, secret) {
  const encodedHeader = encodeBase64Url(JSON.stringify(header))
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const data = `${encodedHeader}.${encodedPayload}`
  const signature = await signHmac(data, secret)
  return `${data}.${signature}`
}

async function signHmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  )

  return bytesToBase64Url(new Uint8Array(signature))
}

function encodeBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value))
}

function decodeBase64Url(value) {
  const bytes = base64UrlToBytes(value)
  return new TextDecoder().decode(bytes)
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false

  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
